import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";
import { expect } from "chai";

const RPC_ENDPOINT = 'https://rpc.gorbchain.xyz';
const WS_ENDPOINT = 'wss://rpc.gorbchain.xyz/ws/';
const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
  wsEndpoint: WS_ENDPOINT,
  disableRetryOnRateLimit: false,
});

describe("profile_ns", () => {
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
        },
        {
          name: "setProfileDetails",
          accounts: [
            { name: "authority", isMut: false, isSigner: true },
            { name: "profile", isMut: true, isSigner: false }
          ],
          args: [
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
        },
        {
          name: "setAuthority",
          accounts: [
            { name: "authority", isMut: false, isSigner: true },
            { name: "profile", isMut: true, isSigner: false }
          ],
          args: [{ name: "newAuthority", type: "publicKey" }]
        },
        {
          name: "setAddressMapping",
          accounts: [
            { name: "authority", isMut: true, isSigner: true },
            { name: "profile", isMut: false, isSigner: false },
            { name: "mapping", isMut: true, isSigner: false },
            { name: "systemProgram", isMut: false, isSigner: false }
          ],
          args: [
            { name: "addressType", type: "string" },
            { name: "target", type: "publicKey" },
            { name: "typeHint", type: "u8" }
          ]
        },
        {
          name: "getAddressMapping",
          accounts: [
            { name: "profile", isMut: false, isSigner: false },
            { name: "mapping", isMut: false, isSigner: false }
          ],
          args: []
        },
        {
          name: "clearAddressMapping",
          accounts: [
            { name: "authority", isMut: true, isSigner: true },
            { name: "profile", isMut: false, isSigner: false },
            { name: "mapping", isMut: true, isSigner: false }
          ],
          args: []
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
          name: "AddressMapping",
          type: {
            kind: "struct",
            fields: [
              { name: "profile", type: "publicKey" },
              { name: "bump", type: "u8" },
              { name: "addressType", type: "string" },
              { name: "target", type: "publicKey" },
              { name: "extraTag", type: "u8" }
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

  // Helpers to derive PDAs the same way as the program
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

  // Test actors - use fresh keypairs to avoid conflicts
  const payer = (provider.wallet as anchor.Wallet).payer; // for paying fees
  const owner = Keypair.generate();                        // unique test owner
  const other = Keypair.generate();                        // used to test auth checks

  // Generate unique username for this test run to avoid conflicts
  const timestamp = Date.now().toString();
  const username = `test${timestamp}`.slice(-10); // Keep it under 32 chars, use last 10 chars
  const bio = "hello bio";
  const avatar = "ipfs://avatar";
  const twitter = "test_xyz";
  const discord = "test#1234";
  const website = "https://site.tld";

  it("Airdrops SOL to test keys", async () => {
    // Fund the test owner and other keys
    try {
      // Try airdrop first
      await provider.connection.requestAirdrop(owner.publicKey, 2e9);
      await provider.connection.requestAirdrop(other.publicKey, 1e9);
      // Wait a bit for airdrop to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (_) {
      // Airdrop failed, transfer from payer instead
    }
    
    // Check balance and transfer from payer if needed
    const ownerBalance = await provider.connection.getBalance(owner.publicKey);
    const otherBalance = await provider.connection.getBalance(other.publicKey);
    
    if (ownerBalance < 1e8) { // If less than 0.1 SOL
      // Transfer SOL from payer to test accounts
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: owner.publicKey,
          lamports: 1e8, // 0.1 SOL
        })
      );
      await provider.sendAndConfirm(transaction, [payer]);
    }
    
    if (otherBalance < 5e7) { // If less than 0.05 SOL
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: other.publicKey,
          lamports: 5e7, // 0.05 SOL
        })
      );
      await provider.sendAndConfirm(transaction, [payer]);
    }
  });

  it("fails to create profile with invalid username (contains @)", async () => {
    const bad = "wal@rus";
    const [pda] = profilePda(bad);
    const [rev] = reversePda(owner.publicKey);

    // Expect custom error InvalidUsername
    try {
      await program.methods
        .createProfile(bad, bio, avatar, twitter, discord, website)
        .accounts({
          authority: owner.publicKey,
          profile: pda,
          reverse: rev,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected transaction to fail");
    } catch (error) {
      expect(error.toString()).to.match(/Invalid username|InvalidUsername|custom program error/i);
    }
  });

  it("fails to create profile with uppercase username (must be normalized)", async () => {
    const bad = "GorBlin"; // not lowercase
    const [pda] = profilePda(bad);
    const [rev] = reversePda(owner.publicKey);

    try {
      await program.methods
        .createProfile(bad, bio, avatar, twitter, discord, website)
        .accounts({
          authority: owner.publicKey,
          profile: pda,
          reverse: rev,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected transaction to fail");
    } catch (error) {
      expect(error.toString()).to.match(/Invalid username|InvalidUsername|custom program error/i);
    }
  });

  it("fails to create profile with >32 chars username", async () => {
    const bad = "a".repeat(33);
    
    // This should fail at PDA creation level due to Solana's max seed length
    try {
      const [pda] = profilePda(bad);
      expect.fail("Expected PDA creation to fail due to max seed length");
    } catch (error) {
      expect(error.toString()).to.match(/Max seed length exceeded/i);
    }
  });

  it("creates a profile (happy path) and writes reverse lookup", async () => {
    const [pda] = profilePda(username);
    const [rev] = reversePda(owner.publicKey);

    await program.methods
      .createProfile(username, bio, avatar, twitter, discord, website)
      .accounts({
        authority: owner.publicKey,
        profile: pda,
        reverse: rev,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const prof: any = await (program.account as any).profile.fetch(pda);
    expect(prof.username).to.eq(username);
    expect(prof.authority.toBase58()).to.eq(owner.publicKey.toBase58());
    expect(prof.mainAddress.toBase58()).to.eq(owner.publicKey.toBase58());
    expect(prof.bio).to.eq(bio);
    expect(prof.avatar).to.eq(avatar);
    expect(prof.twitter).to.eq(twitter);

    const revAcc: any = await (program.account as any).reverseLookup.fetch(rev);
    expect(revAcc.username).to.eq(username);
  });

  it("prevents duplicate username (PDA collision)", async () => {
    const [pda] = profilePda(username);
    const [rev] = reversePda(owner.publicKey);

    try {
      await program.methods
        .createProfile(username, "x", "y", "", "", "")
        .accounts({
          authority: owner.publicKey,
          profile: pda,
          reverse: rev,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected transaction to fail");
    } catch (error) {
      expect(error.toString()).to.match(/already in use|allocated|exists|address in use/i);
    }
  });

  it("updates profile details", async () => {
    const [pda] = profilePda(username);
    await program.methods
      .setProfileDetails("bio2", "ipfs://new", "tw2", "disc2", "https://ex.tld")
      .accounts({
        authority: owner.publicKey,
        profile: pda,
      })
      .signers([owner])
      .rpc();

    const p: any = await (program.account as any).profile.fetch(pda);
    expect(p.bio).to.eq("bio2");
    expect(p.avatar).to.eq("ipfs://new");
    expect(p.twitter).to.eq("tw2");
    expect(p.discord).to.eq("disc2");
    expect(p.website).to.eq("https://ex.tld");
  });

  it("changes main address and upserts reverse lookup", async () => {
    const [pda] = profilePda(username);
    const newMain = Keypair.generate().publicKey;
    const [rev] = reversePda(newMain);

    await program.methods
      .setMainAddress(newMain)
      .accounts({
        authority: owner.publicKey,
        profile: pda,
        reverse: rev,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const p: any = await (program.account as any).profile.fetch(pda);
    expect(p.mainAddress.toBase58()).to.eq(newMain.toBase58());

    const r: any = await (program.account as any).reverseLookup.fetch(rev);
    expect(r.username).to.eq(username);
  });

  it("fails to update details by non-authority", async () => {
    const [pda] = profilePda(username);

    try {
      await program.methods
        .setProfileDetails("h", null, null, null, null)
        .accounts({
          authority: other.publicKey,
          profile: pda,
        })
        .signers([other])
        .rpc();
      expect.fail("Expected transaction to fail");
    } catch (error) {
      expect(error.toString()).to.match(/has one constraint was violated|constraint has one|authority|AccountNotInitialized/i);
    }
  });

  it("sets a mapping (nft@username) and fetches it", async () => {
    const [pda] = profilePda(username);
    const [mPda] = mappingPda(username, "nft");
    const nftMint = Keypair.generate().publicKey;

    await program.methods
      .setAddressMapping("nft", nftMint, 2) // 2 = nft tag in our scheme
      .accounts({
        authority: owner.publicKey,
        profile: pda,
        mapping: mPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const m: any = await (program.account as any).addressMapping.fetch(mPda);
    expect(m.addressType).to.eq("nft");
    expect(m.target.toBase58()).to.eq(nftMint.toBase58());
    expect(m.extraTag).to.eq(2);

    // Optional: exercise the "get_address_mapping" event emission (no state change)
    await program.methods
      .getAddressMapping()
      .accounts({
        profile: pda,
        mapping: mPda,
      })
      .rpc();
  });

  it("fails to set mapping with invalid address_type", async () => {
    const [pda] = profilePda(username);
    const [mPda] = mappingPda(username, "BadType"); // invalid — not lowercase ascii

    try {
      await program.methods
        .setAddressMapping("BadType", owner.publicKey, 4)
        .accounts({
          authority: owner.publicKey,
          profile: pda,
          mapping: mPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected transaction to fail");
    } catch (error) {
      expect(error.toString()).to.match(/Invalid address type|InvalidAddressType|custom program error/i);
    }
  });

  it("clears a mapping and refunds rent to authority", async () => {
    const [pda] = profilePda(username);
    const [mPda] = mappingPda(username, "nft");
    const nftMint = Keypair.generate().publicKey;

    // First create the mapping to ensure it exists
    await program.methods
      .setAddressMapping("nft", nftMint, 2)
      .accounts({
        authority: owner.publicKey,
        profile: pda,
        mapping: mPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    // Use instruction builder to explicitly mark authority as writable
    const instruction = await program.methods
      .clearAddressMapping()
      .accounts({
        authority: owner.publicKey,
        profile: pda,
        mapping: mPda,
      })
      .instruction();

    // Manually override the authority account to be writable
    instruction.keys[0].isWritable = true; // First account should be authority

    const transaction = new Transaction().add(instruction);
    await provider.sendAndConfirm(transaction, [owner]);

    const info = await provider.connection.getAccountInfo(mPda);
    expect(info).to.eq(null);
  });

  it("transfers authority (ownership) and enforces new authority thereafter", async () => {
    const [pda] = profilePda(username);

    // Transfer authority to `other`
    await program.methods
      .setAuthority(other.publicKey)
      .accounts({
        authority: owner.publicKey,
        profile: pda,
      })
      .signers([owner])
      .rpc();

    const p: any = await (program.account as any).profile.fetch(pda);
    expect(p.authority.toBase58()).to.eq(other.publicKey.toBase58());

    // Now original owner should fail to mutate
    try {
      await program.methods
        .setProfileDetails("after-transfer-should-fail", null, null, null, null)
        .accounts({
          authority: owner.publicKey,
          profile: pda,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected transaction to fail");
    } catch (error) {
      expect(error.toString()).to.match(/has one constraint was violated|constraint has one|authority/i);
    }

    // And new authority should succeed
    await program.methods
      .setProfileDetails("after-transfer-ok", null, null, null, null)
      .accounts({
        authority: other.publicKey,
        profile: pda,
      })
      .signers([other])
      .rpc();

    const p2: any = await (program.account as any).profile.fetch(pda);
    expect(p2.bio).to.eq("after-transfer-ok");
  });
});         
