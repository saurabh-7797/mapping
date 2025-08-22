# Decentralized Profiles User Flow Guide

## Overview

This guide explains how users can interact with the **Decentralized Profiles** program deployed on the Gorbagan chain. The system provides a UPI-style username system similar to modern payment apps, allowing users to create memorable handles and map various addresses to them.

**Program ID**: `GrJrqEtxztquco6Zsg9WfrArYwy5BZwzJ4ce4TfcJLuJ`  
**Network**: Gorbagan Chain  
**RPC**: `https://rpc.gorbchain.xyz`

---

## Core Concepts

### 🎯 What You Can Do
- **Create unique usernames** (like `alice`, `bob123`, `crypto.master`)
- **Map addresses to usernames** (like `wallet@alice`, `nft@alice`, `token@alice`)
- **Reverse lookup** - find username from any address
- **Update profile information** - bio, avatar, social links
- **Transfer ownership** of your profile

### 🏗️ Data Structure
```
Profile: ["profile", username] → Profile data
Mapping: ["mapping", username, address_type] → Target address
Reverse: ["reverse", main_address] → Username
```

---

## Step-by-Step User Flows

## 1️⃣ Creating Your Profile

### Prerequisites
- Wallet with SOL for transaction fees
- Chosen username following rules:
  - Lowercase only: `[a-z0-9._-]`
  - 1-32 characters
  - No `@` symbol
  - Examples: ✅ `alice`, `bob123`, `crypto.master` | ❌ `Alice`, `user@domain`, `verylongusernamethatexceeds32chars`

### Steps
```typescript
// Step 1: Connect wallet and prepare
const username = "alice";  // Your chosen username
const bio = "Crypto enthusiast and DeFi developer";
const avatar = "https://ipfs.io/ipfs/QmYourAvatarHash";
const twitter = "alice_crypto";
const discord = "alice#1234";
const website = "https://alice.xyz";

// Step 2: Call create_profile
await program.methods
  .createProfile(username, bio, avatar, twitter, discord, website)
  .accounts({
    authority: wallet.publicKey,      // Your wallet
    profile: profilePDA,              // Derived: ["profile", "alice"]
    reverse: reversePDA,              // Derived: ["reverse", wallet.publicKey]
    systemProgram: SystemProgram.programId,
  })
  .signers([wallet])
  .rpc();
```

### What Happens
1. ✅ Username validation (lowercase, valid chars, no `@`)
2. ✅ Profile PDA created at `["profile", "alice"]`
3. ✅ Reverse lookup created at `["reverse", your_wallet_address]`
4. ✅ Profile data stored (bio, avatar, social links)
5. ✅ `ProfileCreated` event emitted

---

## 2️⃣ Setting Up Address Mappings (UPI-Style)

### Purpose
Create memorable addresses like:
- `wallet@alice` → Your main wallet
- `nft@alice` → Your NFT collection address
- `token@alice` → Your token mint address
- `donations@alice` → Your donation wallet

### Steps
```typescript
// Example: Setting up NFT collection mapping
const addressType = "nft";           // Must be lowercase [a-z0-9.-]
const targetAddress = nftCollectionMint;  // The actual NFT collection address
const typeHint = 2;                  // 0=wallet, 1=token, 2=nft, 3=metadata, 4=custom

await program.methods
  .setAddressMapping(addressType, targetAddress, typeHint)
  .accounts({
    authority: wallet.publicKey,
    profile: profilePDA,              // ["profile", "alice"]
    mapping: mappingPDA,              // ["mapping", "alice", "nft"]
    systemProgram: SystemProgram.programId,
  })
  .signers([wallet])
  .rpc();
```

### Common Mapping Examples
```typescript
// Main wallet mapping
await setMapping("wallet", mainWallet.publicKey, 0);

// Token mint mapping  
await setMapping("token", tokenMint.publicKey, 1);

// NFT collection mapping
await setMapping("nft", nftCollection.publicKey, 2);

// Metadata mapping
await setMapping("metadata", metadataAccount.publicKey, 3);

// Custom donation address
await setMapping("donations", donationWallet.publicKey, 4);
```

---

## 3️⃣ Updating Profile Information

### When to Use
- Change bio, avatar, or social links
- Update contact information
- Refresh profile appearance

### Steps
```typescript
await program.methods
  .setProfileDetails(
    "Updated bio - Now building on Solana!", // New bio
    "https://ipfs.io/ipfs/QmNewAvatarHash",   // New avatar
    "alice_solana",                           // Updated Twitter
    "alice#5678",                             // Updated Discord
    "https://alice-solana.dev"                // New website
  )
  .accounts({
    authority: wallet.publicKey,
    profile: profilePDA,
  })
  .signers([wallet])
  .rpc();
```

---

## 4️⃣ Changing Main Address

### Purpose
- Update which wallet represents your profile
- Useful when switching to a new primary wallet
- Maintains username while updating the underlying address

### Steps
```typescript
const newMainWallet = Keypair.generate().publicKey;

await program.methods
  .setMainAddress(newMainWallet)
  .accounts({
    authority: wallet.publicKey,        // Current authority
    profile: profilePDA,                // ["profile", "alice"]
    reverse: newReversePDA,             // ["reverse", newMainWallet]
    systemProgram: SystemProgram.programId,
  })
  .signers([wallet])
  .rpc();
```

### What Happens
1. ✅ Profile's `main_address` updated to new wallet
2. ✅ New reverse lookup created for new wallet → username
3. ✅ Old reverse lookup remains (not automatically cleaned)

---

## 5️⃣ Transferring Profile Ownership

### Purpose
- Transfer profile to a new wallet
- Useful for account recovery or ownership changes
- New owner gains full control

### Steps
```typescript
const newOwner = newWallet.publicKey;

await program.methods
  .setAuthority(newOwner)
  .accounts({
    authority: wallet.publicKey,        // Current owner
    profile: profilePDA,
  })
  .signers([wallet])
  .rpc();
```

### ⚠️ Important Notes
- **Irreversible**: Once transferred, original owner loses all control
- **New owner controls**: Profile updates, mappings, future transfers
- **Plan carefully**: Ensure new owner wallet is secure and accessible

---

## 6️⃣ Managing Address Mappings

### Viewing a Mapping
```typescript
// Get mapping information
await program.methods
  .getAddressMapping()
  .accounts({
    profile: profilePDA,              // ["profile", "alice"]
    mapping: mappingPDA,              // ["mapping", "alice", "nft"]
  })
  .rpc();

// This emits MappingFetched event with mapping details
```

### Removing a Mapping
```typescript
// Clear mapping and reclaim rent
await program.methods
  .clearAddressMapping()
  .accounts({
    authority: wallet.publicKey,
    profile: profilePDA,
    mapping: mappingPDA,              // Will be closed and rent refunded
  })
  .signers([wallet])
  .rpc();
```

---

## 7️⃣ Looking Up Profiles

### By Username
```typescript
// Get profile by username
const username = "alice";
const [profilePDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("profile"), Buffer.from(username)],
  program.programId
);
const profile = await program.account.profile.fetch(profilePDA);
console.log(profile.bio, profile.mainAddress.toString());
```

### By Address (Reverse Lookup)
```typescript
// Find username by wallet address
const walletAddress = new PublicKey("...");
const [reversePDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("reverse"), walletAddress.toBuffer()],
  program.programId
);
const reverse = await program.account.reverseLookup.fetch(reversePDA);
console.log(`Address ${walletAddress} belongs to: ${reverse.username}`);
```

### By Mapping
```typescript
// Get specific address mapping
const [mappingPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("mapping"), Buffer.from("alice"), Buffer.from("nft")],
  program.programId
);
const mapping = await program.account.addressMapping.fetch(mappingPDA);
console.log(`alice's NFT address: ${mapping.target.toString()}`);
```

---

## 🔒 Security & Best Practices

### Username Security
- ✅ **Choose wisely**: Usernames are permanent and unique
- ✅ **Keep it simple**: Avoid complex special characters
- ✅ **Check availability**: Username collisions will fail

### Authority Management
- ✅ **Secure your authority wallet**: It controls everything
- ✅ **Regular backups**: Ensure wallet recovery is possible
- ✅ **Careful transfers**: Authority transfer is irreversible

### Mapping Management
- ✅ **Verify addresses**: Double-check target addresses before mapping
- ✅ **Use clear names**: Use descriptive address types (`donations`, `nft`, etc.)
- ✅ **Clean up unused**: Remove old mappings to reclaim rent

---

## 💡 Common Use Cases

### 1. **Personal Identity**
```
Username: alice
wallet@alice → Main wallet
nft@alice → NFT collection
token@alice → Personal token
donations@alice → Donation address
```

### 2. **Business Profile**
```
Username: crypto.corp
wallet@crypto.corp → Business treasury
token@crypto.corp → Company token
nft@crypto.corp → Brand NFTs
support@crypto.corp → Support wallet
```

### 3. **Creator Profile**
```
Username: artist123
wallet@artist123 → Creator wallet
nft@artist123 → Art collection
royalties@artist123 → Royalty receiver
merch@artist123 → Merchandise payments
```

---

## 📊 Fee Structure

| Operation | Estimated Cost | Notes |
|-----------|---------------|--------|
| Create Profile | ~0.01 SOL | One-time profile creation |
| Add Mapping | ~0.005 SOL | Per mapping created |
| Update Profile | ~0.0001 SOL | Profile detail changes |
| Transfer Authority | ~0.0001 SOL | Ownership transfer |
| Clear Mapping | Refunds rent | Get back mapping rent |

---

## 🛠️ Developer Integration

### Frontend Integration
```typescript
// Example: Resolve username to addresses
async function resolveUser(username: string) {
  const profile = await getProfile(username);
  const nftAddress = await getMapping(username, "nft");
  const walletAddress = await getMapping(username, "wallet");
  
  return {
    username,
    bio: profile.bio,
    avatar: profile.avatar,
    addresses: {
      wallet: walletAddress,
      nft: nftAddress,
    }
  };
}
```

### Payment Integration
```typescript
// Send payment to username instead of long address
async function payUser(username: string, amount: number) {
  const walletMapping = await getMapping(username, "wallet");
  await sendTransaction(walletMapping.target, amount);
}
```

---

## 🎉 Getting Started

1. **Set up wallet** with SOL on Gorbagan chain
2. **Choose username** following naming rules
3. **Create profile** with basic information
4. **Add mappings** for your important addresses
5. **Share your username** - others can now find you easily!

Your decentralized identity is now live on Gorbagan chain! 🚀 