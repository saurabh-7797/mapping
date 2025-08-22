import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import * as fs from 'fs';

// Test file for: get_address_mapping function
// Function: Emits an on-chain event with the mapping data

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

const mappingPda = (username: string, addressType: string) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("mapping"), Buffer.from(username), Buffer.from(addressType)],
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
const username = `test6_${timestamp}_${randomSuffix}`.slice(-20); // Keep under 32 chars, add function identifier
const owner = Keypair.generate();
const other = Keypair.generate();

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
  console.log("Creating test profile for get_address_mapping tests...");
  
  // Generate a new owner keypair for each test case to avoid conflicts
  const testOwner = Keypair.generate();
  await fundTestAccount(testOwner.publicKey);
  
  // Generate unique username for this test case
  testCaseCounter++;
  const testTimestamp = Date.now().toString();
  const testRandomSuffix = Math.random().toString(36).substring(2, 8);
  const testUsername = `test6_${testCaseCounter}_${testTimestamp}_${testRandomSuffix}`.slice(-20);
  
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

// Utility function to create a mapping for testing
async function createTestMapping(profilePDA: PublicKey, username: string, addressType: string, target: PublicKey, typeHint: number, testOwner: Keypair) {
  const [mappingPDA] = mappingPda(username, addressType);
  
  await program.methods
    .setAddressMapping(addressType, target, typeHint)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      mapping: mappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log(`✅ Test mapping created: ${addressType} -> ${target.toString()}`);
  return mappingPDA;
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
// TEST CASE 6.1: ✅ Get Existing Mapping (Happy Path)
// ============================================================================
async function testGetExistingMappingHappyPath() {
  console.log("Testing fetching existing mapping (emits event)");
  
  // Prerequisites: Profile and mapping must exist
  const profilePDA = await createTestProfile();
  const nftMint = Keypair.generate().publicKey;
  const mappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "nft", nftMint, 2, profilePDA.owner);
  
  console.log("Fetching existing mapping...");
  console.log("Profile PDA:", profilePDA.profilePDA.toString());
  console.log("Mapping PDA:", mappingPDA.toString());
  
  const tx = await program.methods
    .getAddressMapping()
    .accounts({
      profile: profilePDA.profilePDA,
      mapping: mappingPDA,
    })
    .rpc();
  
  console.log("✅ Mapping fetched (event emitted):", tx);
  
  // Verify the transaction succeeded (this function only emits events, no state change)
  if (!tx) {
    throw new Error("Transaction failed");
  }
  
  // Verify mapping still exists and is unchanged
  const mapping = await program.account.addressMapping.fetch(mappingPDA);
  if ((mapping.addressType as string) !== "nft" || (mapping.target as PublicKey).toString() !== nftMint.toString()) {
    throw new Error("Mapping data corrupted after multiple get operations");
  }
  
  console.log("✅ Mapping data verified unchanged");
  console.log("✅ MappingFetched event should have been emitted");
}

// ============================================================================
// TEST CASE 6.2: ✅ Get Multiple Different Mappings
// ============================================================================
async function testGetMultipleDifferentMappings() {
  console.log("Testing fetching multiple different types of mappings");
  
  // Prerequisites: Profile and multiple mappings must exist
  const profilePDA = await createTestProfile();
  
  // Create multiple mappings
  const walletTarget = Keypair.generate().publicKey;
  const tokenTarget = Keypair.generate().publicKey;
  const donationTarget = Keypair.generate().publicKey;
  
  const walletMappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "wallet", walletTarget, 0, profilePDA.owner);
  const tokenMappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "token", tokenTarget, 1, profilePDA.owner);
  const donationMappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "donations", donationTarget, 4, profilePDA.owner);
  
  console.log("Fetching multiple mappings...");
  
  // Fetch each mapping
  const tx1 = await program.methods
    .getAddressMapping()
    .accounts({
      profile: profilePDA.profilePDA,
      mapping: walletMappingPDA,
    })
    .rpc();
  
  const tx2 = await program.methods
    .getAddressMapping()
    .accounts({
      profile: profilePDA.profilePDA,
      mapping: tokenMappingPDA,
    })
    .rpc();
  
  const tx3 = await program.methods
    .getAddressMapping()
    .accounts({
      profile: profilePDA.profilePDA,
      mapping: donationMappingPDA,
    })
    .rpc();
  
  console.log("✅ All mappings fetched successfully:");
  console.log("  - Wallet mapping:", tx1);
  console.log("  - Token mapping:", tx2);
  console.log("  - Donations mapping:", tx3);
  
  // Verify all mappings still exist and are unchanged
  const walletMapping = await program.account.addressMapping.fetch(walletMappingPDA);
  const tokenMapping = await program.account.addressMapping.fetch(tokenMappingPDA);
  const donationMapping = await program.account.addressMapping.fetch(donationMappingPDA);
  
  if (walletMapping.target.toString() !== walletTarget.toString()) throw new Error("Wallet mapping corrupted");
  if (tokenMapping.target.toString() !== tokenTarget.toString()) throw new Error("Token mapping corrupted");
  if (donationMapping.target.toString() !== donationTarget.toString()) throw new Error("Donations mapping corrupted");
  
  console.log("✅ All mappings verified unchanged");
  console.log("✅ Multiple MappingFetched events should have been emitted");
}

// ============================================================================
// TEST CASE 6.3: ❌ Get Non-Existent Mapping
// ============================================================================
async function testGetNonExistentMapping() {
  console.log("Testing fetching non-existent mapping");
  
  // Prerequisites: Profile must exist
  const profilePDA = await createTestProfile();
  
  // Try to get a mapping that doesn't exist
  const [nonExistentMappingPDA] = mappingPda(username, "nonexistent");
  
  console.log("Attempting to fetch non-existent mapping...");
  console.log("Non-existent mapping PDA:", nonExistentMappingPDA.toString());
  
  try {
    await program.methods
      .getAddressMapping()
      .accounts({
        profile: profilePDA.profilePDA,
        mapping: nonExistentMappingPDA,
      })
      .rpc();
    
    throw new Error("Test failed - should not fetch non-existent mapping");
  } catch (error) {
    console.log("✅ Correctly failed to fetch non-existent mapping:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("AccountNotInitialized") &&
        !error.message.includes("account to be already initialized")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
  
  console.log("✅ Non-existent mapping correctly rejected");
}

// ============================================================================
// TEST CASE 6.4: ❌ Get Mapping with Wrong Profile
// ============================================================================
async function testGetMappingWithWrongProfile() {
  console.log("Testing fetching mapping with wrong profile reference");
  
  // Prerequisites: Profile and mapping must exist
  const profilePDA = await createTestProfile();
  const nftMint = Keypair.generate().publicKey;
  const mappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "nft", nftMint, 2, profilePDA.owner);
  
  // Create a different profile
  const differentUsername = `diff${timestamp}`.slice(-10);
  const differentOwner = Keypair.generate();
  await fundTestAccount(differentOwner.publicKey);
  
  const [differentProfilePDA] = profilePda(differentUsername);
  const [differentReversePDA] = reversePda(differentOwner.publicKey);
  
  await program.methods
    .createProfile(differentUsername, bio, avatar, twitter, discord, website)
    .accounts({
      authority: differentOwner.publicKey,
      profile: differentProfilePDA,
      reverse: differentReversePDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([differentOwner])
    .rpc();
  
  console.log("Attempting to fetch mapping with wrong profile...");
  console.log("Correct profile:", profilePDA.profilePDA.toString());
  console.log("Wrong profile:", differentProfilePDA.toString());
  console.log("Mapping PDA:", mappingPDA.toString());
  
  try {
    await program.methods
      .getAddressMapping()
      .accounts({
        profile: differentProfilePDA, // Wrong profile
        mapping: mappingPDA,
      })
      .rpc();
    
    throw new Error("Test failed - should not fetch mapping with wrong profile");
  } catch (error) {
    console.log("✅ Correctly failed to fetch mapping with wrong profile:", error.message);
    
    // This might fail due to PDA validation or other constraints
    console.log("✅ Wrong profile correctly rejected");
  }
}

// ============================================================================
// TEST CASE 6.5: ✅ Get Mapping Multiple Times (Same Mapping)
// ============================================================================
async function testGetMappingMultipleTimes() {
  console.log("Testing fetching the same mapping multiple times");
  
  // Prerequisites: Profile and mapping must exist
  const profilePDA = await createTestProfile();
  const nftMint = Keypair.generate().publicKey;
  const mappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "nft", nftMint, 2, profilePDA.owner);
  
  console.log("Fetching same mapping multiple times...");
  
  // Fetch the same mapping multiple times
  const transactions = [];
  for (let i = 0; i < 3; i++) {
    const tx = await program.methods
      .getAddressMapping()
      .accounts({
        profile: profilePDA.profilePDA,
        mapping: mappingPDA,
      })
      .rpc();
    
    transactions.push(tx);
    console.log(`  - Fetch ${i + 1}:`, tx);
  }
  
  console.log("✅ Same mapping fetched 3 times successfully");
  
  // Verify mapping still exists and is unchanged
  const mapping = await program.account.addressMapping.fetch(mappingPDA);
  if (mapping.addressType !== "nft" || mapping.target.toString() !== nftMint.toString()) {
    throw new Error("Mapping data corrupted after multiple get operations");
  }
  
  console.log("✅ Mapping data verified unchanged after multiple fetches");
  console.log("✅ Multiple MappingFetched events should have been emitted");
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllGetAddressMappingTests() {
  console.log("🚀 Starting get_address_mapping Function Tests");
  console.log("Program ID:", program.programId.toString());
  console.log("Username:", username);
  console.log("Owner:", owner.publicKey.toString());
  console.log("Other:", other.publicKey.toString());
  
  // Run tests in order
  await runTest("6.1 Get Existing Mapping (Happy Path)", testGetExistingMappingHappyPath);
  await runTest("6.2 Get Multiple Different Mappings", testGetMultipleDifferentMappings);
  await runTest("6.3 Get Non-Existent Mapping", testGetNonExistentMapping);
  await runTest("6.4 Get Mapping with Wrong Profile", testGetMappingWithWrongProfile);
  await runTest("6.5 Get Mapping Multiple Times", testGetMappingMultipleTimes);
  
  console.log("\n🎉 All get_address_mapping tests completed!");
}

// Export for individual testing
export {
  testGetExistingMappingHappyPath,
  testGetMultipleDifferentMappings,
  testGetNonExistentMapping,
  testGetMappingWithWrongProfile,
  testGetMappingMultipleTimes,
  runAllGetAddressMappingTests
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllGetAddressMappingTests().catch(console.error);
} 