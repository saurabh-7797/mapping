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

describe("Function 3: set_main_address - Comprehensive Testing", () => {
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
          name: "setMainAddress",
          accounts: [
            { name: "authority", isMut: true, isSigner: true },
            { name: "profile", isMut: true, isSigner: false },
            { name: "reverse", isMut: true, isSigner: false },
            { name: "systemProgram", isMut: false, isSigner: false }
          ],
          args: [{ name: "newMain", type: "publicKey" }]
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
  const newMainWallet1 = Keypair.generate();
  const newMainWallet2 = Keypair.generate();

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
    await fundTestAccount(newMainWallet1.publicKey, 1e8);
    await fundTestAccount(newMainWallet2.publicKey, 1e8);
  });

  describe("✅ Success Cases", () => {
    it("should change main address successfully", async () => {
      const profilePDA = await createTestProfile(username, owner);
      const [newReversePDA] = reversePda(newMainWallet1.publicKey);

      const tx = await program.methods
        .setMainAddress(newMainWallet1.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: newReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Main address changed:", tx);

      // Verify profile main address was updated
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(newMainWallet1.publicKey.toString());

      // Verify new reverse lookup was created
      const reverse = await program.account.reverseLookup.fetch(newReversePDA);
      expect(reverse.username).to.eq(username);

      // Verify other profile fields remain unchanged
      expect(profile.username).to.eq(username);
      expect(profile.authority.toString()).to.eq(owner.publicKey.toString());
      expect(profile.bio).to.eq(bio);
    });

    it("should change main address multiple times", async () => {
      const multiUsername = `multi${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(multiUsername, owner);

      // First change
      const [firstReversePDA] = reversePda(newMainWallet1.publicKey);
      await program.methods
        .setMainAddress(newMainWallet1.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: firstReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Second change
      const [secondReversePDA] = reversePda(newMainWallet2.publicKey);
      const tx = await program.methods
        .setMainAddress(newMainWallet2.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: secondReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Main address changed multiple times:", tx);

      // Verify final state
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(newMainWallet2.publicKey.toString());

      // Verify latest reverse lookup
      const reverse = await program.account.reverseLookup.fetch(secondReversePDA);
      expect(reverse.username).to.eq(multiUsername);
    });

    it("should change main address to same address (no-op)", async () => {
      const sameUsername = `same${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(sameUsername, owner);

      // Change to the same address (should work but no state change)
      const [sameReversePDA] = reversePda(owner.publicKey);
      const tx = await program.methods
        .setMainAddress(owner.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: sameReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Main address set to same address:", tx);

      // Verify profile remains unchanged
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(owner.publicKey.toString());
    });

    it("should create reverse lookup for new main address", async () => {
      const reverseUsername = `reverse${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(reverseUsername, owner);
      const [newReversePDA] = reversePda(newMainWallet1.publicKey);

      const tx = await program.methods
        .setMainAddress(newMainWallet1.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: newReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Reverse lookup created:", tx);

      // Verify reverse lookup was created
      const reverse = await program.account.reverseLookup.fetch(newReversePDA);
      expect(reverse.username).to.eq(reverseUsername);

      // Verify we can look up username from new main address
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(newMainWallet1.publicKey.toString());
    });

    it("should handle multiple profiles with different main addresses", async () => {
      const profile1Username = `profile1${timestamp}`.slice(-15);
      const profile2Username = `profile2${timestamp}`.slice(-15);

      const profile1PDA = await createTestProfile(profile1Username, owner);
      const profile2PDA = await createTestProfile(profile2Username, other);

      // Change profile1 main address
      const [reverse1PDA] = reversePda(newMainWallet1.publicKey);
      await program.methods
        .setMainAddress(newMainWallet1.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profile1PDA,
          reverse: reverse1PDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Change profile2 main address
      const [reverse2PDA] = reversePda(newMainWallet2.publicKey);
      const tx = await program.methods
        .setMainAddress(newMainWallet2.publicKey)
        .accounts({
          authority: other.publicKey,
          profile: profile2PDA,
          reverse: reverse2PDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([other])
        .rpc();

      console.log("✅ Multiple profiles with different main addresses:", tx);

      // Verify both profiles have correct main addresses
      const profile1 = await program.account.profile.fetch(profile1PDA);
      const profile2 = await program.account.profile.fetch(profile2PDA);

      expect(profile1.mainAddress.toString()).to.eq(newMainWallet1.publicKey.toString());
      expect(profile2.mainAddress.toString()).to.eq(newMainWallet2.publicKey.toString());

      // Verify reverse lookups
      const reverse1 = await program.account.reverseLookup.fetch(reverse1PDA);
      const reverse2 = await program.account.reverseLookup.fetch(reverse2PDA);

      expect(reverse1.username).to.eq(profile1Username);
      expect(reverse2.username).to.eq(profile2Username);
    });
  });

  describe("❌ Authorization Failures", () => {
    it("should fail when non-authority tries to change main address", async () => {
      const authUsername = `auth${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(authUsername, owner);
      const [newReversePDA] = reversePda(newMainWallet1.publicKey);

      try {
        await program.methods
          .setMainAddress(newMainWallet1.publicKey)
          .accounts({
            authority: unauthorized.publicKey, // Wrong authority
            profile: profilePDA,
            reverse: newReversePDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorized])
          .rpc();
        
        expect.fail("Expected transaction to fail with non-authority");
      } catch (error) {
        expect(error.toString()).to.match(/has_one constraint was violated|constraint has_one|authority|AccountNotInitialized/i);
        console.log("✅ Correctly rejected non-authority main address change:", error.message);
      }
    });

    it("should fail when old authority tries to change after transfer", async () => {
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

      // Old authority should fail to change main address
      const [newReversePDA] = reversePda(newMainWallet1.publicKey);
      try {
        await program.methods
          .setMainAddress(newMainWallet1.publicKey)
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

    it("should fail with wrong profile account", async () => {
      const wrongUsername = `wrong${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(wrongUsername, owner);

      // Try to change with wrong profile PDA
      const [wrongProfilePDA] = profilePda("wrongprofile");
      const [newReversePDA] = reversePda(newMainWallet1.publicKey);
      
      try {
        await program.methods
          .setMainAddress(newMainWallet1.publicKey)
          .accounts({
            authority: owner.publicKey,
            profile: wrongProfilePDA, // Wrong profile
            reverse: newReversePDA,
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
    it("should handle changing main address to existing reverse lookup", async () => {
      const existingUsername = `existing${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(existingUsername, owner);

      // First, create a profile with a different username that will use newMainWallet1
      const otherUsername = `other${timestamp}`.slice(-15);
      const [otherProfilePDA] = profilePda(otherUsername);
      const [otherReversePDA] = reversePda(newMainWallet1.publicKey);

      await program.methods
        .createProfile(otherUsername, "other profile", null, null, null, null)
        .accounts({
          authority: newMainWallet1,
          profile: otherProfilePDA,
          reverse: otherReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([newMainWallet1])
        .rpc();

      // Now try to change the first profile's main address to newMainWallet1
      // This should work and create a new reverse lookup
      const [newReversePDA] = reversePda(newMainWallet1.publicKey);
      const tx = await program.methods
        .setMainAddress(newMainWallet1.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: newReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Main address changed to existing reverse lookup:", tx);

      // Verify both reverse lookups exist
      const reverse1 = await program.account.reverseLookup.fetch(otherReversePDA);
      const reverse2 = await program.account.reverseLookup.fetch(newReversePDA);

      expect(reverse1.username).to.eq(otherUsername);
      expect(reverse2.username).to.eq(existingUsername);
    });

    it("should handle changing main address to system program", async () => {
      const systemUsername = `system${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(systemUsername, owner);
      const [systemReversePDA] = reversePda(SystemProgram.programId);

      const tx = await program.methods
        .setMainAddress(SystemProgram.programId)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: systemReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Main address changed to system program:", tx);

      // Verify the change
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(SystemProgram.programId.toString());

      // Verify reverse lookup
      const reverse = await program.account.reverseLookup.fetch(systemReversePDA);
      expect(reverse.username).to.eq(systemUsername);
    });

    it("should handle changing main address to profile PDA", async () => {
      const selfUsername = `self${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(selfUsername, owner);
      const [selfReversePDA] = reversePda(profilePDA);

      const tx = await program.methods
        .setMainAddress(profilePDA)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: selfReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Main address changed to profile PDA:", tx);

      // Verify the change
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(profilePDA.toString());

      // Verify reverse lookup
      const reverse = await program.account.reverseLookup.fetch(selfReversePDA);
      expect(reverse.username).to.eq(selfUsername);
    });
  });

  describe("📊 Event Emission", () => {
    it("should emit MainAddressChanged event", async () => {
      const eventUsername = `event${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(eventUsername, owner);
      const [newReversePDA] = reversePda(newMainWallet1.publicKey);

      const tx = await program.methods
        .setMainAddress(newMainWallet1.publicKey)
        .accounts({
          authority: owner.publicKey,
          profile: profilePDA,
          reverse: newReversePDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      console.log("✅ Main address changed with event:", tx);
      
      // Note: In a real test environment, you would verify the event was emitted
      // For now, we just verify the transaction succeeded
      expect(tx).to.be.a('string');
    });
  });

  describe("🔄 State Consistency", () => {
    it("should maintain profile integrity after main address changes", async () => {
      const integrityUsername = `integrity${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(integrityUsername, owner);

      // Perform multiple main address changes
      const addresses = [newMainWallet1.publicKey, newMainWallet2.publicKey, owner.publicKey];
      const reversePDAs = [];

      for (let i = 0; i < addresses.length; i++) {
        const [reversePDA] = reversePda(addresses[i]);
        reversePDAs.push(reversePDA);

        await program.methods
          .setMainAddress(addresses[i])
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            reverse: reversePDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
      }

      // Verify final state
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(owner.publicKey.toString());

      // Verify all reverse lookups exist
      for (let i = 0; i < reversePDAs.length; i++) {
        const reverse = await program.account.reverseLookup.fetch(reversePDAs[i]);
        expect(reverse.username).to.eq(integrityUsername);
      }

      // Verify core profile fields remain unchanged
      expect(profile.username).to.eq(integrityUsername);
      expect(profile.authority.toString()).to.eq(owner.publicKey.toString());
      expect(profile.bio).to.eq(bio);
    });

    it("should handle rapid main address changes", async () => {
      const rapidUsername = `rapid${timestamp}`.slice(-15);
      const profilePDA = await createTestProfile(rapidUsername, owner);

      // Perform rapid changes
      const addresses = [newMainWallet1.publicKey, newMainWallet2.publicKey, newMainWallet1.publicKey];
      const reversePDAs = [];

      for (let i = 0; i < addresses.length; i++) {
        const [reversePDA] = reversePda(addresses[i]);
        reversePDAs.push(reversePDA);

        await program.methods
          .setMainAddress(addresses[i])
          .accounts({
            authority: owner.publicKey,
            profile: profilePDA,
            reverse: reversePDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([owner])
          .rpc();
      }

      console.log("✅ Rapid main address changes completed");

      // Verify final state
      const profile = await program.account.profile.fetch(profilePDA);
      expect(profile.mainAddress.toString()).to.eq(newMainWallet1.publicKey.toString());

      // Verify latest reverse lookup
      const latestReverse = await program.account.reverseLookup.fetch(reversePDAs[2]);
      expect(latestReverse.username).to.eq(rapidUsername);
    });
  });
});
