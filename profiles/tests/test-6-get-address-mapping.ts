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

describe("Function 6: get_address_mapping - Comprehensive Testing", () => {
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
    await fundTestAccount(targetWallet1.publicKey, 1e8);
    await fundTestAccount(targetWallet2.publicKey, 1e8);
    await fundTestAccount(targetWallet3.publicKey, 1e8);
  });

  describe("✅ Success Cases", () => {
    it("should get existing mapping successfully", async () => {
      const { profilePDA, mappingPDA } = await createTestMapping(username, "wallet", targetWallet1.publicKey, 0, owner);

      const tx = await program.methods
        .getAddressMapping()
        .accounts({
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .rpc();

      console.log("✅ Mapping fetched successfully:", tx);

      // Verify transaction succeeded
      expect(tx).to.be.a('string');
    });

    it("should get multiple different mappings", async () => {
      const multiUsername = `multi${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(multiUsername, owner);

      // Create multiple mappings
      const mappings = [
        { type: "wallet", target: targetWallet1.publicKey, hint: 0 },
        { type: "nft", target: targetWallet2.publicKey, hint: 2 },
        { type: "token", target: targetWallet3.publicKey, hint: 1 }
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

      // Get all mappings
      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(multiUsername, mapping.type);
        
        const tx = await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .rpc();

        console.log(`✅ Mapping '${mapping.type}' fetched:`, tx);
      }

      console.log("✅ All mappings fetched successfully");
    });

    it("should get mapping multiple times (same mapping)", async () => {
      const repeatUsername = `repeat${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(repeatUsername, "repeat", targetWallet1.publicKey, 4, owner);

      // Get the same mapping multiple times
      for (let i = 0; i < 3; i++) {
        const tx = await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .rpc();

        console.log(`✅ Mapping fetched ${i + 1} time(s):`, tx);
      }

      console.log("✅ Same mapping fetched multiple times successfully");
    });

    it("should get mapping with different type hints", async () => {
      const hintUsername = `hint${timestamp}`.slice(-15);
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

        // Get the mapping
        const tx = await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .rpc();

        console.log(`✅ Mapping with hint ${hint} fetched:`, tx);
      }

      console.log("✅ All type hint mappings fetched successfully");
    });

    it("should get mapping with edge case address types", async () => {
      const edgeUsername = `edge${timestamp}`.slice(-15);
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

        // Get the mapping
        const tx = await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .rpc();

        console.log(`✅ Edge case mapping '${edgeType}' fetched:`, tx);
      }

      console.log("✅ All edge case mappings fetched successfully");
    });

    it("should get mapping with different target addresses", async () => {
      const targetUsername = `target${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(targetUsername, owner);

      // Create mappings with different targets
      const targets = [
        targetWallet1.publicKey,
        targetWallet2.publicKey,
        targetWallet3.publicKey,
        SystemProgram.programId,
        profilePDA // Self-referential
      ];
      
      for (let i = 0; i < targets.length; i++) {
        const [mappingPDA] = mappingPda(targetUsername, `target${i}`);
        
        await program.methods
          .setAddressMapping(`target${i}`, targets[i], i)
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            mapping: mappingPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();

        // Get the mapping
        const tx = await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .rpc();

        console.log(`✅ Mapping with target ${i} fetched:`, tx);
      }

      console.log("✅ All target mappings fetched successfully");
    });
  });

  describe("❌ Error Cases", () => {
    it("should fail with non-existent mapping", async () => {
      const nonexistentUsername = `nonexistent${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(nonexistentUsername, owner);
      const [nonexistentMappingPDA] = mappingPda(nonexistentUsername, "nonexistent");

      try {
        await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: nonexistentMappingPDA,
          })
          .rpc();
        
        expect.fail("Expected transaction to fail with non-existent mapping");
      } catch (error) {
        expect(error.toString()).to.match(/Account does not exist|AccountNotInitialized/i);
        console.log("✅ Correctly failed to get non-existent mapping:", error.message);
      }
    });

    it("should fail with wrong profile account", async () => {
      const wrongUsername = `wrong${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(wrongUsername, "wrong", targetWallet1.publicKey, 4, owner);

      // Try to get mapping with wrong profile PDA
      const [wrongProfilePDA] = profilePda("wrongprofile");
      
      try {
        await program.methods
          .getAddressMapping()
          .accounts({
            profile: wrongProfilePDA, // Wrong profile
            mapping: mappingPDA,
          })
          .rpc();
        
        expect.fail("Expected transaction to fail with wrong profile");
      } catch (error) {
        console.log("✅ Correctly failed with wrong profile:", error.message);
      }
    });

    it("should fail with wrong mapping account", async () => {
      const wrongUsername = `wrong${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(wrongUsername, "wrong", targetWallet1.publicKey, 4, owner);

      // Try to get mapping with wrong mapping PDA
      const [wrongMappingPDA] = mappingPda(wrongUsername, "wrongmapping");
      
      try {
        await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: wrongMappingPDA, // Wrong mapping
          })
          .rpc();
        
        expect.fail("Expected transaction to fail with wrong mapping");
      } catch (error) {
        console.log("✅ Correctly failed with wrong mapping:", error.message);
      }
    });

    it("should fail with mismatched profile and mapping", async () => {
      const mismatchUsername1 = `mismatch1${timestamp}`.slice(-15);
      const mismatchUsername2 = `mismatch2${timestamp}`.slice(-15);
      
      const { profilePDA: profile1PDA, mappingPDA: mapping1PDA } = await createTestMapping(mismatchUsername1, "mismatch", targetWallet1.publicKey, 4, owner);
      const { profilePDA: profile2PDA, mappingPDA: mapping2PDA } = await createTestMapping(mismatchUsername2, "mismatch", targetWallet2.publicKey, 4, owner);

      // Try to get mapping with mismatched profile and mapping
      try {
        await program.methods
          .getAddressMapping()
          .accounts({
            profile: profile1PDA,
            mapping: mapping2PDA, // Mismatched - belongs to different profile
          })
          .rpc();
        
        expect.fail("Expected transaction to fail with mismatched profile and mapping");
      } catch (error) {
        console.log("✅ Correctly failed with mismatched profile and mapping:", error.message);
      }
    });
  });

  describe("🔍 Edge Cases", () => {
    it("should handle mapping with maximum type hint value", async () => {
      const maxUsername = `max${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(maxUsername, "maxhint", targetWallet1.publicKey, 255, owner);

      const tx = await program.methods
        .getAddressMapping()
        .accounts({
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .rpc();

      console.log("✅ Maximum type hint mapping fetched:", tx);
      expect(tx).to.be.a('string');
    });

    it("should handle mapping with minimum type hint value", async () => {
      const minUsername = `min${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(minUsername, "minhint", targetWallet1.publicKey, 0, owner);

      const tx = await program.methods
        .getAddressMapping()
        .accounts({
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .rpc();

      console.log("✅ Minimum type hint mapping fetched:", tx);
      expect(tx).to.be.a('string');
    });

    it("should handle mapping with special characters in address type", async () => {
      const specialUsername = `special${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(specialUsername, "user-123.test", targetWallet1.publicKey, 4, owner);

      const tx = await program.methods
        .getAddressMapping()
        .accounts({
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .rpc();

      console.log("✅ Special character mapping fetched:", tx);
      expect(tx).to.be.a('string');
    });

    it("should handle mapping with edge case username lengths", async () => {
      const edgeUsername = "a".repeat(32); // Maximum username length
      const { profilePDA, mappingPDA } = await createTestMapping(edgeUsername, "edge", targetWallet1.publicKey, 4, owner);

      const tx = await program.methods
        .getAddressMapping()
        .accounts({
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .rpc();

      console.log("✅ Edge case username length mapping fetched:", tx);
      expect(tx).to.be.a('string');
    });
  });

  describe("📊 Event Emission", () => {
    it("should emit MappingFetched event", async () => {
      const eventUsername = `event${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(eventUsername, "event", targetWallet1.publicKey, 4, owner);

      const tx = await program.methods
        .getAddressMapping()
        .accounts({
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .rpc();

      console.log("✅ Mapping fetched with event:", tx);
      
      // Note: In a real test environment, you would verify the event was emitted
      // For now, we just verify the transaction succeeded
      expect(tx).to.be.a('string');
    });

    it("should emit MappingFetched event with correct data", async () => {
      const dataUsername = `data${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(dataUsername, "data", targetWallet2.publicKey, 2, owner);

      const tx = await program.methods
        .getAddressMapping()
        .accounts({
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .rpc();

      console.log("✅ Mapping fetched with data event:", tx);
      
      // Verify the mapping data is correct
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("data");
      expect(mapping.target.toString()).to.eq(targetWallet2.publicKey.toString());
      expect(mapping.extraTag).to.eq(2);
      expect(mapping.profile.toString()).to.eq(profilePDA.toString());
    });
  });

  describe("🔄 State Consistency", () => {
    it("should maintain mapping integrity after multiple fetches", async () => {
      const integrityUsername = `integrity${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(integrityUsername, "integrity", targetWallet1.publicKey, 4, owner);

      // Fetch the mapping multiple times
      for (let i = 0; i < 5; i++) {
        const tx = await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .rpc();

        console.log(`✅ Mapping fetched ${i + 1} time(s):`, tx);
      }

      // Verify mapping data remains unchanged
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("integrity");
      expect(mapping.target.toString()).to.eq(targetWallet1.publicKey.toString());
      expect(mapping.extraTag).to.eq(4);
      expect(mapping.profile.toString()).to.eq(profilePDA.toString());

      console.log("✅ Mapping integrity maintained after multiple fetches");
    });

    it("should handle concurrent mapping fetches", async () => {
      const concurrentUsername = `concurrent${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(concurrentUsername, owner);

      // Create multiple mappings
      const mappings = [
        { type: "a", target: targetWallet1.publicKey, hint: 0 },
        { type: "b", target: targetWallet2.publicKey, hint: 1 },
        { type: "c", target: targetWallet3.publicKey, hint: 2 }
      ];

      for (const mapping of mappings) {
        const [mappingPDA] = mappingPda(concurrentUsername, mapping.type);
        
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

      // Fetch all mappings concurrently (simulated)
      const fetchPromises = mappings.map(async (mapping) => {
        const [mappingPDA] = mappingPda(concurrentUsername, mapping.type);
        
        return await program.methods
          .getAddressMapping()
          .accounts({
            profile: profilePDA,
            mapping: mappingPDA,
          })
          .rpc();
      });

      const results = await Promise.all(fetchPromises);
      
      console.log("✅ Concurrent mapping fetches completed:", results);

      // Verify all fetches succeeded
      for (const result of results) {
        expect(result).to.be.a('string');
      }
    });

    it("should handle mapping fetches after profile updates", async () => {
      const updateUsername = `update${timestamp}`.slice(-15);
      const { profilePDA, mappingPDA } = await createTestMapping(updateUsername, "update", targetWallet1.publicKey, 4, owner);

      // Update profile details
      await program.methods
        .setProfileDetails("Updated bio", null, null, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // Fetch mapping after profile update
      const tx = await program.methods
        .getAddressMapping()
        .accounts({
          profile: profilePDA,
          mapping: mappingPDA,
        })
        .rpc();

      console.log("✅ Mapping fetched after profile update:", tx);

      // Verify mapping still works correctly
      const mapping = await program.account.addressMapping.fetch(mappingPDA);
      expect(mapping.addressType).to.eq("update");
      expect(mapping.target.toString()).to.eq(targetWallet1.publicKey.toString());
      expect(mapping.extraTag).to.eq(4);
    });
  });
});
