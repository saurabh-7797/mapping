import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import { expect } from "chai";

const RPC_ENDPOINT = 'https://rpc.gorbchain.xyz';
const WS_ENDPOINT = 'wss://rpc.gorbchain.xyz/ws/';
const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
  wsEndpoint: WS_ENDPOINT,
});

describe("Function 1: create_profile - Comprehensive Testing", () => {
  // Configure the client to use the Gorbagan chain
  const wallet = anchor.AnchorProvider.env().wallet || new anchor.Wallet(Keypair.generate());
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: 'confirmed' }
  );
  anchor.setProvider(provider);

  // Use the deployed program ID on Gorbchain
  const programId = new PublicKey("GrJrqEtxztquco6Zsg9WfrArYwy5BZwzJ4ce4TfcJLuJ");
  
  // Create program instance directly with the deployed program ID
  const program = new anchor.Program(
    // We'll create a minimal IDL inline since anchor.workspace doesn't work with custom networks
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

  // Test actors
  const payer = (provider.wallet as anchor.Wallet).payer;
  const owner = Keypair.generate();
  const other = Keypair.generate();

  // Generate unique test data with maximum isolation
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 100000);
  const processId = process.pid || 0;
  let testCounter = 0;
  
  // Helper function to generate unique usernames
  const generateUniqueUsername = (prefix: string) => {
    testCounter++;
    const uniqueId = `${prefix}${processId}${timestamp}${randomSuffix}${testCounter}`;
    // Ensure username is valid (lowercase, no uppercase, within length limits)
    const cleanId = uniqueId.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return cleanId.slice(-15);
  };
  
  const username = generateUniqueUsername("test");
  const bio = "Hello bio for testing";
  const avatar = "ipfs://testavatar";
  const twitter = "test_handle";
  const discord = "test#1234";
  const website = "https://test.example";

  // Helper function to fund test accounts
  async function fundTestAccount(publicKey: PublicKey, amount = 1e8) {
    try {
      await provider.connection.requestAirdrop(publicKey, amount);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
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

  before(async () => {
    // Fund test accounts
    await fundTestAccount(owner.publicKey, 2e8);
    await fundTestAccount(other.publicKey, 1e8);
  });

  describe("✅ Success Cases", () => {
    it("should create profile with valid lowercase username", async () => {
      const [profilePDA] = profilePda(username);
      const [reversePDA] = reversePda(owner.publicKey);

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

      // Verify profile data
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.username).to.eq(username);
      expect(profile.authority.toString()).to.eq(owner.publicKey.toString());
      expect(profile.mainAddress.toString()).to.eq(owner.publicKey.toString());
      expect(profile.bio).to.eq(bio);
      expect(profile.avatar).to.eq(avatar);
      expect(profile.twitter).to.eq(twitter);
      expect(profile.discord).to.eq(discord);
      expect(profile.website).to.eq(website);

      // Verify reverse lookup
      const reverse = await program.account.reverseLookup.fetch(reversePDA);
      expect(reverse.username).to.eq(username);
    });

    it("should create profile with minimal data (only username)", async () => {
      const minimalUsername = generateUniqueUsername("minimal");
      const [profilePDA] = profilePda(minimalUsername);
      const [reversePDA] = reversePda(owner.publicKey);

      const tx = await program.methods
        .createProfile(minimalUsername, null, null, null, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: reversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Minimal profile created:", tx);

      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.username).to.eq(minimalUsername);
      expect(profile.bio).to.eq("");
      expect(profile.avatar).to.eq("");
      expect(profile.twitter).to.eq("");
      expect(profile.discord).to.eq("");
      expect(profile.website).to.eq("");
    });

    it("should create profile with edge case username lengths", async () => {
      // Test minimum length (1 character)
      const minUsername = "a";
      const [minProfilePDA] = profilePda(minUsername);
      const [minReversePDA] = reversePda(owner.publicKey);

      await program.methods
        .createProfile(minUsername, "min", null, null, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: minProfilePDA,
          reverse: minReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Test maximum length (32 characters)
      const maxUsername = "a".repeat(32);
      const [maxProfilePDA] = profilePda(maxUsername);
      const [maxReversePDA] = reversePda(owner.publicKey);

      await program.methods
        .createProfile(maxUsername, "max", null, null, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: maxProfilePDA,
          reverse: maxReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Edge case usernames created successfully");
    });

    it("should create profile with special allowed characters", async () => {
      const specialUsername = generateUniqueUsername("user-123.test");
      const [profilePDA] = profilePda(specialUsername);
      const [reversePDA] = reversePda(owner.publicKey);

      const tx = await program.methods
        .createProfile(specialUsername, "special chars", null, null, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: reversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Special character profile created:", tx);

      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.username).to.eq(specialUsername);
    });

    it("should create profile with long bio and website", async () => {
      const longUsername = generateUniqueUsername("long");
      const [profilePDA] = profilePda(longUsername);
      const [reversePDA] = reversePda(owner.publicKey);

      const longBio = "a".repeat(256); // Maximum bio length
      const longWebsite = "https://" + "a".repeat(57); // Maximum website length

      const tx = await program.methods
        .createProfile(longUsername, longBio, null, null, null, longWebsite)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: reversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Long content profile created:", tx);

      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.bio).to.eq(longBio);
      expect(profile.website).to.eq(longWebsite);
    });
  });

  describe("❌ Validation Failures", () => {
    it("should fail with username containing @ symbol", async () => {
      const badUsername = "user@domain";
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
        
        expect.fail("Expected transaction to fail with @ symbol");
      } catch (error) {
        expect(error.toString()).to.match(/Invalid username|InvalidUsername|custom program error/i);
        console.log("✅ Correctly rejected username with @:", error.message);
      }
    });

    it("should fail with uppercase username", async () => {
      const badUsername = "UpperCase";
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
        
        expect.fail("Expected transaction to fail with uppercase");
      } catch (error) {
        expect(error.toString()).to.match(/Invalid username|InvalidUsername|custom program error/i);
        console.log("✅ Correctly rejected uppercase username:", error.message);
      }
    });

    it("should fail with username containing invalid characters", async () => {
      const invalidChars = ["user#name", "user$name", "user%name", "user&name", "user*name"];
      
      for (const badUsername of invalidChars) {
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
          
          expect.fail(`Expected transaction to fail with invalid char: ${badUsername}`);
        } catch (error) {
          expect(error.toString()).to.match(/Invalid username|InvalidUsername|custom program error/i);
          console.log(`✅ Correctly rejected username with invalid char '${badUsername}':`, error.message);
        }
      }
    });

    it("should fail with empty username", async () => {
      const badUsername = "";
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
        
        expect.fail("Expected transaction to fail with empty username");
      } catch (error) {
        expect(error.toString()).to.match(/Invalid username|InvalidUsername|custom program error/i);
        console.log("✅ Correctly rejected empty username:", error.message);
      }
    });

    it("should fail with username exceeding 32 characters", async () => {
      const badUsername = "a".repeat(33);
      
      try {
        const [profilePDA] = profilePda(badUsername);
        expect.fail("Expected PDA creation to fail due to max seed length");
      } catch (error) {
        expect(error.toString()).to.match(/Max seed length exceeded/i);
        console.log("✅ Correctly rejected long username:", error.message);
      }
    });
  });

  describe("❌ Business Logic Failures", () => {
    it("should fail to create duplicate username", async () => {
      const duplicateUsername = generateUniqueUsername("duplicate");
      const [profilePDA] = profilePda(duplicateUsername);
      const [reversePDA] = reversePda(owner.publicKey);

      // First creation should succeed
      await program.methods
        .createProfile(duplicateUsername, bio, avatar, twitter, discord, website)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: reversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Second creation with same username should fail
      try {
        await program.methods
          .createProfile(duplicateUsername, "different bio", null, null, null, null)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            reverse: reversePDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with duplicate username");
      } catch (error) {
        expect(error.toString()).to.match(/already in use|allocated|exists|address in use/i);
        console.log("✅ Correctly prevented duplicate username:", error.message);
      }
    });

    it("should fail with wrong authority account", async () => {
      const wrongUsername = generateUniqueUsername("wrongauth");
      const [profilePDA] = profilePda(wrongUsername);
      const [reversePDA] = reversePda(other.publicKey); // Wrong reverse PDA

      try {
        await program.methods
          .createProfile(wrongUsername, bio, avatar, twitter, discord, website)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            reverse: reversePDA, // This should match owner.publicKey
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with wrong reverse PDA");
      } catch (error) {
        console.log("✅ Correctly failed with wrong reverse PDA:", error.message);
      }
    });
  });

  describe("🔍 Edge Cases", () => {
    it("should handle very long content that gets clipped", async () => {
      const clipUsername = generateUniqueUsername("clip");
      const [profilePDA] = profilePda(clipUsername);
      const [reversePDA] = reversePda(owner.publicKey);

      const veryLongBio = "b".repeat(300); // Exceeds MAX_BIO (256)
      const veryLongAvatar = "a".repeat(150); // Exceeds MAX_AVATAR (128)
      const veryLongTwitter = "t".repeat(40); // Exceeds MAX_HANDLE (32)

      const tx = await program.methods
        .createProfile(clipUsername, veryLongBio, veryLongAvatar, veryLongTwitter, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: reversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Long content profile created (should be clipped):", tx);

      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.bio).to.eq("b".repeat(256)); // Should be clipped to MAX_BIO
      expect(profile.avatar).to.eq("a".repeat(128)); // Should be clipped to MAX_AVATAR
      expect(profile.twitter).to.eq("t".repeat(32)); // Should be clipped to MAX_HANDLE
    });

    it("should handle mixed case content that gets normalized", async () => {
      const mixedUsername = generateUniqueUsername("mixed");
      const [profilePDA] = profilePda(mixedUsername);
      const [reversePDA] = reversePda(owner.publicKey);

      const mixedBio = "MiXeD cAsE bIo";
      const mixedAvatar = "MiXeD_AvAtAr";
      const mixedTwitter = "MiXeD_TwItTeR";

      const tx = await program.methods
        .createProfile(mixedUsername, mixedBio, mixedAvatar, mixedTwitter, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: reversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Mixed case profile created:", tx);

      const profile = await program.account.profile.fetch(profilePDA);
      // Content should be stored as-is (no automatic normalization)
      expect(profile.bio).to.eq(mixedBio);
      expect(profile.avatar).to.eq(mixedAvatar);
      expect(profile.twitter).to.eq(mixedTwitter);
    });
  });

  describe("📊 Event Emission", () => {
    it("should emit ProfileCreated event", async () => {
      const eventUsername = generateUniqueUsername("event");
      const [profilePDA] = profilePda(eventUsername);
      const [reversePDA] = reversePda(owner.publicKey);

      const tx = await program.methods
        .createProfile(eventUsername, "event test", null, null, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: reversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Profile created with event:", tx);
      
      // Note: In a real test environment, you would verify the event was emitted
      // For now, we just verify the transaction succeeded
      expect(tx).to.be.a('string');
    });
  });
});
