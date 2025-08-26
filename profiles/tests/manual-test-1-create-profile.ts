import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import * as fs from 'fs';

// Test file for: create_profile function
// Function: Creates a new profile PDA for username with validation

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

// Create program instance directly with the deployed program ID
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

// Test data
const timestamp = Date.now().toString();
const randomSuffix = Math.random().toString(36).substring(2, 8);
const username = `test1_${timestamp}_${randomSuffix}`.slice(-20); // Keep under 32 chars, add function identifier
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

// Utility function to create a profile for testing
let testCaseCounter = 0;
async function createTestProfile() {
  console.log("Creating test profile for create_profile tests...");
  
  // Generate a new owner keypair for each test case to avoid conflicts
  const testOwner = Keypair.generate();
  await fundTestAccount(testOwner.publicKey);
  
  // Generate unique username for this test case
  testCaseCounter++;
  const testTimestamp = Date.now().toString();
  const testRandomSuffix = Math.random().toString(36).substring(2, 8);
  const testUsername = `test1_${testCaseCounter}_${testTimestamp}_${testRandomSuffix}`.slice(-20);
  
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

// ============================================================================
// TEST CASE 1.1: ✅ Create Profile (Happy Path)
// ============================================================================
async function testCreateProfileHappyPath() {
  console.log("Testing successful profile creation with valid data");
  
  // 1. Ensure test account has SOL
  await fundTestAccount(owner.publicKey);
  
  // 2. Prepare PDAs
  const [profilePDA] = profilePda(username);
  const [reversePDA] = reversePda(owner.publicKey);
  
  console.log("Profile PDA:", profilePDA.toString());
  console.log("Reverse PDA:", reversePDA.toString());
  
  // 3. Call create_profile
  const tx = await program.methods
    .createProfile(username, bio, avatar, twitter, discord, website)
    .accounts({
      authority: owner.publicKey,
      profile: profilePDA,
      reverse: reversePDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([owner])
    .rpc();
  
  console.log("✅ Profile created:", tx);
  
  // 4. Verify profile data
  const profile = await program.account.profile.fetch(profilePDA) as any;
  console.log("Profile:", {
    username: profile.username,
    authority: profile.authority.toString(),
    mainAddress: profile.mainAddress.toString(),
    bio: profile.bio,
    avatar: profile.avatar,
    twitter: profile.twitter,
    discord: profile.discord,
    website: profile.website,
  });
  
  // 5. Verify reverse lookup
  const reverse = await program.account.reverseLookup.fetch(reversePDA) as any;
  console.log("Reverse lookup:", reverse.username);
  
  // Verify all data matches input
  if (profile.username !== username) throw new Error("Username mismatch");
  if (profile.authority.toString() !== owner.publicKey.toString()) throw new Error("Authority mismatch");
  if (profile.mainAddress.toString() !== owner.publicKey.toString()) throw new Error("Main address mismatch");
  if (profile.bio !== bio) throw new Error("Bio mismatch");
  if (profile.avatar !== avatar) throw new Error("Avatar mismatch");
  if (profile.twitter !== twitter) throw new Error("Twitter mismatch");
  if (profile.discord !== discord) throw new Error("Discord mismatch");
  if (profile.website !== website) throw new Error("Website mismatch");
  if (reverse.username !== username) throw new Error("Reverse lookup username mismatch");
  
  console.log("✅ All profile data verified successfully");
}

// ============================================================================
// TEST CASE 1.2: ❌ Invalid Username (Contains @)
// ============================================================================
async function testInvalidUsernameAt() {
  console.log("Testing that usernames with @ symbol are rejected");
  
  const badUsername = "test@user";
  const [profilePDA] = profilePda(badUsername);
  const [reversePDA] = reversePda(owner.publicKey);
  
  try {
    await program.methods
      .createProfile(badUsername, bio, avatar, twitter, discord, website)
      .accounts({
        authority: owner.publicKey,
        profile: profilePDA,
        reverse: reversePDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    
    throw new Error("Test failed - should have rejected @ symbol");
  } catch (error) {
    console.log("✅ Correctly rejected username with @:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("Invalid username") && 
        !error.message.includes("InvalidUsername") &&
        !error.message.includes("custom program error")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
}

// ============================================================================
// TEST CASE 1.3: ❌ Invalid Username (Uppercase)
// ============================================================================
async function testInvalidUsernameUppercase() {
  console.log("Testing that uppercase usernames are rejected");
  
  const badUsername = "TestUser"; // Contains uppercase
  const [profilePDA] = profilePda(badUsername);
  const [reversePDA] = reversePda(owner.publicKey);
  
  try {
    await program.methods
      .createProfile(badUsername, bio, avatar, twitter, discord, website)
      .accounts({
        authority: owner.publicKey,
        profile: profilePDA,
        reverse: reversePDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    
    throw new Error("Test failed - should have rejected uppercase");
  } catch (error) {
    console.log("✅ Correctly rejected uppercase username:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("Invalid username") && 
        !error.message.includes("InvalidUsername") &&
        !error.message.includes("custom program error")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
}

// ============================================================================
// TEST CASE 1.4: ❌ Username Too Long (>32 chars)
// ============================================================================
async function testInvalidUsernameTooLong() {
  console.log("Testing that overly long usernames are rejected");
  
  const badUsername = "a".repeat(33); // 33 characters
  
  try {
    const [profilePDA] = profilePda(badUsername);
    throw new Error("Test failed - should have failed at PDA creation");
  } catch (error) {
    console.log("✅ Correctly rejected long username:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("Max seed length exceeded")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
}

// ============================================================================
// TEST CASE 1.5: ❌ Duplicate Username
// ============================================================================
async function testDuplicateUsername() {
  console.log("Testing that duplicate usernames are prevented");
  
  // This test assumes Test 1.1 has already run and created a profile
  const [profilePDA] = profilePda(username); // Same username as Test 1.1
  const [reversePDA] = reversePda(owner.publicKey);
  
  try {
    await program.methods
      .createProfile(username, "different bio", "different avatar", "", "", "")
      .accounts({
        authority: owner.publicKey,
        profile: profilePDA,
        reverse: reversePDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    
    throw new Error("Test failed - should have prevented duplicate");
  } catch (error) {
    console.log("✅ Correctly prevented duplicate username:", error.message);
    
    // Verify error contains expected message
    if (!error.message.includes("already in use") && 
        !error.message.includes("allocated") &&
        !error.message.includes("exists") &&
        !error.message.includes("address in use")) {
      throw new Error("Unexpected error message: " + error.message);
    }
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllCreateProfileTests() {
  console.log("🚀 Starting create_profile Function Tests");
  console.log("Program ID:", program.programId.toString());
  console.log("Username:", username);
  console.log("Owner:", owner.publicKey.toString());
  
  // Run tests in order
  await runTest("1.1 Create Profile (Happy Path)", testCreateProfileHappyPath);
  await runTest("1.2 Invalid Username (Contains @)", testInvalidUsernameAt);
  await runTest("1.3 Invalid Username (Uppercase)", testInvalidUsernameUppercase);
  await runTest("1.4 Invalid Username (Too Long)", testInvalidUsernameTooLong);
  await runTest("1.5 Duplicate Username", testDuplicateUsername);
  
  console.log("\n🎉 All create_profile tests completed!");
}

// Export for individual testing
export {
  testCreateProfileHappyPath,
  testInvalidUsernameAt,
  testInvalidUsernameUppercase,
  testInvalidUsernameTooLong,
  testDuplicateUsername,
  runAllCreateProfileTests
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllCreateProfileTests().catch(console.error);
} 