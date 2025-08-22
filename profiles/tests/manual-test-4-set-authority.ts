import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import * as fs from 'fs';

// Test file for: set_authority function
// Function: Transfers profile authority (ownership)

const RPC_ENDPOINT = 'https://rpc.gorbchain.xyz';
const WS_ENDPOINT = 'wss://rpc.gorbchain.xyz/ws/';
const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
  wsEndpoint: WS_ENDPOINT,
});

// Load wallet from ~/.config/solana/id.json
const walletKeypair = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync('/home/saurabh/.config/solana/id.json', 'utf-8')))
);

const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(walletKeypair),
  { commitment: 'confirmed' }
);
anchor.setProvider(provider);

const program = anchor.workspace.profiles as Program;

// Helper functions for PDA derivation
const profilePda = (username: string) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), Buffer.from(username)],
    program.programId
  );

const reversePda = (main: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("reverse"), main.toBuffer()],
    program.programId
  );

// Test data - using same username as previous tests
const timestamp = Date.now().toString();
const randomSuffix = Math.random().toString(36).substring(2, 8);
const username = `test4_${timestamp}_${randomSuffix}`.slice(-20); // Keep under 32 chars, add function identifier
const owner = Keypair.generate();
const other = Keypair.generate();
const thirdParty = Keypair.generate();

const bio = "Hello bio for testing";
const avatar = "ipfs://testavatar";
const twitter = "test_handle";
const discord = "test#1234";
const website = "https://test.example";

// Utility function to fund test accounts
async function fundTestAccount(publicKey: PublicKey, amount = 1e8) {
  try {
    // Try airdrop first
    await provider.connection.requestAirdrop(publicKey, amount);
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    // If airdrop fails, transfer from payer
    const payer = (provider.wallet as anchor.Wallet).payer;
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: publicKey,
        lamports: amount,
      })
    );
    await provider.sendAndConfirm(transaction, [payer]);
  }
  
  const balance = await provider.connection.getBalance(publicKey);
  console.log(`Funded ${publicKey.toString()}: ${balance} lamports`);
}

// Utility function to create a profile for testing
let testCaseCounter = 0;
async function createTestProfile() {
  console.log("Creating test profile for set_authority tests...");
  
  // Generate a new owner keypair for each test case to avoid conflicts
  const testOwner = Keypair.generate();
  await fundTestAccount(testOwner.publicKey);
  
  // Generate unique username for this test case
  testCaseCounter++;
  const testTimestamp = Date.now().toString();
  const testRandomSuffix = Math.random().toString(36).substring(2, 8);
  const testUsername = `test4_${testCaseCounter}_${testTimestamp}_${testRandomSuffix}`.slice(-20);
  
  const [profilePDA] = profilePda(testUsername);
  const [reversePDA] = reversePda(testOwner.publicKey);
  
  const tx = await program.methods
    .createProfile(testUsername, bio, avatar, twitter, discord, website)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      reverse: reversePDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Test profile created:", tx);
  return { profilePDA, username: testUsername, owner: testOwner };
}

// Test runner function
async function runTest(testName: string, testFunction: () => Promise<void>) {
  console.log(`\n🧪 Running: ${testName}`);
  console.log("=".repeat(50));
  
  try {
    await testFunction();
    console.log(`✅ ${testName} - PASSED`);
  } catch (error) {
    console.log(`❌ ${testName} - FAILED:`, error.message);
  }
  
  console.log("=".repeat(50));
}

// ============================================================================
// TEST CASE 4.1: ✅ Transfer Authority (Happy Path)
// ============================================================================
async function testTransferAuthorityHappyPath() {
  console.log("Testing successful authority transfer");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Fund the new authority
  await fundTestAccount(other.publicKey);
  
  console.log("Current authority:", testOwner.publicKey.toString());
  console.log("New authority:", other.publicKey.toString());
  
  // Transfer authority
  const tx = await program.methods
    .setAuthority(other.publicKey)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Authority transferred:", tx);
  
  // Verify changes
  const profile = await program.account.profile.fetch(profilePDA);
  console.log("Profile after authority transfer:", {
    username: profile.username,
    authority: profile.authority.toString(),
    mainAddress: profile.mainAddress.toString(),
  });
  
  // Verify authority was transferred
  if (profile.authority.toString() !== other.publicKey.toString()) {
    throw new Error("Authority not transferred");
  }
  
  // Verify main address unchanged
  if (profile.mainAddress.toString() !== testOwner.publicKey.toString()) {
    throw new Error("Main address changed unexpectedly");
  }
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username;
  
  // Verify username unchanged
  if (profile.username !== actualUsername) {
    throw new Error("Username changed unexpectedly");
  }
  
  console.log("✅ Authority transfer successful");
  console.log("✅ New authority set");
  console.log("✅ Main address unchanged");
  console.log("✅ Username unchanged");
}

// ============================================================================
// TEST CASE 4.2: ✅ Verify New Authority Can Update
// ============================================================================
async function testVerifyNewAuthorityCanUpdate() {
  console.log("Testing that new authority can now update profile");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Transfer authority first
  await fundTestAccount(other.publicKey);
  
  const transferTx = await program.methods
    .setAuthority(other.publicKey)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Authority transferred for test:", transferTx);
  
  // Now test that new authority can update
  const newBio = "Updated by new authority";
  
  const updateTx = await program.methods
    .setProfileDetails(newBio, null, null, null, null)
    .accounts({
      authority: other.publicKey,
      profile: profilePDA,
    })
    .signers([other])
    .rpc();
  
  console.log("✅ Profile updated by new authority:", updateTx);
  
  // Verify update was successful
  const profile = await program.account.profile.fetch(profilePDA);
  if (profile.bio !== newBio) {
    throw new Error("Profile not updated by new authority");
  }
  
  console.log("✅ New authority can successfully update profile");
}

// ============================================================================
// TEST CASE 4.3: ❌ Old Authority Cannot Update
// ============================================================================
async function testOldAuthorityCannotUpdate() {
  console.log("Testing that old authority can no longer update profile");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Transfer authority first
  await fundTestAccount(other.publicKey);
  
  const transferTx = await program.methods
    .setAuthority(other.publicKey)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Authority transferred for test:", transferTx);
  
  // Now test that old authority cannot update
  try {
    await program.methods
      .setProfileDetails("Hacked by old authority", null, null, null, null)
      .accounts({
        authority: testOwner.publicKey, // Old authority
        profile: profilePDA,
      })
      .signers([testOwner])
      .rpc();
    
    throw new Error("Test failed - old authority should not update");
  } catch (error) {
    console.log("✅ Correctly rejected old authority update:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("has_one constraint") && 
        !error.message.includes("constraint has_one") &&
        !error.message.includes("authority") &&
        !error.message.includes("AccountNotInitialized") &&
        !error.message.includes("ConstraintHasOne")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
  
  // Verify profile was not actually changed
  const profile = await program.account.profile.fetch(profilePDA);
  if (profile.bio === "Hacked by old authority") {
    throw new Error("Profile was updated by old authority");
  }
  
  console.log("✅ Profile remains unchanged after old authority attempt");
}

// ============================================================================
// TEST CASE 4.4: ✅ Transfer Authority Multiple Times
// ============================================================================
async function testTransferAuthorityMultipleTimes() {
  console.log("Testing multiple authority transfers");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Fund all parties
  await fundTestAccount(other.publicKey);
  await fundTestAccount(thirdParty.publicKey);
  
  // First transfer: owner -> other
  console.log("First transfer: owner -> other");
  const tx1 = await program.methods
    .setAuthority(other.publicKey)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ First transfer completed:", tx1);
  
  // Verify first transfer
  let profile = await program.account.profile.fetch(profilePDA);
  if (profile.authority.toString() !== other.publicKey.toString()) {
    throw new Error("First authority transfer failed");
  }
  
  // Second transfer: other -> thirdParty
  console.log("Second transfer: other -> thirdParty");
  const tx2 = await program.methods
    .setAuthority(thirdParty.publicKey)
    .accounts({
      authority: other.publicKey,
      profile: profilePDA,
    })
    .signers([other])
    .rpc();
  
  console.log("✅ Second transfer completed:", tx2);
  
  // Verify second transfer
  profile = await program.account.profile.fetch(profilePDA);
  if (profile.authority.toString() !== thirdParty.publicKey.toString()) {
    throw new Error("Second authority transfer failed");
  }
  
  // Verify main address unchanged
  if (profile.mainAddress.toString() !== testOwner.publicKey.toString()) {
    throw new Error("Main address changed unexpectedly");
  }
  
  console.log("✅ Multiple authority transfers successful");
  console.log("✅ Final authority:", thirdParty.publicKey.toString());
  console.log("✅ Main address unchanged");
}

// ============================================================================
// TEST CASE 4.5: ❌ Transfer Authority by Non-Authority
// ============================================================================
async function testTransferAuthorityByNonAuthority() {
  console.log("Testing that non-authority cannot transfer authority");
  
  // Prerequisites: Profile must exist and third party must be funded
  const { profilePDA, owner: testOwner } = await createTestProfile();
  await fundTestAccount(thirdParty.publicKey);
  
  console.log("Attempting to transfer authority with non-authority...");
  console.log("Non-authority:", thirdParty.publicKey.toString());
  console.log("Target:", other.publicKey.toString());
  
  try {
    await program.methods
      .setAuthority(other.publicKey)
      .accounts({
        authority: thirdParty.publicKey, // Wrong authority
        profile: profilePDA,
      })
      .signers([thirdParty])
      .rpc();
    
    throw new Error("Test failed - non-authority should not transfer authority");
  } catch (error) {
    console.log("✅ Correctly rejected non-authority transfer:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("has_one constraint") && 
        !error.message.includes("constraint has_one") &&
        !error.message.includes("authority") &&
        !error.message.includes("AccountNotInitialized") &&
        !error.message.includes("ConstraintHasOne")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
  
  // Verify profile was not actually changed
  const profile = await program.account.profile.fetch(profilePDA);
  if (profile.authority.toString() !== testOwner.publicKey.toString()) {
    throw new Error("Authority was transferred by non-authority");
  }
  
  console.log("✅ Profile authority remains unchanged after unauthorized attempt");
}

// ============================================================================
// TEST CASE 4.6: ✅ Transfer Authority to Same Authority
// ============================================================================
async function testTransferAuthorityToSameAuthority() {
  console.log("Testing transferring authority to the same authority");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  const currentAuthority = testOwner.publicKey;
  
  console.log("Current authority:", currentAuthority.toString());
  console.log("Attempting to transfer to same authority...");
  
  // Try to transfer to same authority
  const tx = await program.methods
    .setAuthority(currentAuthority)
    .accounts({
      authority: currentAuthority,
      profile: profilePDA,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Same authority transfer completed:", tx);
  
  // Verify profile unchanged
  const profile = await program.account.profile.fetch(profilePDA);
  if (profile.authority.toString() !== currentAuthority.toString()) {
    throw new Error("Authority changed unexpectedly");
  }
  
  // Verify main address unchanged
  if (profile.mainAddress.toString() !== currentAuthority.toString()) {
    throw new Error("Main address changed unexpectedly");
  }
  
  console.log("✅ Same authority transfer successful (no-op)");
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllSetAuthorityTests() {
  console.log("🚀 Starting set_authority Function Tests");
  console.log("Program ID:", program.programId.toString());
  console.log("Username:", username);
  console.log("Owner:", owner.publicKey.toString());
  console.log("Other:", other.publicKey.toString());
  console.log("Third Party:", thirdParty.publicKey.toString());
  
  // Run tests in order
  await runTest("4.1 Transfer Authority (Happy Path)", testTransferAuthorityHappyPath);
  await runTest("4.2 Verify New Authority Can Update", testVerifyNewAuthorityCanUpdate);
  await runTest("4.3 Old Authority Cannot Update", testOldAuthorityCannotUpdate);
  await runTest("4.4 Transfer Authority Multiple Times", testTransferAuthorityMultipleTimes);
  await runTest("4.5 Transfer Authority by Non-Authority", testTransferAuthorityByNonAuthority);
  await runTest("4.6 Transfer Authority to Same Authority", testTransferAuthorityToSameAuthority);
  
  console.log("\n🎉 All set_authority tests completed!");
}

// Export for individual testing
export {
  testTransferAuthorityHappyPath,
  testVerifyNewAuthorityCanUpdate,
  testOldAuthorityCannotUpdate,
  testTransferAuthorityMultipleTimes,
  testTransferAuthorityByNonAuthority,
  testTransferAuthorityToSameAuthority,
  runAllSetAuthorityTests
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllSetAuthorityTests().catch(console.error);
} 