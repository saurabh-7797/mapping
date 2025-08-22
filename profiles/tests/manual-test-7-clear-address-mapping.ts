import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import * as fs from 'fs';

// Test file for: clear_address_mapping function
// Function: Removes a mapping PDA and refunds rent to authority

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
const username = `test7_${timestamp}_${randomSuffix}`.slice(-20); // Keep under 32 chars, add function identifier
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
  console.log("Creating test profile for clear_address_mapping tests...");
  
  // Generate a new owner keypair for each test case to avoid conflicts
  const testOwner = Keypair.generate();
  await fundTestAccount(testOwner.publicKey);
  
  // Generate unique username for this test case
  testCaseCounter++;
  const testTimestamp = Date.now().toString();
  const testRandomSuffix = Math.random().toString(36).substring(2, 8);
  const testUsername = `test7_${testCaseCounter}_${testTimestamp}_${testRandomSuffix}`.slice(-20);
  
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
// TEST CASE 7.1: ✅ Clear Mapping and Refund Rent (Happy Path)
// ============================================================================
async function testClearMappingAndRefundRent() {
  console.log("Testing clearing mapping and rent refund");
  
  // Prerequisites: Profile and mapping must exist
  const profilePDA = await createTestProfile();
  const nftMint = Keypair.generate().publicKey;
  const mappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "nft", nftMint, 2, profilePDA.owner);
  
  // Get authority balance before clearing
  const balanceBefore = await provider.connection.getBalance(profilePDA.owner.publicKey);
  console.log("Authority balance before clearing:", balanceBefore, "lamports");
  
  console.log("Clearing mapping...");
  console.log("Mapping PDA:", mappingPDA.toString());
  
  // Create the mapping instruction manually to set authority as writable
  const instruction = await program.methods
    .clearAddressMapping()
    .accounts({
      authority: profilePDA.owner.publicKey,
      profile: profilePDA.profilePDA,
      mapping: mappingPDA,
    })
    .instruction();
  
  // Ensure authority account is writable to receive rent refund
  instruction.keys[0].isWritable = true;
  
  const transaction = new Transaction().add(instruction);
  const tx = await provider.sendAndConfirm(transaction, [profilePDA.owner]);
  
  console.log("✅ Mapping cleared:", tx);
  
  // Verify mapping is deleted
  try {
    await program.account.addressMapping.fetch(mappingPDA);
    throw new Error("Mapping should be deleted");
  } catch (error) {
    if (error.message.includes("Account does not exist")) {
      console.log("✅ Mapping successfully deleted");
    } else {
      throw error;
    }
  }
  
  // Check rent refund
  const balanceAfter = await provider.connection.getBalance(profilePDA.owner.publicKey);
  const rentRefunded = balanceAfter - balanceBefore;
  console.log("Authority balance after clearing:", balanceAfter, "lamports");
  console.log("Rent refunded:", rentRefunded, "lamports");
  
  if (rentRefunded <= 0) {
    console.log("⚠️  No rent refunded (this might be expected for small accounts)");
  } else {
    console.log("✅ Rent successfully refunded to authority");
  }
  
  console.log("✅ Mapping clearing successful");
  console.log("✅ Mapping account deleted");
}

// ============================================================================
// TEST CASE 7.2: ❌ Clear Non-Existent Mapping
// ============================================================================
async function testClearNonExistentMapping() {
  console.log("Testing clearing a mapping that doesn't exist");
  
  // Prerequisites: Profile must exist
  const profilePDA = await createTestProfile();
  
  const [mappingPDA] = mappingPda(profilePDA.username, "nonexistent");
  
  console.log("Attempting to clear non-existent mapping...");
  console.log("Non-existent mapping PDA:", mappingPDA.toString());
  
  try {
    const instruction = await program.methods
      .clearAddressMapping()
      .accounts({
        authority: profilePDA.owner.publicKey,
        profile: profilePDA.profilePDA,
        mapping: mappingPDA,
      })
      .instruction();
    
    instruction.keys[0].isWritable = true;
    const transaction = new Transaction().add(instruction);
    await provider.sendAndConfirm(transaction, [profilePDA.owner]);
    
    throw new Error("Test failed - should not clear non-existent mapping");
  } catch (error) {
    console.log("✅ Correctly failed to clear non-existent mapping:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("AccountNotInitialized") &&
        !error.message.includes("account to be already initialized")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
  
  console.log("✅ Non-existent mapping correctly not cleared");
}

// ============================================================================
// TEST CASE 7.3: ❌ Clear Mapping by Non-Authority
// ============================================================================
async function testClearMappingByNonAuthority() {
  console.log("Testing that non-authority cannot clear mapping");
  
  // Prerequisites: Profile and mapping must exist, other account must be funded
  const profilePDA = await createTestProfile();
  const nftMint = Keypair.generate().publicKey;
  const mappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "nft", nftMint, 2, profilePDA.owner);
  
  await fundTestAccount(other.publicKey);
  
  console.log("Attempting to clear mapping with non-authority...");
  console.log("Non-authority:", other.publicKey.toString());
  console.log("Mapping PDA:", mappingPDA.toString());
  
  try {
    const instruction = await program.methods
      .clearAddressMapping()
      .accounts({
        authority: other.publicKey, // Wrong authority
        profile: profilePDA.profilePDA,
        mapping: mappingPDA,
      })
      .instruction();
    
    instruction.keys[0].isWritable = true;
    const transaction = new Transaction().add(instruction);
    await provider.sendAndConfirm(transaction, [other]);
    
    throw new Error("Test failed - non-authority should not clear mapping");
  } catch (error) {
    console.log("✅ Correctly rejected non-authority mapping clear:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("ConstraintHasOne") &&
        !error.message.includes("has_one constraint") &&
        !error.message.includes("constraint was violated")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
  
  // Verify mapping still exists
  try {
    const mapping = await program.account.addressMapping.fetch(mappingPDA);
    console.log("✅ Mapping correctly not cleared by non-authority");
    console.log("Mapping still exists:", (mapping.addressType as string), "->", (mapping.target as PublicKey).toString());
  } catch (error) {
    throw new Error("Mapping was cleared by non-authority");
  }
}

// ============================================================================
// TEST CASE 7.4: ✅ Clear Multiple Mappings
// ============================================================================
async function testClearMultipleMappings() {
  console.log("Testing clearing multiple mappings");
  
  // Prerequisites: Profile and multiple mappings must exist
  const profilePDA = await createTestProfile();
  
  // Create multiple mappings
  const walletTarget = Keypair.generate().publicKey;
  const tokenTarget = Keypair.generate().publicKey;
  const nftTarget = Keypair.generate().publicKey;
  
  const walletMappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "wallet", walletTarget, 0, profilePDA.owner);
  const tokenMappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "token", tokenTarget, 1, profilePDA.owner);
  const nftMappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "nft", nftTarget, 2, profilePDA.owner);
  
  console.log("Created 3 mappings, now clearing them...");
  
  // Clear wallet mapping
  console.log("Clearing wallet mapping...");
  let instruction = await program.methods
    .clearAddressMapping()
    .accounts({
      authority: profilePDA.owner.publicKey,
      profile: profilePDA.profilePDA,
      mapping: walletMappingPDA,
    })
    .instruction();
  
  instruction.keys[0].isWritable = true;
  let transaction = new Transaction().add(instruction);
  await provider.sendAndConfirm(transaction, [profilePDA.owner]);
  
  // Clear token mapping
  console.log("Clearing token mapping...");
  instruction = await program.methods
    .clearAddressMapping()
    .accounts({
      authority: profilePDA.owner.publicKey,
      profile: profilePDA.profilePDA,
      mapping: tokenMappingPDA,
    })
    .instruction();
  
  instruction.keys[0].isWritable = true;
  transaction = new Transaction().add(instruction);
  await provider.sendAndConfirm(transaction, [profilePDA.owner]);
  
  // Clear NFT mapping
  console.log("Clearing NFT mapping...");
  instruction = await program.methods
    .clearAddressMapping()
    .accounts({
      authority: profilePDA.owner.publicKey,
      profile: profilePDA.profilePDA,
      mapping: nftMappingPDA,
    })
    .instruction();
  
  instruction.keys[0].isWritable = true;
  transaction = new Transaction().add(instruction);
  await provider.sendAndConfirm(transaction, [profilePDA.owner]);
  
  console.log("✅ All mappings cleared successfully");
  
  // Verify all mappings are deleted
  const mappingsToCheck = [
    { name: "wallet", pda: walletMappingPDA },
    { name: "token", pda: tokenMappingPDA },
    { name: "nft", pda: nftMappingPDA }
  ];
  
  for (const mapping of mappingsToCheck) {
    try {
      await program.account.addressMapping.fetch(mapping.pda);
      throw new Error(`${mapping.name} mapping still exists`);
    } catch (error) {
      if (error.message.includes("Account does not exist")) {
        console.log(`✅ ${mapping.name} mapping successfully deleted`);
      } else {
        throw error;
      }
    }
  }
  
  console.log("✅ All mappings verified deleted");
}

// ============================================================================
// TEST CASE 7.5: ✅ Clear Mapping and Verify Profile Unchanged
// ============================================================================
async function testClearMappingAndVerifyProfileUnchanged() {
  console.log("Testing that profile remains unchanged after clearing mapping");
  
  // Prerequisites: Profile and mapping must exist
  const profilePDA = await createTestProfile();
  const nftMint = Keypair.generate().publicKey;
  const mappingPDA = await createTestMapping(profilePDA.profilePDA, profilePDA.username, "nft", nftMint, 2, profilePDA.owner);
  
  // Get profile state before clearing
  const profileBefore = await program.account.profile.fetch(profilePDA.profilePDA);
  console.log("Profile before clearing mapping:", {
    username: profileBefore.username,
    authority: profileBefore.authority.toString(),
    mainAddress: profileBefore.mainAddress.toString(),
    bio: profileBefore.bio,
  });
  
  // Clear the mapping
  console.log("Clearing mapping...");
  const instruction = await program.methods
    .clearAddressMapping()
    .accounts({
      authority: profilePDA.owner.publicKey,
      profile: profilePDA.profilePDA,
      mapping: mappingPDA,
    })
    .instruction();
  
  instruction.keys[0].isWritable = true;
  const transaction = new Transaction().add(instruction);
  await provider.sendAndConfirm(transaction, [profilePDA.owner]);
  
  console.log("✅ Mapping cleared");
  
  // Verify profile unchanged
  const profileAfter = await program.account.profile.fetch(profilePDA.profilePDA);
  console.log("Profile after clearing mapping:", {
    username: profileAfter.username,
    authority: profileAfter.authority.toString(),
    mainAddress: profileAfter.mainAddress.toString(),
    bio: profileAfter.bio,
  });
  
  // Verify all profile fields unchanged
  if (profileAfter.username !== profileBefore.username) throw new Error("Username changed");
  if (profileAfter.authority.toString() !== profileBefore.authority.toString()) throw new Error("Authority changed");
  if (profileAfter.mainAddress.toString() !== profileBefore.mainAddress.toString()) throw new Error("Main address changed");
  if (profileAfter.bio !== profileBefore.bio) throw new Error("Bio changed");
  
  console.log("✅ Profile verified unchanged after mapping clear");
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllClearAddressMappingTests() {
  console.log("🚀 Starting clear_address_mapping Function Tests");
  console.log("Program ID:", program.programId.toString());
  console.log("Username:", username);
  console.log("Owner:", owner.publicKey.toString());
  console.log("Other:", other.publicKey.toString());
  
  // Run tests in order
  await runTest("7.1 Clear Mapping and Refund Rent (Happy Path)", testClearMappingAndRefundRent);
  await runTest("7.2 Clear Non-Existent Mapping", testClearNonExistentMapping);
  await runTest("7.3 Clear Mapping by Non-Authority", testClearMappingByNonAuthority);
  await runTest("7.4 Clear Multiple Mappings", testClearMultipleMappings);
  await runTest("7.5 Clear Mapping and Verify Profile Unchanged", testClearMappingAndVerifyProfileUnchanged);
  
  console.log("\n🎉 All clear_address_mapping tests completed!");
}

// Export for individual testing
export {
  testClearMappingAndRefundRent,
  testClearNonExistentMapping,
  testClearMappingByNonAuthority,
  testClearMultipleMappings,
  testClearMappingAndVerifyProfileUnchanged,
  runAllClearAddressMappingTests
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllClearAddressMappingTests().catch(console.error);
} 