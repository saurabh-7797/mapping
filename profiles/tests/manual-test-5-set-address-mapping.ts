import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import * as fs from 'fs';

// Test file for: set_address_mapping function
// Function: Sets or upserts a mapping PDA for UPI-style address mapping

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
const username = `test5_${timestamp}_${randomSuffix}`.slice(-20); // Keep under 32 chars, add function identifier
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
  console.log("Creating test profile for set_address_mapping tests...");
  
  // Generate a new owner keypair for each test case to avoid conflicts
  const testOwner = Keypair.generate();
  await fundTestAccount(testOwner.publicKey);
  
  // Generate unique username for this test case
  testCaseCounter++;
  const testTimestamp = Date.now().toString();
  const testRandomSuffix = Math.random().toString(36).substring(2, 8);
  const testUsername = `test5_${testCaseCounter}_${testTimestamp}_${testRandomSuffix}`.slice(-20);
  
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
  return { profilePDA, owner: testOwner };
}

// Utility function to create a mapping for testing
async function createTestMapping(profilePDA: PublicKey, addressType: string, target: PublicKey, typeHint: number) {
  // Extract username from profilePDA or generate a new one
  const testTimestamp = Date.now().toString();
  const testRandomSuffix = Math.random().toString(36).substring(2, 8);
  const testUsername = `test5_${testTimestamp}_${testRandomSuffix}`.slice(-20);
  
  const [mappingPDA] = mappingPda(testUsername, addressType);
  
  await program.methods
    .setAddressMapping(addressType, target, typeHint)
    .accounts({
      authority: owner.publicKey,
      profile: profilePDA,
      mapping: mappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([owner])
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
// TEST CASE 5.1: ✅ Create NFT Mapping (Happy Path)
// ============================================================================
async function testCreateNftMappingHappyPath() {
  console.log("Testing successful address mapping creation");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Generate NFT mint address
  const nftMint = Keypair.generate().publicKey;
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username as string;
  
  const [mappingPDA] = mappingPda(actualUsername, "nft");
  
  console.log("Creating NFT mapping...");
  console.log("Address type: nft");
  console.log("Target address:", nftMint.toString());
  console.log("Type hint: 2 (NFT)");
  
  const tx = await program.methods
    .setAddressMapping("nft", nftMint, 2)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      mapping: mappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ NFT mapping created:", tx);
  
  // Verify mapping
  const mapping = await program.account.addressMapping.fetch(mappingPDA);
  console.log("Mapping details:", {
    addressType: mapping.addressType as string,
    target: (mapping.target as PublicKey).toString(),
    extraTag: mapping.extraTag as number,
    profile: (mapping.profile as PublicKey).toString(),
  });
  
  // Verify all fields
  if ((mapping.addressType as string) !== "nft") throw new Error("Address type mismatch");
  if ((mapping.target as PublicKey).toString() !== nftMint.toString()) throw new Error("Target address mismatch");
  if ((mapping.extraTag as number) !== 2) throw new Error("Type hint mismatch");
  if ((mapping.profile as PublicKey).toString() !== profilePDA.toString()) throw new Error("Profile reference mismatch");
  
  console.log("✅ NFT mapping verified successfully");
}

// ============================================================================
// TEST CASE 5.2: ✅ Create Multiple Mappings
// ============================================================================
async function testCreateMultipleMappings() {
  console.log("Testing creating different types of mappings");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username as string;
  
  // Create wallet mapping
  const walletAddress = Keypair.generate().publicKey;
  const [walletMappingPDA] = mappingPda(actualUsername, "wallet");
  
  const walletTx = await program.methods
    .setAddressMapping("wallet", walletAddress, 1)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      mapping: walletMappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Wallet mapping created:", walletTx);
  
  // Create token mapping
  const tokenMint = Keypair.generate().publicKey;
  const [tokenMappingPDA] = mappingPda(actualUsername, "token");
  
  const tokenTx = await program.methods
    .setAddressMapping("token", tokenMint, 3)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      mapping: tokenMappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Token mapping created:", tokenTx);
  
  // Create donation mapping
  const donationAddress = Keypair.generate().publicKey;
  const [donationMappingPDA] = mappingPda(actualUsername, "donation");
  
  const donationTx = await program.methods
    .setAddressMapping("donation", donationAddress, 4)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      mapping: donationMappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Donation mapping created:", donationTx);
  
  // Verify all mappings exist
  const walletMapping = await program.account.addressMapping.fetch(walletMappingPDA);
  const tokenMapping = await program.account.addressMapping.fetch(tokenMappingPDA);
  const donationMapping = await program.account.addressMapping.fetch(donationMappingPDA);
  
  console.log("All mappings created successfully:");
  console.log("- Wallet:", (walletMapping.addressType as string), (walletMapping.target as PublicKey).toString());
  console.log("- Token:", (tokenMapping.addressType as string), (tokenMapping.target as PublicKey).toString());
  console.log("- Donation:", (donationMapping.addressType as string), (donationMapping.target as PublicKey).toString());
  
  console.log("✅ Multiple mappings created successfully");
}

// ============================================================================
// TEST CASE 5.3: ❌ Invalid Address Type
// ============================================================================
async function testInvalidAddressType() {
  console.log("Testing that invalid address types are rejected");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username as string;
  
  // Try to create mapping with invalid address type
  const invalidAddressType = "UPPERCASE"; // Contains uppercase
  const targetAddress = Keypair.generate().publicKey;
  const [mappingPDA] = mappingPda(actualUsername, invalidAddressType);
  
  console.log("Attempting to create mapping with invalid address type:", invalidAddressType);
  
  try {
    await program.methods
      .setAddressMapping(invalidAddressType, targetAddress, 1)
      .accounts({
        authority: testOwner.publicKey,
        profile: profilePDA,
        mapping: mappingPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([testOwner])
      .rpc();
    
    throw new Error("Test failed - should have rejected invalid address type");
  } catch (error) {
    console.log("✅ Correctly rejected invalid address type:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("Invalid address type") &&
        !error.message.includes("InvalidAddressType") &&
        !error.message.includes("custom program error")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
  
  console.log("✅ Invalid address type properly rejected");
}

// ============================================================================
// TEST CASE 5.4: ❌ Invalid Address Type (Special Characters)
// ============================================================================
async function testInvalidAddressTypeSpecialChars() {
  console.log("Testing that address types with special characters are rejected");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username as string;
  
  // Try to create mapping with invalid address type
  const invalidAddressType = "test@type"; // Contains @ symbol
  const targetAddress = Keypair.generate().publicKey;
  const [mappingPDA] = mappingPda(actualUsername, invalidAddressType);
  
  console.log("Attempting to create mapping with special characters:", invalidAddressType);
  
  try {
    await program.methods
      .setAddressMapping(invalidAddressType, targetAddress, 1)
      .accounts({
        authority: testOwner.publicKey,
        profile: profilePDA,
        mapping: mappingPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([testOwner])
      .rpc();
    
    throw new Error("Test failed - should have rejected special characters");
  } catch (error) {
    console.log("✅ Correctly rejected special characters:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("Invalid address type") &&
        !error.message.includes("InvalidAddressType") &&
        !error.message.includes("custom program error")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
  
  console.log("✅ Special characters properly rejected");
}

// ============================================================================
// TEST CASE 5.5: ✅ Update Existing Mapping (Upsert)
// ============================================================================
async function testUpdateExistingMappingUpsert() {
  console.log("Testing updating an existing mapping (upsert functionality)");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username as string;
  
  // Create initial mapping
  const initialTarget = Keypair.generate().publicKey;
  const [mappingPDA] = mappingPda(actualUsername, "test");
  
  const createTx = await program.methods
    .setAddressMapping("test", initialTarget, 1)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      mapping: mappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Initial mapping created:", createTx);
  
  // Update the same mapping (upsert)
  const newTarget = Keypair.generate().publicKey;
  const updateTx = await program.methods
    .setAddressMapping("test", newTarget, 5)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
      mapping: mappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Mapping updated (upsert):", updateTx);
  
  // Verify the update
  const mapping = await program.account.addressMapping.fetch(mappingPDA);
  if ((mapping.target as PublicKey).toString() !== newTarget.toString()) {
    throw new Error("Mapping target not updated");
  }
  if ((mapping.extraTag as number) !== 5) {
    throw new Error("Mapping type hint not updated");
  }
  
  console.log("✅ Upsert functionality working correctly");
  console.log("✅ New target:", (mapping.target as PublicKey).toString());
  console.log("✅ New type hint:", mapping.extraTag as number);
}

// ============================================================================
// TEST CASE 5.6: ❌ Create Mapping by Non-Authority
// ============================================================================
async function testCreateMappingByNonAuthority() {
  console.log("Testing that non-authority cannot create mappings");
  
  // Prerequisites: Profile must exist and other account must be funded
  const { profilePDA, owner: testOwner } = await createTestProfile();
  await fundTestAccount(other.publicKey);
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username as string;
  
  // Try to create mapping with non-authority
  const targetAddress = Keypair.generate().publicKey;
  const [mappingPDA] = mappingPda(actualUsername, "hacked");
  
  console.log("Attempting to create mapping with non-authority...");
  console.log("Non-authority:", other.publicKey.toString());
  console.log("Target:", targetAddress.toString());
  
  try {
    await program.methods
      .setAddressMapping("hacked", targetAddress, 1)
      .accounts({
        authority: other.publicKey, // Wrong authority
        profile: profilePDA,
        mapping: mappingPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([other])
      .rpc();
    
    throw new Error("Test failed - non-authority should not create mapping");
  } catch (error) {
    console.log("✅ Correctly rejected non-authority mapping creation:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("has_one constraint") && 
        !error.message.includes("constraint has_one") &&
        !error.message.includes("authority") &&
        !error.message.includes("AccountNotInitialized") &&
        !error.message.includes("ConstraintHasOne")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
  
  // Verify mapping was not actually created
  try {
    await program.account.addressMapping.fetch(mappingPDA);
    throw new Error("Mapping was created by non-authority");
  } catch (error) {
    if (error.message.includes("Account does not exist")) {
      console.log("✅ Mapping correctly not created");
    } else {
      throw error;
    }
  }
  
  console.log("✅ Non-authority mapping creation properly rejected");
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllSetAddressMappingTests() {
  console.log("🚀 Starting set_address_mapping Function Tests");
  console.log("Program ID:", program.programId.toString());
  console.log("Username:", username);
  console.log("Owner:", owner.publicKey.toString());
  console.log("Other:", other.publicKey.toString());
  
  // Run tests in order
  await runTest("5.1 Create NFT Mapping (Happy Path)", testCreateNftMappingHappyPath);
  await runTest("5.2 Create Multiple Mappings", testCreateMultipleMappings);
  await runTest("5.3 Invalid Address Type", testInvalidAddressType);
  await runTest("5.4 Invalid Address Type (Special Characters)", testInvalidAddressTypeSpecialChars);
  await runTest("5.5 Update Existing Mapping (Upsert)", testUpdateExistingMappingUpsert);
  await runTest("5.6 Create Mapping by Non-Authority", testCreateMappingByNonAuthority);
  
  console.log("\n🎉 All set_address_mapping tests completed!");
}

// Export for individual testing
export {
  testCreateNftMappingHappyPath,
  testCreateMultipleMappings,
  testInvalidAddressType,
  testInvalidAddressTypeSpecialChars,
  testUpdateExistingMappingUpsert,
  testCreateMappingByNonAuthority,
  runAllSetAddressMappingTests
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllSetAddressMappingTests().catch(console.error);
} 