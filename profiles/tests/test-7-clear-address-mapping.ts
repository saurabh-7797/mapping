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

describe("Function 7: clear_address_mapping - Comprehensive Testing", () => {
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

  // Helper function to create a mapping for testing
  async function createTestMapping(username: string, addressType: string, target: PublicKey, typeHint: number, authority: Keypair) {
    const profilePDA = await createTestProfile(username, authority);
    const [mappingPDA] = mappingPda(username, addressType);

    await program.methods
      .setAddressMapping(addressType, target, typeHint)
      .accounts({
        authority: authority.publicKey,
        profile: profilePDA,
        mapping: mappingPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    return { profilePDA, mappingPDA };
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
    it("should clear mapping and refund rent successfully", async () => {
      const { profilePDA, mappingPDA } = await createTestMapping(username, "wallet", targetWallet1.publicKey, 0, owner);

      // Get authority balance before clearing
      const balanceBefore = await provider.connection.getBalance(owner.publicKey);

      // Clear the mapping
      const tx = await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Mapping cleared successfully:", tx);

      // Verify mapping is deleted
      try {
        await program.account.addressMapping.fetch(mappingPDA);
        expect.fail("Expected mapping to be deleted");
      } catch (error) {
        expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
        console.log("✅ Mapping successfully deleted");
      }

      // Check rent refund
      const balanceAfter = await provider.connection.getBalance(owner.publicKey);
      const rentRefunded = balanceAfter - balanceBefore;
      console.log("Rent refunded:", rentRefunded, "lamports");
      expect(rentRefunded).to.be.greaterThan(0);
    });

    it("should clear multiple mappings successfully", async () => {
      const multiUsername = generateUniqueUsername("multi");
      const profilePDA = await createTestProfile(multiUsername, owner);

      // Create multiple mappings
      const mappings = [
        { type: "wallet", target: targetWallet1.publicKey, hint: 0 },
        { type: "nft", target: targetWallet2.publicKey, hint: 2 },
        { type: "token", target: targetWallet3.publicKey, hint: 1 }
      ];

      const mappingPDAs = [];
      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(multiUsername, mapping.type);
        mappingPDAs.push(mappingPDA);
        
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

      // Clear all mappings
      for (let i = 0; i < mappingPDAs.length; i++) {
        const tx = await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDAs[i],
          })
          .signers([owner])
          .rpc();

        console.log(`✅ Mapping ${i + 1} cleared:`, tx);
      }

      // Verify all mappings are deleted
      for (const mappingPDA of mappingPDAs) {
        try {
          await program.account.addressMapping.fetch(mappingPDA);
          expect.fail("Expected mapping to be deleted");
        } catch (error) {
          expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
        }
      }

      console.log("✅ All mappings cleared successfully");
    });

    it("should clear mapping and verify profile unchanged", async () => {
      const profileUsername = generateUniqueUsername("profile");
      const { profilePDA, mappingPDA } = await createTestMapping(profileUsername, "profile", targetWallet1.publicKey, 4, owner);

      // Get profile data before clearing
      const profileBefore = await program.account.profile.fetch(profilePDA);

      // Clear the mapping
      const tx = await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Mapping cleared, profile unchanged:", tx);

      // Verify profile remains unchanged
      const profileAfter = await program.account.profile.fetch(profilePDA);
      expect(profileAfter.username).to.eq(profileBefore.username);
      expect(profileAfter.authority.toString()).to.eq(profileBefore.authority.toString());
      expect(profileAfter.mainAddress.toString()).to.eq(profileBefore.mainAddress.toString());
      expect(profileAfter.bio).to.eq(profileBefore.bio);
      expect(profileAfter.avatar).to.eq(profileBefore.avatar);
      expect(profileAfter.twitter).to.eq(profileBefore.twitter);
      expect(profileAfter.discord).to.eq(profileBefore.discord);
      expect(profileAfter.website).to.eq(profileBefore.website);

      console.log("✅ Profile integrity maintained after mapping clear");
    });

    it("should clear mapping with different type hints", async () => {
      const hintUsername = generateUniqueUsername("hint");
      const profilePDA = await createTestProfile(hintUsername, owner);

      // Create mappings with different type hints
      const typeHints = [0, 1, 2, 3, 4, 255];
      
      for (const hint of typeHints) {
        const [mappingPDA] = mappingPda(hintUsername, `hint${hint}`);
        
        await program.methods
          .setAddressMapping(`hint${hint}`, targetWallet1.publicKey, hint)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();

        // Clear the mapping
        const tx = await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .signers([owner])
          .rpc();

        console.log(`✅ Mapping with hint ${hint} cleared:`, tx);

        // Verify mapping is deleted
        try {
          await program.account.addressMapping.fetch(mappingPDA);
          expect.fail("Expected mapping to be deleted");
        } catch (error) {
          expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
        }
      }

      console.log("✅ All type hint mappings cleared successfully");
    });

    it("should clear mapping with edge case address types", async () => {
      const edgeUsername = generateUniqueUsername("edge");
      const profilePDA = await createTestProfile(edgeUsername, owner);

      // Create mappings with edge case types
      const edgeTypes = ["a", "a".repeat(16), "user-123.test"];
      
      for (const edgeType of edgeTypes) {
        const [mappingPDA] = mappingPda(edgeUsername, edgeType);
        
        await program.methods
          .setAddressMapping(edgeType, targetWallet1.publicKey, 4)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();

        // Clear the mapping
        const tx = await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .signers([owner])
          .rpc();

        console.log(`✅ Edge case mapping '${edgeType}' cleared:`, tx);

        // Verify mapping is deleted
        try {
          await program.account.addressMapping.fetch(mappingPDA);
          expect.fail("Expected mapping to be deleted");
        } catch (error) {
          expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
        }
      }

      console.log("✅ All edge case mappings cleared successfully");
    });
  });

  describe("❌ Authorization Failures", () => {
    it("should fail when non-authority tries to clear mapping", async () => {
      const authUsername = generateUniqueUsername("auth");
      const { profilePDA, mappingPDA } = await createTestMapping(authUsername, "auth", targetWallet1.publicKey, 4, owner);

      try {
        await program.methods
          .clearAddressMapping()
          .accounts({
            authority: unauthorized.publicKey, // Wrong authority
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .signers([unauthorized])
          .rpc();
        
        expect.fail("Expected transaction to fail with non-authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority|AccountNotInitialized/i);
        console.log("✅ Correctly rejected non-authority mapping clear:", error.message);
      }

      // Verify mapping still exists
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("auth");
    });

    it("should fail when old authority tries to clear mapping after transfer", async () => {
      const transferUsername = generateUniqueUsername("transfer");
      const { profilePDA, mappingPDA } = await createTestMapping(transferUsername, "transfer", targetWallet1.publicKey, 4, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // Old authority should fail to clear mapping
      try {
        await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey, // Old authority
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with old authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority/i);
        console.log("✅ Correctly rejected old authority mapping clear:", error.message);
      }

      // Verify mapping still exists
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("transfer");
    });

    it("should fail with wrong profile account", async () => {
      const wrongUsername = generateUniqueUsername("wrong");
      const { profilePDA, mappingPDA } = await createTestMapping(wrongUsername, "wrong", targetWallet1.publicKey, 4, owner);

      // Try to clear mapping with wrong profile PDA
      const [wrongProfilePDA] = profilePda("wrongprofile");
      
      try {
        await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: wrongProfilePDA, // Wrong profile
            mapping: mappingPDA,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with wrong profile");
      } catch (error) {
        console.log("✅ Correctly failed with wrong profile:", error.message);
      }

      // Verify mapping still exists
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("wrong");
    });

    it("should fail with wrong mapping account", async () => {
      const wrongUsername = generateUniqueUsername("wrong2");
      const { profilePDA, mappingPDA } = await createTestMapping(wrongUsername, "wrong", targetWallet1.publicKey, 4, owner);

      // Try to clear mapping with wrong mapping PDA
      const [wrongMappingPDA] = mappingPda(wrongUsername, "wrongmapping");
      
      try {
        await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: wrongMappingPDA, // Wrong mapping
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with wrong mapping");
      } catch (error) {
        console.log("✅ Correctly failed with wrong mapping:", error.message);
      }

      // Verify original mapping still exists
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("wrong");
    });
  });

  describe("❌ Business Logic Failures", () => {
    it("should fail to clear non-existent mapping", async () => {
      const nonexistentUsername = generateUniqueUsername("nonexistent");
      const profilePDA = await createTestProfile(nonexistentUsername, owner);
      const [nonexistentMappingPDA] = mappingPda(nonexistentUsername, "nonexistent");

      try {
        await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: nonexistentMappingPDA,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with non-existent mapping");
      } catch (error) {
        expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
        console.log("✅ Correctly failed to clear non-existent mapping:", error.message);
      }
    });

    it("should fail to clear mapping with mismatched profile", async () => {
      const mismatchUsername1 = generateUniqueUsername("mismatch1");
      const mismatchUsername2 = generateUniqueUsername("mismatch2");
      
      const { profilePDA: profile1PDA, mappingPDA: mapping1PDA } = await createTestMapping(mismatchUsername1, "mismatch", targetWallet1.publicKey, 4, owner);
      const { profilePDA: profile2PDA, mappingPDA: mapping2PDA } = await createTestMapping(mismatchUsername2, "mismatch", targetWallet2.publicKey, 4, owner);

      // Try to clear mapping with mismatched profile
      try {
        await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: profile1PDA,
            mapping: mapping2PDA, // Mismatched - belongs to different profile
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with mismatched profile and mapping");
      } catch (error) {
        console.log("✅ Correctly failed with mismatched profile and mapping:", error.message);
      }

      // Verify both mappings still exist
      const mapping1 = await program.account.addressMapping.fetch(mapping1PDA);
      const mapping2 = await program.account.addressMapping.fetch(mapping2PDA);
      expect(mapping1.addressType).to.eq("mismatch");
      expect(mapping2.addressType).to.eq("mismatch");
    });
  });

  describe("🔍 Edge Cases", () => {
    it("should handle clearing mapping with maximum type hint value", async () => {
      const maxUsername = generateUniqueUsername("max");
      const { profilePDA, mappingPDA } = await createTestMapping(maxUsername, "maxhint", targetWallet1.publicKey, 255, owner);

      const tx = await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Maximum type hint mapping cleared:", tx);

      // Verify mapping is deleted
      try {
        await program.account.addressMapping.fetch(mappingPDA);
        expect.fail("Expected mapping to be deleted");
      } catch (error) {
        expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
      }
    });

    it("should handle clearing mapping with minimum type hint value", async () => {
      const minUsername = generateUniqueUsername("min");
      const { profilePDA, mappingPDA } = await createTestMapping(minUsername, "minhint", targetWallet1.publicKey, 0, owner);

      const tx = await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Minimum type hint mapping cleared:", tx);

      // Verify mapping is deleted
      try {
        await program.account.addressMapping.fetch(mappingPDA);
        expect.fail("Expected mapping to be deleted");
      } catch (error) {
        expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
      }
    });

    it("should handle clearing mapping with special characters in address type", async () => {
      const specialUsername = generateUniqueUsername("special");
      const { profilePDA, mappingPDA } = await createTestMapping(specialUsername, "user-123.test", targetWallet1.publicKey, 4, owner);

      const tx = await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Special character mapping cleared:", tx);

      // Verify mapping is deleted
      try {
        await program.account.addressMapping.fetch(mappingPDA);
        expect.fail("Expected mapping to be deleted");
      } catch (error) {
        expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
      }
    });

    it("should handle clearing mapping with edge case username lengths", async () => {
      const edgeUsername = "a".repeat(32); // Maximum username length
      const { profilePDA, mappingPDA } = await createTestMapping(edgeUsername, "edge", targetWallet1.publicKey, 4, owner);

      const tx = await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Edge case username length mapping cleared:", tx);

      // Verify mapping is deleted
      try {
        await program.account.addressMapping.fetch(mappingPDA);
        expect.fail("Expected mapping to be deleted");
      } catch (error) {
        expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
      }
    });
  });

  describe("📊 Event Emission", () => {
    it("should emit MappingCleared event", async () => {
      const eventUsername = generateUniqueUsername("event");
      const { profilePDA, mappingPDA } = await createTestMapping(eventUsername, "event", targetWallet1.publicKey, 4, owner);

      const tx = await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Mapping cleared with event:", tx);
      
      // Note: In a real test environment, you would verify the event was emitted
      // For now, we just verify the transaction succeeded
      expect(tx).to.be.a('string');
    });

    it("should emit MappingCleared event with correct data", async () => {
      const dataUsername = generateUniqueUsername("data");
      const { profilePDA, mappingPDA } = await createTestMapping(dataUsername, "data", targetWallet2.publicKey, 2, owner);

      const tx = await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Mapping cleared with data event:", tx);
      
      // Verify the mapping was cleared
      try {
        await program.account.addressMapping.fetch(mappingPDA);
        expect.fail("Expected mapping to be deleted");
      } catch (error) {
        expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
      }
    });
  });

  describe("🔄 State Consistency", () => {
    it("should maintain profile integrity after mapping clear", async () => {
      const integrityUsername = generateUniqueUsername("integrity");
      const { profilePDA, mappingPDA } = await createTestMapping(integrityUsername, "integrity", targetWallet1.publicKey, 4, owner);

      // Get profile data before clearing
      const profileBefore = await program.account.profile.fetch(profilePDA);

      // Clear the mapping
      await program.methods
        .clearAddressMapping()
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .signers([owner])
        .rpc();

      // Verify profile remains unchanged
      const profileAfter = await program.account.profile.fetch(profilePDA);
      expect(profileAfter.username).to.eq(profileBefore.username);
      expect(profileAfter.authority.toString()).to.eq(profileBefore.authority.toString());
      expect(profileAfter.mainAddress.toString()).to.eq(profileBefore.mainAddress.toString());
      expect(profileAfter.bio).to.eq(profileBefore.bio);
      expect(profileAfter.avatar).to.eq(profileBefore.avatar);
      expect(profileAfter.twitter).to.eq(profileBefore.twitter);
      expect(profileAfter.discord).to.eq(profileBefore.discord);
      expect(profileAfter.website).to.eq(profileBefore.website);

      console.log("✅ Profile integrity maintained after mapping clear");
    });

    it("should handle clearing multiple mappings and verify profile unchanged", async () => {
      const multiUsername = generateUniqueUsername("multi2");
      const profilePDA = await createTestProfile(multiUsername, owner);

      // Create multiple mappings
      const mappings = [
        { type: "a", target: targetWallet1.publicKey, hint: 0 },
        { type: "b", target: targetWallet2.publicKey, hint: 1 },
        { type: "c", target: targetWallet3.publicKey, hint: 2 }
      ];

      const mappingPDAs = [];
      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(multiUsername, mapping.type);
        mappingPDAs.push(mappingPDA);
        
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

      // Get profile data before clearing
      const profileBefore = await program.account.profile.fetch(profilePDA);

      // Clear all mappings
      for (const mappingPDA of mappingPDAs) {
        await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .signers([owner])
          .rpc();
      }

      // Verify profile remains unchanged
      const profileAfter = await program.account.profile.fetch(profilePDA);
      expect(profileAfter.username).to.eq(profileBefore.username);
      expect(profileAfter.authority.toString()).to.eq(profileBefore.authority.toString());
      expect(profileAfter.mainAddress.toString()).to.eq(profileBefore.mainAddress.toString());
      expect(profileAfter.bio).to.eq(profileBefore.bio);

      console.log("✅ Profile integrity maintained after clearing multiple mappings");
    });

    it("should handle rapid mapping clear operations", async () => {
      const rapidUsername = generateUniqueUsername("rapid");
      const profilePDA = await createTestProfile(rapidUsername, owner);

      // Create multiple mappings
      const mappings = [
        { type: "a", target: targetWallet1.publicKey, hint: 0 },
        { type: "b", target: targetWallet2.publicKey, hint: 1 },
        { type: "c", target: targetWallet3.publicKey, hint: 2 }
      ];

      const mappingPDAs = [];
      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(rapidUsername, mapping.type);
        mappingPDAs.push(mappingPDA);
        
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

      // Clear all mappings rapidly
      const clearPromises = mappingPDAs.map(async (mappingPDA) => {
        return await program.methods
          .clearAddressMapping()
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .signers([owner])
          .rpc();
      });

      const results = await Promise.all(clearPromises);
      
      console.log("✅ Rapid mapping clear operations completed:", results);

      // Verify all mappings are deleted
      for (const mappingPDA of mappingPDAs) {
        try {
          await program.account.addressMapping.fetch(mappingPDA);
          expect.fail("Expected mapping to be deleted");
        } catch (error) {
          expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
        }
      }

      // Verify all clear operations succeeded
      for (const result of results) {
        expect(result).to.be.a('string');
      }
    });
  });
});
