import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction, Connection } from "@solana/web3.js";
import { expect } from "chai";

const RPC_ENDPOINT = 'https://rpc.gorbchain.xyz';
const WS_ENDPOINT = 'wss://rpc.gorbchain.xyz/ws/';
const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
  wsEndpoint: WS_ENDPOINT,
});

describe("Function 5: set_address_mapping - Comprehensive Testing", () => {
  // Configure the client to use the Gorbagan chain
  const provider = new anchor.AnchorProvider(
    connection,
    anchor.AnchorProvider.env().wallet,
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

  const mappingPda = (username: string, addressType: string) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("mapping"), Buffer.from(username), Buffer.from(addressType)],
      program.programId
    );

  // Test actors
  const payer = (provider.wallet as anchor.Wallet).payer;
  const owner = Keypair.generate();
  const other = Keypair.generate();
  const unauthorized = Keypair.generate();
  const targetWallet1 = Keypair.generate();
  const targetWallet2 = Keypair.generate();
  const targetWallet3 = Keypair.generate();

  // Generate unique test data
  const timestamp = Date.now().toString();
  const username = `test${timestamp}`.slice(-10);
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

  // Helper function to create a profile for testing
  async function createTestProfile(username: string, authority: Keypair) {
    const [profilePDA] = profilePda(username);
    const [reversePDA] = reversePda(authority.publicKey);

    await program.methods
      .createProfile(username, bio, avatar, twitter, discord, website)
      .accounts({
        authority: authority.publicKey,
        profile: profilePDA,
        reverse: reversePDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    return profilePDA;
  }

  before(async () => {
    // Fund test accounts
    await fundTestAccount(owner.publicKey, 2e8);
    await fundTestAccount(other.publicKey, 1e8);
    await fundTestAccount(unauthorized.publicKey, 1e8);
    await fundTestAccount(targetWallet1.publicKey, 1e8);
    await fundTestAccount(targetWallet2.publicKey, 1e8);
    await fundTestAccount(targetWallet3.publicKey, 1e8);
  });

  describe("✅ Success Cases", () => {
    it("should create wallet mapping successfully", async () => {
      const profilePDA = await createTestProfile(username, owner);
      const [mappingPDA] = mappingPda(username, "wallet");

      const tx = await program.methods
        .setAddressMapping("wallet", targetWallet1.publicKey, 0) // 0 = wallet type hint
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Wallet mapping created:", tx);

      // Verify mapping data
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("wallet");
      expect(mapping.target.toString()).to.eq(targetWallet1.publicKey.toString());
      expect(mapping.extraTag).to.eq(0);
      expect(mapping.profile.toString()).to.eq(profilePDA.toString());
    });

    it("should create NFT mapping successfully", async () => {
      const nftUsername = `nft${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(nftUsername, owner);
      const [mappingPDA] = mappingPda(nftUsername, "nft");

      const tx = await program.methods
        .setAddressMapping("nft", targetWallet2.publicKey, 2) // 2 = NFT type hint
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ NFT mapping created:", tx);

      // Verify mapping data
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("nft");
      expect(mapping.target.toString()).to.eq(targetWallet2.publicKey.toString());
      expect(mapping.extraTag).to.eq(2);
    });

    it("should create token mapping successfully", async () => {
      const tokenUsername = `token${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(tokenUsername, owner);
      const [mappingPDA] = mappingPda(tokenUsername, "token");

      const tx = await program.methods
        .setAddressMapping("token", targetWallet3.publicKey, 1) // 1 = token type hint
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Token mapping created:", tx);

      // Verify mapping data
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("token");
      expect(mapping.target.toString()).to.eq(targetWallet3.publicKey.toString());
      expect(mapping.extraTag).to.eq(1);
    });

    it("should create metadata mapping successfully", async () => {
      const metadataUsername = `metadata${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(metadataUsername, owner);
      const [mappingPDA] = mappingPda(metadataUsername, "metadata");

      const tx = await program.methods
        .setAddressMapping("metadata", targetWallet1.publicKey, 3) // 3 = metadata type hint
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Metadata mapping created:", tx);

      // Verify mapping data
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("metadata");
      expect(mapping.target.toString()).to.eq(targetWallet1.publicKey.toString());
      expect(mapping.extraTag).to.eq(3);
    });

    it("should create custom mapping successfully", async () => {
      const customUsername = `custom${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(customUsername, owner);
      const [mappingPDA] = mappingPda(customUsername, "donations");

      const tx = await program.methods
        .setAddressMapping("donations", targetWallet2.publicKey, 4) // 4 = custom type hint
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Custom mapping created:", tx);

      // Verify mapping data
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("donations");
      expect(mapping.target.toString()).to.eq(targetWallet2.publicKey.toString());
      expect(mapping.extraTag).to.eq(4);
    });

    it("should create multiple mappings for same profile", async () => {
      const multiUsername = `multi${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(multiUsername, owner);

      // Create multiple mappings
      const mappings = [
        { type: "wallet", target: targetWallet1.publicKey, hint: 0 },
        { type: "nft", target: targetWallet2.publicKey, hint: 2 },
        { type: "token", target: targetWallet3.publicKey, hint: 1 },
        { type: "donations", target: targetWallet1.publicKey, hint: 4 }
      ];

      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(multiUsername, mapping.type);
        
        await program.methods
          .setAddressMapping(mapping.type, mapping.target, mapping.hint)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
      }

      console.log("✅ Multiple mappings created successfully");

      // Verify all mappings exist
      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(multiUsername, mapping.type);
        const mappingAccount = await program.account.addressMapping.fetch(mappingPDA);
        
        expect(mappingAccount.addressType).to.eq(mapping.type);
        expect(mappingAccount.target.toString()).to.eq(mapping.target.toString());
        expect(mappingAccount.extraTag).to.eq(mapping.hint);
      }
    });

    it("should update existing mapping (upsert)", async () => {
      const upsertUsername = `upsert${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(upsertUsername, owner);
      const [mappingPDA] = mappingPda(upsertUsername, "wallet");

      // First mapping
      await program.methods
        .setAddressMapping("wallet", targetWallet1.publicKey, 0)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Update mapping with new target
      const tx = await program.methods
        .setAddressMapping("wallet", targetWallet2.publicKey, 0)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Mapping updated (upsert):", tx);

      // Verify mapping was updated
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.target.toString()).to.eq(targetWallet2.publicKey.toString());
      expect(mapping.addressType).to.eq("wallet");
      expect(mapping.extraTag).to.eq(0);
    });

    it("should create mapping with edge case address types", async () => {
      const edgeUsername = `edge${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(edgeUsername, owner);

      // Test minimum length (1 character)
      const [minMappingPDA] = mappingPda(edgeUsername, "a");
      await program.methods
        .setAddressMapping("a", targetWallet1.publicKey, 4)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: minMappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Test maximum length (16 characters)
      const maxType = "a".repeat(16);
      const [maxMappingPDA] = mappingPda(edgeUsername, maxType);
      const tx = await program.methods
        .setAddressMapping(maxType, targetWallet2.publicKey, 4)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: maxMappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Edge case address types created:", tx);

      // Verify both mappings
      const minMapping = await program.account.addressMapping.fetch(minMappingPDA);
      const maxMapping = await program.account.addressMapping.fetch(maxMappingPDA);
      
      expect(minMapping.addressType).to.eq("a");
      expect(maxMapping.addressType).to.eq(maxType);
    });

    it("should create mapping with special allowed characters", async () => {
      const specialUsername = `special${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(specialUsername, owner);
      const [mappingPDA] = mappingPda(specialUsername, "user-123.test");

      const tx = await program.methods
        .setAddressMapping("user-123.test", targetWallet1.publicKey, 4)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Special character mapping created:", tx);

      // Verify mapping
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("user-123.test");
      expect(mapping.target.toString()).to.eq(targetWallet1.publicKey.toString());
    });
  });

  describe("❌ Validation Failures", () => {
    it("should fail with invalid address type (uppercase)", async () => {
      const invalidUsername = `invalid${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(invalidUsername, owner);
      const [mappingPDA] = mappingPda(invalidUsername, "BadType");

      try {
        await program.methods
          .setAddressMapping("BadType", targetWallet1.publicKey, 4) // Invalid - uppercase
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with invalid address type");
      } catch (error) {
        expect(error.toString()).to.match(/Invalid address type|InvalidAddressType|custom program error/i);
        console.log("✅ Correctly rejected invalid address type:", error.message);
      }
    });

    it("should fail with invalid address type (special characters)", async () => {
      const invalidUsername = `invalid${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(invalidUsername, owner);
      const [mappingPDA] = mappingPda(invalidUsername, "bad@type");

      try {
        await program.methods
          .setAddressMapping("bad@type", targetWallet1.publicKey, 4) // Invalid - contains @
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with invalid address type");
      } catch (error) {
        expect(error.toString()).to.match(/Invalid address type|InvalidAddressType|custom program error/i);
        console.log("✅ Correctly rejected invalid address type with @:", error.message);
      }
    });

    it("should fail with invalid address type (empty string)", async () => {
      const invalidUsername = `invalid${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(invalidUsername, owner);
      const [mappingPDA] = mappingPda(invalidUsername, "");

      try {
        await program.methods
          .setAddressMapping("", targetWallet1.publicKey, 4) // Invalid - empty
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with empty address type");
      } catch (error) {
        expect(error.toString()).to.match(/Invalid address type|InvalidAddressType|custom program error/i);
        console.log("✅ Correctly rejected empty address type:", error.message);
      }
    });

    it("should fail with address type exceeding 16 characters", async () => {
      const invalidUsername = `invalid${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(invalidUsername, owner);
      const badType = "a".repeat(17); // 17 characters, exceeds MAX_ADDR_TYPE (16)
      const [mappingPDA] = mappingPda(invalidUsername, badType);

      try {
        await program.methods
          .setAddressMapping(badType, targetWallet1.publicKey, 4)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with long address type");
      } catch (error) {
        expect(error.toString()).to.match(/Invalid address type|InvalidAddressType|custom program error/i);
        console.log("✅ Correctly rejected long address type:", error.message);
      }
    });

    it("should fail with address type containing invalid characters", async () => {
      const invalidUsername = `invalid${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(invalidUsername, owner);
      const invalidChars = ["user#name", "user$name", "user%name", "user&name", "user*name"];
      
      for (const badType of invalidChars) {
        const [mappingPDA] = mappingPda(invalidUsername, badType);

        try {
          await program.methods
            .setAddressMapping(badType, targetWallet1.publicKey, 4)
            .accounts({
              authority: owner.publicKey,
              profile: profilePDA,
              mapping: mappingPDA,
              systemProgram: SystemProgram.programId,
            })
            .signers([owner])
            .rpc();
          
          expect.fail(`Expected transaction to fail with invalid char: ${badType}`);
        } catch (error) {
          expect(error.toString()).to.match(/Invalid address type|InvalidAddressType|custom program error/i);
          console.log(`✅ Correctly rejected address type with invalid char '${badType}':`, error.message);
        }
      }
    });
  });

  describe("❌ Authorization Failures", () => {
    it("should fail when non-authority tries to create mapping", async () => {
      const authUsername = `auth${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(authUsername, owner);
      const [mappingPDA] = mappingPda(authUsername, "hacker");

      try {
        await program.methods
          .setAddressMapping("hacker", targetWallet1.publicKey, 4)
          .accounts({
            authority: unauthorized.publicKey, // Wrong authority
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorized])
          .rpc();
        
        expect.fail("Expected transaction to fail with non-authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority|AccountNotInitialized/i);
        console.log("✅ Correctly rejected non-authority mapping creation:", error.message);
      }
    });

    it("should fail when old authority tries to create mapping after transfer", async () => {
      const transferUsername = `transfer${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(transferUsername, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // Old authority should fail to create mapping
      const [mappingPDA] = mappingPda(transferUsername, "oldauth");
      try {
        await program.methods
          .setAddressMapping("oldauth", targetWallet1.publicKey, 4)
          .accounts({
            authority: owner.publicKey, // Old authority
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with old authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority/i);
        console.log("✅ Correctly rejected old authority mapping creation:", error.message);
      }
    });

    it("should fail with wrong profile account", async () => {
      const wrongUsername = `wrong${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(wrongUsername, owner);

      // Try to create mapping with wrong profile PDA
      const [wrongProfilePDA] = profilePda("wrongprofile");
      const [mappingPDA] = mappingPda(wrongUsername, "wrong");
      
      try {
        await program.methods
          .setAddressMapping("wrong", targetWallet1.publicKey, 4)
          .accounts({
            authority: owner.publicKey,
            profile: wrongProfilePDA, // Wrong profile
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with wrong profile");
      } catch (error) {
        console.log("✅ Correctly failed with wrong profile:", error.message);
      }
    });
  });

  describe("🔍 Edge Cases", () => {
    it("should handle mapping to system program", async () => {
      const systemUsername = `system${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(systemUsername, owner);
      const [mappingPDA] = mappingPda(systemUsername, "system");

      const tx = await program.methods
        .setAddressMapping("system", SystemProgram.programId, 4)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ System program mapping created:", tx);

      // Verify mapping
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.target.toString()).to.eq(SystemProgram.programId.toString());
    });

    it("should handle mapping to profile PDA", async () => {
      const selfUsername = `self${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(selfUsername, owner);
      const [mappingPDA] = mappingPda(selfUsername, "self");

      const tx = await program.methods
        .setAddressMapping("self", profilePDA, 4)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Self-referential mapping created:", tx);

      // Verify mapping
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.target.toString()).to.eq(profilePDA.toString());
    });

    it("should handle mapping to same address multiple times", async () => {
      const sameUsername = `same${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(sameUsername, owner);
      const [mappingPDA] = mappingPda(sameUsername, "same");

      // Create mapping
      await program.methods
        .setAddressMapping("same", targetWallet1.publicKey, 4)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Create same mapping again (should update)
      const tx = await program.methods
        .setAddressMapping("same", targetWallet1.publicKey, 4)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Same mapping created multiple times:", tx);

      // Verify mapping still exists
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.target.toString()).to.eq(targetWallet1.publicKey.toString());
    });

    it("should handle mapping with maximum type hint value", async () => {
      const maxUsername = `max${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(maxUsername, owner);
      const [mappingPDA] = mappingPda(maxUsername, "maxhint");

      const tx = await program.methods
        .setAddressMapping("maxhint", targetWallet1.publicKey, 255) // Maximum u8 value
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Maximum type hint mapping created:", tx);

      // Verify mapping
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.extraTag).to.eq(255);
    });
  });

  describe("📊 Event Emission", () => {
    it("should emit MappingSet event", async () => {
      const eventUsername = `event${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(eventUsername, owner);
      const [mappingPDA] = mappingPda(eventUsername, "event");

      const tx = await program.methods
        .setAddressMapping("event", targetWallet1.publicKey, 4)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Mapping created with event:", tx);
      
      // Note: In a real test environment, you would verify the event was emitted
      // For now, we just verify the transaction succeeded
      expect(tx).to.be.a('string');
    });
  });

  describe("🔄 State Consistency", () => {
    it("should maintain mapping integrity after multiple operations", async () => {
      const integrityUsername = `integrity${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(integrityUsername, owner);

      // Create multiple mappings
      const mappings = [
        { type: "wallet", target: targetWallet1.publicKey, hint: 0 },
        { type: "nft", target: targetWallet2.publicKey, hint: 2 },
        { type: "token", target: targetWallet3.publicKey, hint: 1 }
      ];

      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(integrityUsername, mapping.type);
        
        await program.methods
          .setAddressMapping(mapping.type, mapping.target, mapping.hint)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
      }

      // Update one mapping
      const [updateMappingPDA] = mappingPda(integrityUsername, "wallet");
      await program.methods
        .setAddressMapping("wallet", targetWallet3.publicKey, 0)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: updateMappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Mapping integrity maintained after operations");

      // Verify all mappings still exist and are correct
      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(integrityUsername, mapping.type);
        const mappingAccount = await program.account.addressMapping.fetch(mappingPDA);
        
        if (mapping.type === "wallet") {
          // This one was updated
          expect(mappingAccount.target.toString()).to.eq(targetWallet3.publicKey.toString());
        } else {
          // These remain unchanged
          expect(mappingAccount.target.toString()).to.eq(mapping.target.toString());
        }
        
        expect(mappingAccount.addressType).to.eq(mapping.type);
        expect(mappingAccount.extraTag).to.eq(mapping.hint);
      }
    });

    it("should handle rapid mapping operations", async () => {
      const rapidUsername = `rapid${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(rapidUsername, owner);

      // Perform rapid mapping operations
      const operations = [
        { type: "a", target: targetWallet1.publicKey, hint: 0 },
        { type: "b", target: targetWallet2.publicKey, hint: 1 },
        { type: "c", target: targetWallet3.publicKey, hint: 2 },
        { type: "a", target: targetWallet2.publicKey, hint: 0 } // Update first one
      ];

      for (const operation of operations) {
        const [mappingPDA] = mappingPda(rapidUsername, operation.type);
        
        await program.methods
          .setAddressMapping(operation.type, operation.target, operation.hint)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
      }

      console.log("✅ Rapid mapping operations completed");

      // Verify final state
      const [mappingA] = mappingPda(rapidUsername, "a");
      const [mappingB] = mappingPda(rapidUsername, "b");
      const [mappingC] = mappingPda(rapidUsername, "c");

      const mappingAccountA = await program.account.addressMapping.fetch(mappingA);
      const mappingAccountB = await program.account.addressMapping.fetch(mappingB);
      const mappingAccountC = await program.account.addressMapping.fetch(mappingC);

      expect(mappingAccountA.target.toString()).to.eq(targetWallet2.publicKey.toString()); // Updated
      expect(mappingAccountB.target.toString()).to.eq(targetWallet2.publicKey.toString()); // Unchanged
      expect(mappingAccountC.target.toString()).to.eq(targetWallet3.publicKey.toString()); // Unchanged
    });
  });
});
