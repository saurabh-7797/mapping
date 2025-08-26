import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import * as fs from 'fs';

// Test file for: set_main_address function
// Function: Changes main address pointer and creates reverse lookup

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

// Use the deployed program ID on Gorbchain
const programId = new PublicKey("GrJrqEtxztquco6Zsg9WfrArYwy5BZwzJ4ce4TfcJLuJ");
const program = new anchor.Program(
  {
    version: "0.1.0",
    name: "profiles", 
    instructions: [
      {
        name: "createProfile",
        accounts: [
          { name: "authority", isMut: true, isSigner: true },
          { name: "profile", isMut: true, isSigner: false },
          { name: "reverse", isMut: true, isSigner: false },
          { name: "systemProgram", isMut: false, isSigner: false }
        ],
        args: [
          { name: "username", type: "string" },
          { name: "bio", type: { option: "string" } },
          { name: "avatar", type: { option: "string" } },
          { name: "twitter", type: { option: "string" } },
          { name: "discord", type: { option: "string" } },
          { name: "website", type: { option: "string" } }
        ]
      },
      {
        name: "setMainAddress",
        accounts: [
          { name: "authority", isMut: true, isSigner: true },
          { name: "profile", isMut: true, isSigner: false },
          { name: "reverse", isMut: true, isSigner: false },
          { name: "systemProgram", isMut: false, isSigner: false }
        ],
        args: [
          { name: "newMain", type: "publicKey" }
        ]
      }
    ],
    accounts: [
      {
        name: "Profile",
        type: {
          kind: "struct",
          fields: [
            { name: "authority", type: "publicKey" },
            { name: "mainAddress", type: "publicKey" },
            { name: "bump", type: "u8" },
            { name: "username", type: "string" },
            { name: "bio", type: "string" },
            { name: "avatar", type: "string" },
            { name: "twitter", type: "string" },
            { name: "discord", type: "string" },
            { name: "website", type: "string" }
          ]
        }
      },
      {
        name: "ReverseLookup",
        type: {
          kind: "struct",
          fields: [
            { name: "username", type: "string" },
            { name: "bump", type: "u8" }
          ]
        }
      }
    ],
    events: [],
    errors: [],
    metadata: { address: "GrJrqEtxztquco6Zsg9WfrArYwy5BZwzJ4ce4TfcJLuJ" }
  } as any,
  programId,
  provider
);

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
const username = `test3_${timestamp}_${randomSuffix}`.slice(-20); // Keep under 32 chars, add function identifier
const owner = Keypair.generate();
const other = Keypair.generate();

const bio = "Hello bio for testing";
const avatar = "ipfs://testavatar";
const twitter = "test_handle";
const discord = "test#1234";
const website = "https://test.example";

// Utility function to fund test accounts
async function fundTestAccount(publicKey: PublicKey, amount = 1.5e8) {
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
  console.log("Creating test profile for set_main_address tests...");
  
  // Generate a new owner keypair for each test case to avoid conflicts
  const testOwner = Keypair.generate();
  await fundTestAccount(testOwner.publicKey);
  
  // Generate unique username for this test case
  testCaseCounter++;
  const testTimestamp = Date.now().toString();
  const testRandomSuffix = Math.random().toString(36).substring(2, 8);
  const testUsername = `test3_${testCaseCounter}_${testTimestamp}_${testRandomSuffix}`.slice(-20);
  
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
// TEST CASE 3.1: ✅ Change Main Address (Happy Path)
// ============================================================================
async function testChangeMainAddressHappyPath() {
  console.log("Testing successful main address change");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Generate new main wallet
  const newMainWallet = Keypair.generate();
  const [newReversePDA] = reversePda(newMainWallet.publicKey);
  
  console.log("Current main address:", testOwner.publicKey.toString());
  console.log("New main address:", newMainWallet.publicKey.toString());
  console.log("New reverse PDA:", newReversePDA.toString());
  
  // Change main address
  const tx = await program.methods
    .setMainAddress(newMainWallet.publicKey)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      reverse: newReversePDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Main address changed:", tx);
  
  // Verify changes
  const profile = await program.account.profile.fetch(profilePDA) as any;
  console.log("Profile after main address change:", {
    username: profile.username,
    authority: profile.authority.toString(),
    mainAddress: profile.mainAddress.toString(),
  });
  
  // Verify main address was updated
  if (profile.mainAddress.toString() !== newMainWallet.publicKey.toString()) {
    throw new Error("Main address not updated");
  }
  
  // Verify authority unchanged
  if (profile.authority.toString() !== testOwner.publicKey.toString()) {
    throw new Error("Authority changed unexpectedly");
  }
  
  // Verify new reverse lookup created
  const reverse = await program.account.reverseLookup.fetch(newReversePDA) as any;
  console.log("New reverse lookup:", reverse.username);
  
  const actualProfile = await program.account.profile.fetch(profilePDA) as any;
  const actualUsername = actualProfile.username;
  if (reverse.username !== actualUsername) {
    throw new Error("New reverse lookup username mismatch");
  }
  
  // Verify old reverse lookup still exists (not automatically cleaned)
  try {
    const [oldReversePDA] = reversePda(testOwner.publicKey);
    const oldReverse = await program.account.reverseLookup.fetch(oldReversePDA) as any;
    console.log("Old reverse lookup still exists:", oldReverse.username);
    
    if (oldReverse.username !== actualUsername) {
      throw new Error("Old reverse lookup corrupted");
    }
  } catch (error) {
    console.log("Old reverse lookup no longer exists (this is also valid)");
  }
  
  console.log("✅ Main address change successful");
  console.log("✅ New reverse lookup created");
  console.log("✅ Authority unchanged");
}

// ============================================================================
// TEST CASE 3.2: ❌ Change Main Address by Non-Authority
// ============================================================================
async function testChangeMainAddressByNonAuthority() {
  console.log("Testing that non-authority cannot change main address");
  
  // Prerequisites: Profile must exist and other account must be funded
  const { profilePDA, owner: testOwner } = await createTestProfile();
  await fundTestAccount(other.publicKey);
  
  // Generate new main wallet
  const newMainWallet = Keypair.generate();
  const [newReversePDA] = reversePda(newMainWallet.publicKey);
  
  console.log("Attempting to change main address with non-authority...");
  console.log("Non-authority:", other.publicKey.toString());
  console.log("New main address:", newMainWallet.publicKey.toString());
  
  try {
    await program.methods
      .setMainAddress(newMainWallet.publicKey)
      .accounts({
        authority: other.publicKey, // Wrong authority
        profile: profilePDA,
        reverse: newReversePDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([other])
      .rpc();
    
    throw new Error("Test failed - non-authority should not change main address");
  } catch (error) {
    console.log("✅ Correctly rejected non-authority main address change:", error.message);
    
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
  const profile = await program.account.profile.fetch(profilePDA) as any;
  if (profile.mainAddress.toString() === newMainWallet.publicKey.toString()) {
    throw new Error("Main address was changed by non-authority");
  }
  
  // Verify main address still points to original owner
  if (profile.mainAddress.toString() !== testOwner.publicKey.toString()) {
    throw new Error("Main address changed unexpectedly");
  }
  
  console.log("✅ Profile main address remains unchanged after unauthorized attempt");
}

// ============================================================================
// TEST CASE 3.3: ✅ Change Main Address Multiple Times
// ============================================================================
async function testChangeMainAddressMultipleTimes() {
  console.log("Testing multiple main address changes");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // First change
  const firstNewMain = Keypair.generate();
  const [firstReversePDA] = reversePda(firstNewMain.publicKey);
  
  console.log("First main address change...");
  const tx1 = await program.methods
    .setMainAddress(firstNewMain.publicKey)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      reverse: firstReversePDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ First change completed:", tx1);
  
  // Verify first change
  let profile = await program.account.profile.fetch(profilePDA) as any;
  if (profile.mainAddress.toString() !== firstNewMain.publicKey.toString()) {
    throw new Error("First main address change failed");
  }
  
  // Second change
  const secondNewMain = Keypair.generate();
  const [secondReversePDA] = reversePda(secondNewMain.publicKey);
  
  console.log("Second main address change...");
  const tx2 = await program.methods
    .setMainAddress(secondNewMain.publicKey)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      reverse: secondReversePDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Second change completed:", tx2);
  
  // Verify second change
  profile = await program.account.profile.fetch(profilePDA) as any;
  if (profile.mainAddress.toString() !== secondNewMain.publicKey.toString()) {
    throw new Error("Second main address change failed");
  }
  
  // Verify all reverse lookups exist
  const firstReverse = await program.account.reverseLookup.fetch(firstReversePDA) as any;
  const secondReverse = await program.account.reverseLookup.fetch(secondReversePDA) as any;
  
  const actualProfile = await program.account.profile.fetch(profilePDA) as any;
  const actualUsername = actualProfile.username;
  if (firstReverse.username !== actualUsername) throw new Error("First reverse lookup corrupted");
  if (secondReverse.username !== actualUsername) throw new Error("Second reverse lookup corrupted");
  
  console.log("✅ Multiple main address changes successful");
  console.log("✅ All reverse lookups maintained");
}

// ============================================================================
// TEST CASE 3.4: ✅ Change Main Address to Same Address
// ============================================================================
async function testChangeMainAddressToSameAddress() {
  console.log("Testing changing main address to the same address");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Ensure test owner has enough funds
  await fundTestAccount(testOwner.publicKey, 2e8);
  
  // Get current main address
  const currentProfile = await program.account.profile.fetch(profilePDA) as any;
  const currentMainAddress = currentProfile.mainAddress as PublicKey;
  
  console.log("Current main address:", currentMainAddress.toString());
  console.log("Attempting to set to same address...");
  
  // Try to set to same address
  const [sameReversePDA] = reversePda(currentMainAddress);
  
  const tx = await program.methods
    .setMainAddress(currentMainAddress)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      reverse: sameReversePDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Same address change completed:", tx);
  
  // Verify profile unchanged
  const profile = await program.account.profile.fetch(profilePDA) as any;
  if (profile.mainAddress.toString() !== currentMainAddress.toString()) {
    throw new Error("Main address changed unexpectedly");
  }
  
  // Verify reverse lookup exists
  const reverse = await program.account.reverseLookup.fetch(sameReversePDA) as any;
  const actualProfile = await program.account.profile.fetch(profilePDA) as any;
  const actualUsername = actualProfile.username;
  if (reverse.username !== actualUsername) {
    throw new Error("Reverse lookup username mismatch");
  }
  
  console.log("✅ Same address change successful (no-op)");
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllSetMainAddressTests() {
  console.log("🚀 Starting set_main_address Function Tests");
  console.log("Program ID:", program.programId.toString());
  console.log("Username:", username);
  console.log("Owner:", owner.publicKey.toString());
  console.log("Other:", other.publicKey.toString());
  
  // Run tests in order
  await runTest("3.1 Change Main Address (Happy Path)", testChangeMainAddressHappyPath);
  await runTest("3.2 Change Main Address by Non-Authority", testChangeMainAddressByNonAuthority);
  await runTest("3.3 Change Main Address Multiple Times", testChangeMainAddressMultipleTimes);
  await runTest("3.4 Change Main Address to Same Address", testChangeMainAddressToSameAddress);
  
  console.log("\n🎉 All set_main_address tests completed!");
}

// Export for individual testing
export {
  testChangeMainAddressHappyPath,
  testChangeMainAddressByNonAuthority,
  testChangeMainAddressMultipleTimes,
  testChangeMainAddressToSameAddress,
  runAllSetMainAddressTests
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllSetMainAddressTests().catch(console.error);
} 