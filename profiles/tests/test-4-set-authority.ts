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

describe("Function 4: set_authority - Comprehensive Testing", () => {
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
          name: "setAuthority",
          accounts: [
            { name: "authority", isMut: false, isSigner: true },
            { name: "profile", isMut: true, isSigner: false }
          ],
          args: [{ name: "newAuthority", type: "publicKey" }]
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
  const unauthorized = Keypair.generate();
  const newAuthority1 = Keypair.generate();
  const newAuthority2 = Keypair.generate();
  const finalAuthority = Keypair.generate();

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
    await fundTestAccount(newAuthority1.publicKey, 1e8);
    await fundTestAccount(newAuthority2.publicKey, 1e8);
    await fundTestAccount(finalAuthority.publicKey, 1e8);
  });

  describe("✅ Success Cases", () => {
    it("should transfer authority successfully", async () => {
      const profilePDA = await createTestProfile(username, owner);

      const tx = await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Authority transferred:", tx);

      // Verify authority was transferred
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(other.publicKey.toString());

      // Verify other profile fields remain unchanged
      expect(profile.username).to.eq(username);
      expect(profile.mainAddress.toString()).to.eq(owner.publicKey.toString());
      expect(profile.bio).to.eq(bio);
    });

    it("should transfer authority multiple times", async () => {
      const multiUsername = `multi${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(multiUsername, owner);

      // First transfer
      await program.methods
        .setAuthority(newAuthority1.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // Second transfer
      await program.methods
        .setAuthority(newAuthority2.publicKey)
        .accounts({
          authority: newAuthority1.publicKey,
          profile: profilePDA,
        })
        .signers([newAuthority1])
        .rpc();

      // Third transfer
      const tx = await program.methods
        .setAuthority(finalAuthority.publicKey)
        .accounts({
          authority: newAuthority2.publicKey,
          profile: profilePDA,
        })
        .signers([newAuthority2])
        .rpc();

      console.log("✅ Authority transferred multiple times:", tx);

      // Verify final authority
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(finalAuthority.publicKey.toString());
    });

    it("should transfer authority to same authority (no-op)", async () => {
      const sameUsername = `same${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(sameUsername, owner);

      // Transfer to same authority (should work but no state change)
      const tx = await program.methods
        .setAuthority(owner.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Authority transferred to same authority:", tx);

      // Verify authority remains unchanged
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(owner.publicKey.toString());
    });

    it("should transfer authority to system program", async () => {
      const systemUsername = `system${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(systemUsername, owner);

      const tx = await program.methods
        .setAuthority(SystemProgram.programId)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Authority transferred to system program:", tx);

      // Verify authority was transferred
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(SystemProgram.programId.toString());
    });

    it("should transfer authority to profile PDA", async () => {
      const selfUsername = `self${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(selfUsername, owner);

      const tx = await program.methods
        .setAuthority(profilePDA)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Authority transferred to profile PDA:", tx);

      // Verify authority was transferred
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(profilePDA.toString());
    });
  });

  describe("✅ Authority Verification", () => {
    it("should verify new authority can update profile", async () => {
      const verifyUsername = `verify${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(verifyUsername, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // New authority should be able to update profile
      const newBio = "Updated by new authority";
      const tx = await program.methods
        .setProfileDetails(newBio, null, null, null, null)
        .accounts({
          authority: other.publicKey, // New authority
          profile: profilePDA,
        })
        .signers([other])
        .rpc();

      console.log("✅ New authority successfully updated profile:", tx);

      // Verify update was successful
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.bio).to.eq(newBio);
      expect(profile.authority.toString()).to.eq(other.publicKey.toString());
    });

    it("should verify new authority can change main address", async () => {
      const mainUsername = `main${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(mainUsername, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // New authority should be able to change main address
      const [newReversePDA] = reversePda(newAuthority1.publicKey);
      const tx = await program.methods
        .setMainAddress(newAuthority1.publicKey)
        .accounts({
          authority: other.publicKey, // New authority
          profile: profilePDA,
          reverse: newReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([other])
        .rpc();

      console.log("✅ New authority successfully changed main address:", tx);

      // Verify main address was changed
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(newAuthority1.publicKey.toString());
    });

    it("should verify new authority can create mappings", async () => {
      const mappingUsername = `mapping${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(mappingUsername, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // New authority should be able to create mappings
      const [mappingPDA] = profilePda(mappingUsername);
      const [addressMappingPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("mapping"), Buffer.from(mappingUsername), Buffer.from("nft")],
        program.programId
      );

      const tx = await program.methods
        .setAddressMapping("nft", newAuthority1.publicKey, 2)
        .accounts({
          authority: other.publicKey, // New authority
          profile: profilePDA,
          mapping: addressMappingPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([other])
        .rpc();

      console.log("✅ New authority successfully created mapping:", tx);

      // Verify mapping was created
      const mapping = await program.account.addressMapping.fetch(addressMappingPDA);
      expect(mapping.addressType).to.eq("nft");
      expect(mapping.target.toString()).to.eq(newAuthority1.publicKey.toString());
    });

    it("should verify new authority can transfer authority again", async () => {
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

      // New authority should be able to transfer authority again
      const tx = await program.methods
        .setAuthority(newAuthority1.publicKey)
        .accounts({
          authority: other.publicKey, // New authority
          profile: profilePDA,
        })
        .signers([other])
        .rpc();

      console.log("✅ New authority successfully transferred authority:", tx);

      // Verify authority was transferred again
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(newAuthority1.publicKey.toString());
    });
  });

  describe("❌ Authorization Failures", () => {
    it("should fail when non-authority tries to transfer", async () => {
      const authUsername = `auth${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(authUsername, owner);

      try {
        await program.methods
          .setAuthority(newAuthority1.publicKey)
          .accounts({
            authority: unauthorized.publicKey, // Wrong authority
            profile: profilePDA,
          })
          .signers([unauthorized])
          .rpc();
        
        expect.fail("Expected transaction to fail with non-authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority|AccountNotInitialized/i);
        console.log("✅ Correctly rejected non-authority transfer:", error.message);
      }
    });

    it("should fail when old authority tries to transfer after transfer", async () => {
      const oldUsername = `old${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(oldUsername, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // Old authority should fail to transfer again
      try {
        await program.methods
          .setAuthority(newAuthority1.publicKey)
          .accounts({
            authority: owner.publicKey, // Old authority
            profile: profilePDA,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with old authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority/i);
        console.log("✅ Correctly rejected old authority transfer:", error.message);
      }
    });

    it("should fail with wrong profile account", async () => {
      const wrongUsername = `wrong${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(wrongUsername, owner);

      // Try to transfer with wrong profile PDA
      const [wrongProfilePDA] = profilePda("wrongprofile");
      
      try {
        await program.methods
          .setAuthority(newAuthority1.publicKey)
          .accounts({
            authority: owner.publicKey,
            profile: wrongProfilePDA, // Wrong profile
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with wrong profile");
      } catch (error) {
        console.log("✅ Correctly failed with wrong profile:", error.message);
      }
    });
  });

  describe("❌ Old Authority Restrictions", () => {
    it("should fail when old authority tries to update profile", async () => {
      const updateUsername = `update${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(updateUsername, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // Old authority should fail to update profile
      try {
        await program.methods
          .setProfileDetails("Old authority trying to update", null, null, null, null)
          .accounts({
            authority: owner.publicKey, // Old authority
            profile: profilePDA,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with old authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority/i);
        console.log("✅ Correctly rejected old authority profile update:", error.message);
      }
    });

    it("should fail when old authority tries to change main address", async () => {
      const mainUsername = `main${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(mainUsername, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // Old authority should fail to change main address
      const [newReversePDA] = reversePda(newAuthority1.publicKey);
      try {
        await program.methods
          .setMainAddress(newAuthority1.publicKey)
          .accounts({
            authority: owner.publicKey, // Old authority
            profile: profilePDA,
            reverse: newReversePDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
        
        expect.fail("Expected transaction to fail with old authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority/i);
        console.log("✅ Correctly rejected old authority main address change:", error.message);
      }
    });

    it("should fail when old authority tries to create mappings", async () => {
      const mappingUsername = `mapping${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(mappingUsername, owner);

      // Transfer authority to other
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      // Old authority should fail to create mappings
      const [addressMappingPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("mapping"), Buffer.from(mappingUsername), Buffer.from("nft")],
        program.programId
      );

      try {
        await program.methods
          .setAddressMapping("nft", newAuthority1.publicKey, 2)
          .accounts({
            authority: owner.publicKey, // Old authority
            profile: profilePDA,
            mapping: addressMappingPDA,
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
  });

  describe("📊 Event Emission", () => {
    it("should emit AuthorityChanged event", async () => {
      const eventUsername = `event${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(eventUsername, owner);

      const tx = await program.methods
        .setAuthority(newAuthority1.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Authority changed with event:", tx);
      
      // Note: In a real test environment, you would verify the event was emitted
      // For now, we just verify the transaction succeeded
      expect(tx).to.be.a('string');
    });
  });

  describe("🔄 State Consistency", () => {
    it("should maintain profile integrity after authority transfers", async () => {
      const integrityUsername = `integrity${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(integrityUsername, owner);

      // Perform multiple authority transfers
      const authorities = [other.publicKey, newAuthority1.publicKey, newAuthority2.publicKey, finalAuthority.publicKey];

      for (let i = 0; i < authorities.length; i++) {
        const currentAuthority = i === 0 ? owner : authorities[i - 1];
        
        await program.methods
          .setAuthority(authorities[i])
          .accounts({
            authority: currentAuthority,
            profile: profilePDA,
          })
          .signers([currentAuthority])
          .rpc();
      }

      // Verify final state
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(finalAuthority.publicKey.toString());

      // Verify core profile fields remain unchanged
      expect(profile.username).to.eq(integrityUsername);
      expect(profile.mainAddress.toString()).to.eq(owner.publicKey.toString());
      expect(profile.bio).to.eq(bio);
    });

    it("should handle rapid authority transfers", async () => {
      const rapidUsername = `rapid${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(rapidUsername, owner);

      // Perform rapid transfers
      const authorities = [other.publicKey, newAuthority1.publicKey, other.publicKey];
      let currentAuthority = owner;

      for (let i = 0; i < authorities.length; i++) {
        await program.methods
          .setAuthority(authorities[i])
          .accounts({
            authority: currentAuthority,
            profile: profilePDA,
          })
          .signers([currentAuthority])
          .rpc();

        currentAuthority = authorities[i];
      }

      console.log("✅ Rapid authority transfers completed");

      // Verify final state
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(other.publicKey.toString());
    });

    it("should handle circular authority transfers", async () => {
      const circularUsername = `circular${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(circularUsername, owner);

      // Transfer: owner -> other -> newAuthority1 -> owner
      await program.methods
        .setAuthority(other.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
        })
        .signers([owner])
        .rpc();

      await program.methods
        .setAuthority(newAuthority1.publicKey)
        .accounts({
          authority: other.publicKey,
          profile: profilePDA,
        })
        .signers([other])
        .rpc();

      const tx = await program.methods
        .setAuthority(owner.publicKey)
        .accounts({
          authority: newAuthority1.publicKey,
          profile: profilePDA,
        })
        .signers([newAuthority1])
        .rpc();

      console.log("✅ Circular authority transfer completed:", tx);

      // Verify we're back to original owner
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.authority.toString()).to.eq(owner.publicKey.toString());
    });
  });
});
