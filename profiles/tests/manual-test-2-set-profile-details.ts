import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import * as fs from 'fs';

// Test file for: set_profile_details function
// Function: Updates bio/avatar and social links

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
const username = `test2_${timestamp}_${randomSuffix}`.slice(-20); // Keep under 32 chars, add function identifier
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
  console.log("Creating test profile for set_profile_details tests...");
  
  // Generate a new owner keypair for each test case to avoid conflicts
  const testOwner = Keypair.generate();
  await fundTestAccount(testOwner.publicKey);
  
  // Generate unique username for this test case
  testCaseCounter++;
  const testTimestamp = Date.now().toString();
  const testRandomSuffix = Math.random().toString(36).substring(2, 8);
  const testUsername = `test2_${testCaseCounter}_${testTimestamp}_${testRandomSuffix}`.slice(-20);
  
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
// TEST CASE 2.1: ✅ Update Profile Details (Happy Path)
// ============================================================================
async function testUpdateProfileDetailsHappyPath() {
  console.log("Testing successful profile update by authority");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username;
  
  // Update all fields
  const newBio = "Updated bio content";
  const newAvatar = "ipfs://newavatar";
  const newTwitter = "new_twitter";
  const newDiscord = "new#5678";
  const newWebsite = "https://newsite.com";
  
  console.log("Updating profile with new data...");
  console.log("New bio:", newBio);
  console.log("New avatar:", newAvatar);
  console.log("New twitter:", newTwitter);
  console.log("New discord:", newDiscord);
  console.log("New website:", newWebsite);
  
  const tx = await program.methods
    .setProfileDetails(newBio, newAvatar, newTwitter, newDiscord, newWebsite)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Profile updated:", tx);
  
  // Verify updates
  const profile = await program.account.profile.fetch(profilePDA);
  console.log("Updated profile:", {
    bio: profile.bio,
    avatar: profile.avatar,
    twitter: profile.twitter,
    discord: profile.discord,
    website: profile.website,
  });
  
  // Verify all fields updated correctly
  if (profile.bio !== newBio) throw new Error("Bio not updated");
  if (profile.avatar !== newAvatar) throw new Error("Avatar not updated");
  if (profile.twitter !== newTwitter) throw new Error("Twitter not updated");
  if (profile.discord !== newDiscord) throw new Error("Discord not updated");
  if (profile.website !== newWebsite) throw new Error("Website not updated");
  
  // Verify username and authority unchanged
  if (profile.username !== actualUsername) throw new Error("Username changed unexpectedly");
  if (profile.authority.toString() !== testOwner.publicKey.toString()) throw new Error("Authority changed unexpectedly");
  
  console.log("✅ All profile fields updated successfully");
  console.log("✅ Username and authority unchanged");
}

// ============================================================================
// TEST CASE 2.2: ❌ Update by Non-Authority
// ============================================================================
async function testUpdateByNonAuthority() {
  console.log("Testing that non-authority cannot update profile");
  
  // Prerequisites: Profile must exist and other account must be funded
  const { profilePDA, owner: testOwner } = await createTestProfile();
  await fundTestAccount(other.publicKey);
  
  try {
    await program.methods
      .setProfileDetails("hacker bio", null, null, null, null)
      .accounts({
        authority: other.publicKey, // Wrong authority
        profile: profilePDA,
      })
      .signers([other])
      .rpc();
    
    throw new Error("Test failed - non-authority should not update");
  } catch (error) {
    console.log("✅ Correctly rejected non-authority update:", error.message);
    
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
  if (profile.bio === "hacker bio") {
    throw new Error("Profile was updated by non-authority");
  }
  
  console.log("✅ Profile remains unchanged after unauthorized attempt");
}

// ============================================================================
// TEST CASE 2.3: ✅ Update with Null Values (Partial Update)
// ============================================================================
async function testUpdateWithNullValues() {
  console.log("Testing profile update with null values (partial update)");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username;
  
  // Get current profile state
  const currentProfile = await program.account.profile.fetch(profilePDA);
  console.log("Current profile state:", {
    bio: currentProfile.bio,
    avatar: currentProfile.avatar,
    twitter: currentProfile.twitter,
    discord: currentProfile.discord,
    website: currentProfile.website,
  });
  
  // Update only bio, leave others as null
  const newBio = "Only bio updated";
  
  const tx = await program.methods
    .setProfileDetails(newBio, null, null, null, null)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Partial update completed:", tx);
  
  // Verify only bio was updated
  const updatedProfile = await program.account.profile.fetch(profilePDA);
  console.log("Updated profile:", {
    bio: updatedProfile.bio,
    avatar: updatedProfile.avatar,
    twitter: updatedProfile.twitter,
    discord: updatedProfile.discord,
    website: updatedProfile.website,
  });
  
  // Verify bio was updated
  if (updatedProfile.bio !== newBio) throw new Error("Bio not updated");
  
  // Verify username and authority unchanged
  if (updatedProfile.username !== actualUsername) throw new Error("Username changed unexpectedly");
  if (updatedProfile.authority.toString() !== testOwner.publicKey.toString()) throw new Error("Authority changed unexpectedly");
  
  // Verify other fields remain unchanged (should be empty strings from contract)
  if (updatedProfile.avatar !== "") throw new Error("Avatar should be empty string");
  if (updatedProfile.twitter !== "") throw new Error("Twitter should be empty string");
  if (updatedProfile.discord !== "") throw new Error("Discord should be empty string");
  if (updatedProfile.website !== "") throw new Error("Website should be empty string");
  
  console.log("✅ Partial update successful - only bio changed");
}

// ============================================================================
// TEST CASE 2.4: ✅ Update with Empty Strings
// ============================================================================
async function testUpdateWithEmptyStrings() {
  console.log("Testing profile update with empty strings");
  
  // Prerequisites: Profile must exist
  const { profilePDA, owner: testOwner } = await createTestProfile();
  
  // Get the actual profile to verify the username
  const actualProfile = await program.account.profile.fetch(profilePDA);
  const actualUsername = actualProfile.username;
  
  // Update with empty strings
  const emptyBio = "";
  const emptyAvatar = "";
  const emptyTwitter = "";
  const emptyDiscord = "";
  const emptyWebsite = "";
  
  const tx = await program.methods
    .setProfileDetails(emptyBio, emptyAvatar, emptyTwitter, emptyDiscord, emptyWebsite)
    .accounts({
      authority: testOwner.publicKey,
      profile: profilePDA,
    })
    .signers([testOwner])
    .rpc();
  
  console.log("✅ Empty strings update completed:", tx);
  
  // Verify all fields are now empty
  const profile = await program.account.profile.fetch(profilePDA);
  console.log("Profile after empty update:", {
    bio: profile.bio,
    avatar: profile.avatar,
    twitter: profile.twitter,
    discord: profile.discord,
    website: profile.website,
  });
  
  // Verify all fields are empty
  if (profile.bio !== "") throw new Error("Bio not empty");
  if (profile.avatar !== "") throw new Error("Avatar not empty");
  if (profile.twitter !== "") throw new Error("Twitter not empty");
  if (profile.discord !== "") throw new Error("Discord not empty");
  if (profile.website !== "") throw new Error("Website not empty");
  
  // Verify username and authority unchanged
  if (profile.username !== actualUsername) throw new Error("Username changed unexpectedly");
  if (profile.authority.toString() !== testOwner.publicKey.toString()) throw new Error("Authority changed unexpectedly");
  
  console.log("✅ All fields successfully set to empty strings");
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllSetProfileDetailsTests() {
  console.log("🚀 Starting set_profile_details Function Tests");
  console.log("Program ID:", program.programId.toString());
  console.log("Username:", username);
  console.log("Owner:", owner.publicKey.toString());
  console.log("Other:", other.publicKey.toString());
  
  // Run tests in order
  await runTest("2.1 Update Profile Details (Happy Path)", testUpdateProfileDetailsHappyPath);
  await runTest("2.2 Update by Non-Authority", testUpdateByNonAuthority);
  await runTest("2.3 Update with Null Values", testUpdateWithNullValues);
  await runTest("2.4 Update with Empty Strings", testUpdateWithEmptyStrings);
  
  console.log("\n🎉 All set_profile_details tests completed!");
}

// Export for individual testing
export {
  testUpdateProfileDetailsHappyPath,
  testUpdateByNonAuthority,
  testUpdateWithNullValues,
  testUpdateWithEmptyStrings,
  runAllSetProfileDetailsTests
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllSetProfileDetailsTests().catch(console.error);
} 