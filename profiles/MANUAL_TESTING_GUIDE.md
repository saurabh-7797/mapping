# Manual Testing Guide - Function by Function

## Overview

This guide provides step-by-step manual testing instructions for each function in the Decentralized Profiles program. Each function is tested individually with specific test cases, including both success and failure scenarios.

**Program ID**: `GrJrqEtxztquco6Zsg9WfrArYwy5BZwzJ4ce4TfcJLuJ`  
**Network**: Gorbagan Chain  
**RPC**: `https://rpc.gorbchain.xyz`

---

## Test Setup

### Prerequisites
```typescript
// Setup connection and provider
const RPC_ENDPOINT = 'https://rpc.gorbchain.xyz';
const WS_ENDPOINT = 'wss://rpc.gorbchain.xyz/ws/';
const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
  wsEndpoint: WS_ENDPOINT,
});

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
```

### Test Data
```typescript
// Generate unique test data for each run
const timestamp = Date.now().toString();
const username = `test${timestamp}`.slice(-10); // Keep under 32 chars
const owner = Keypair.generate();
const other = Keypair.generate();

const bio = "Hello bio for testing";
const avatar = "ipfs://testavatar";
const twitter = "test_handle";
const discord = "test#1234";
const website = "https://test.example";
```

---

## Function 1: `create_profile`

### Test Case 1.1: ✅ Create Profile (Happy Path)

**Purpose**: Test successful profile creation with valid data

**Steps**:
```typescript
// 1. Ensure test account has SOL
await fundTestAccount(owner.publicKey);

// 2. Prepare PDAs
const [profilePDA] = profilePda(username);
const [reversePDA] = reversePda(owner.publicKey);

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
const profile = await program.account.profile.fetch(profilePDA);
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
const reverse = await program.account.reverseLookup.fetch(reversePDA);
console.log("Reverse lookup:", reverse.username);
```

**Expected Results**:
- ✅ Transaction succeeds
- ✅ Profile data matches input
- ✅ Authority = owner.publicKey
- ✅ Main address = owner.publicKey
- ✅ Reverse lookup created correctly

### Test Case 1.2: ❌ Invalid Username (Contains @)

**Purpose**: Test that usernames with @ symbol are rejected

**Steps**:
```typescript
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
  
  console.log("❌ Test failed - should have rejected @ symbol");
} catch (error) {
  console.log("✅ Correctly rejected username with @:", error.message);
}
```

**Expected Results**:
- ❌ Transaction fails
- ❌ Error contains "Invalid username" or "InvalidUsername"

### Test Case 1.3: ❌ Invalid Username (Uppercase)

**Purpose**: Test that uppercase usernames are rejected

**Steps**:
```typescript
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
  
  console.log("❌ Test failed - should have rejected uppercase");
} catch (error) {
  console.log("✅ Correctly rejected uppercase username:", error.message);
}
```

**Expected Results**:
- ❌ Transaction fails
- ❌ Error contains "Invalid username"

### Test Case 1.4: ❌ Username Too Long (>32 chars)

**Purpose**: Test that overly long usernames are rejected

**Steps**:
```typescript
const badUsername = "a".repeat(33); // 33 characters

try {
  const [profilePDA] = profilePda(badUsername);
  console.log("❌ Test failed - should have failed at PDA creation");
} catch (error) {
  console.log("✅ Correctly rejected long username:", error.message);
}
```

**Expected Results**:
- ❌ PDA creation fails
- ❌ Error contains "Max seed length exceeded"

### Test Case 1.5: ❌ Duplicate Username

**Purpose**: Test that duplicate usernames are prevented

**Steps**:
```typescript
// First, create a profile (reuse from Test 1.1)
// Then try to create another profile with same username

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
  
  console.log("❌ Test failed - should have prevented duplicate");
} catch (error) {
  console.log("✅ Correctly prevented duplicate username:", error.message);
}
```

**Expected Results**:
- ❌ Transaction fails
- ❌ Error contains "already in use" or "allocated"

---

## Function 2: `set_profile_details`

### Test Case 2.1: ✅ Update Profile Details (Happy Path)

**Purpose**: Test successful profile update by authority

**Prerequisites**: Profile created from Test 1.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);

// Update all fields
const newBio = "Updated bio content";
const newAvatar = "ipfs://newavatar";
const newTwitter = "new_twitter";
const newDiscord = "new#5678";
const newWebsite = "https://newsite.com";

const tx = await program.methods
  .setProfileDetails(newBio, newAvatar, newTwitter, newDiscord, newWebsite)
  .accounts({
    authority: owner.publicKey,
    profile: profilePDA,
  })
  .signers([owner])
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
```

**Expected Results**:
- ✅ Transaction succeeds
- ✅ All fields updated correctly
- ✅ Username and authority unchanged

### Test Case 2.2: ❌ Update by Non-Authority

**Purpose**: Test that non-authority cannot update profile

**Prerequisites**: Profile created from Test 1.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);

try {
  await program.methods
    .setProfileDetails("hacker bio", null, null, null, null)
    .accounts({
      authority: other.publicKey, // Wrong authority
      profile: profilePDA,
    })
    .signers([other])
    .rpc();
  
  console.log("❌ Test failed - non-authority should not update");
} catch (error) {
  console.log("✅ Correctly rejected non-authority update:", error.message);
}
```

**Expected Results**:
- ❌ Transaction fails
- ❌ Error contains "has_one constraint" or "authority"

---

## Function 3: `set_main_address`

### Test Case 3.1: ✅ Change Main Address (Happy Path)

**Purpose**: Test successful main address change

**Prerequisites**: Profile created from Test 1.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);
const newMainWallet = Keypair.generate().publicKey;
const [newReversePDA] = reversePda(newMainWallet);

const tx = await program.methods
  .setMainAddress(newMainWallet)
  .accounts({
    authority: owner.publicKey,
    profile: profilePDA,
    reverse: newReversePDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([owner])
  .rpc();

console.log("✅ Main address changed:", tx);

// Verify changes
const profile = await program.account.profile.fetch(profilePDA);
console.log("New main address:", profile.mainAddress.toString());

const reverse = await program.account.reverseLookup.fetch(newReversePDA);
console.log("New reverse lookup:", reverse.username);
```

**Expected Results**:
- ✅ Transaction succeeds
- ✅ Profile.mainAddress = newMainWallet
- ✅ New reverse lookup created
- ✅ Authority unchanged

### Test Case 3.2: ❌ Change Main Address by Non-Authority

**Purpose**: Test that non-authority cannot change main address

**Prerequisites**: Profile created from Test 1.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);
const newMainWallet = Keypair.generate().publicKey;
const [newReversePDA] = reversePda(newMainWallet);

try {
  await program.methods
    .setMainAddress(newMainWallet)
    .accounts({
      authority: other.publicKey, // Wrong authority
      profile: profilePDA,
      reverse: newReversePDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([other])
    .rpc();
  
  console.log("❌ Test failed - non-authority should not change main address");
} catch (error) {
  console.log("✅ Correctly rejected non-authority main address change:", error.message);
}
```

**Expected Results**:
- ❌ Transaction fails
- ❌ Error contains "has_one constraint" or "authority"

---

## Function 4: `set_authority`

### Test Case 4.1: ✅ Transfer Authority (Happy Path)

**Purpose**: Test successful authority transfer

**Prerequisites**: Profile created from Test 1.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);
const newAuthority = other.publicKey;

const tx = await program.methods
  .setAuthority(newAuthority)
  .accounts({
    authority: owner.publicKey,
    profile: profilePDA,
  })
  .signers([owner])
  .rpc();

console.log("✅ Authority transferred:", tx);

// Verify transfer
const profile = await program.account.profile.fetch(profilePDA);
console.log("New authority:", profile.authority.toString());
```

**Expected Results**:
- ✅ Transaction succeeds
- ✅ Profile.authority = other.publicKey

### Test Case 4.2: ✅ Verify New Authority Can Update

**Purpose**: Test that new authority can now update profile

**Prerequisites**: Authority transferred in Test 4.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);

// New authority should be able to update
const tx = await program.methods
  .setProfileDetails("Updated by new authority", null, null, null, null)
  .accounts({
    authority: other.publicKey, // New authority
    profile: profilePDA,
  })
  .signers([other])
  .rpc();

console.log("✅ New authority successfully updated profile:", tx);

// Verify update
const profile = await program.account.profile.fetch(profilePDA);
console.log("Bio updated by new authority:", profile.bio);
```

**Expected Results**:
- ✅ Transaction succeeds
- ✅ Profile updated by new authority

### Test Case 4.3: ❌ Old Authority Cannot Update

**Purpose**: Test that old authority can no longer update profile

**Prerequisites**: Authority transferred in Test 4.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);

try {
  await program.methods
    .setProfileDetails("Old authority trying to update", null, null, null, null)
    .accounts({
      authority: owner.publicKey, // Old authority
      profile: profilePDA,
    })
    .signers([owner])
    .rpc();
  
  console.log("❌ Test failed - old authority should not update");
} catch (error) {
  console.log("✅ Correctly rejected old authority update:", error.message);
}
```

**Expected Results**:
- ❌ Transaction fails
- ❌ Error contains "has_one constraint" or "authority"

---

## Function 5: `set_address_mapping`

### Test Case 5.1: ✅ Create NFT Mapping (Happy Path)

**Purpose**: Test successful address mapping creation

**Prerequisites**: Profile created and authority = other (from previous tests)

**Steps**:
```typescript
const [profilePDA] = profilePda(username);
const [mappingPDA] = mappingPda(username, "nft");
const nftMint = Keypair.generate().publicKey;

const tx = await program.methods
  .setAddressMapping("nft", nftMint, 2) // 2 = NFT type hint
  .accounts({
    authority: other.publicKey, // Current authority
    profile: profilePDA,
    mapping: mappingPDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([other])
  .rpc();

console.log("✅ NFT mapping created:", tx);

// Verify mapping
const mapping = await program.account.addressMapping.fetch(mappingPDA);
console.log("Mapping details:", {
  addressType: mapping.addressType,
  target: mapping.target.toString(),
  extraTag: mapping.extraTag,
  profile: mapping.profile.toString(),
});
```

**Expected Results**:
- ✅ Transaction succeeds
- ✅ Mapping.addressType = "nft"
- ✅ Mapping.target = nftMint
- ✅ Mapping.extraTag = 2

### Test Case 5.2: ✅ Create Multiple Mappings

**Purpose**: Test creating different types of mappings

**Prerequisites**: Profile exists

**Steps**:
```typescript
const [profilePDA] = profilePda(username);

// Create wallet mapping
const walletMint = Keypair.generate().publicKey;
const [walletMappingPDA] = mappingPda(username, "wallet");

await program.methods
  .setAddressMapping("wallet", walletMint, 0)
  .accounts({
    authority: other.publicKey,
    profile: profilePDA,
    mapping: walletMappingPDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([other])
  .rpc();

// Create token mapping
const tokenMint = Keypair.generate().publicKey;
const [tokenMappingPDA] = mappingPda(username, "token");

await program.methods
  .setAddressMapping("token", tokenMint, 1)
  .accounts({
    authority: other.publicKey,
    profile: profilePDA,
    mapping: tokenMappingPDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([other])
  .rpc();

// Create donations mapping
const donationWallet = Keypair.generate().publicKey;
const [donationMappingPDA] = mappingPda(username, "donations");

await program.methods
  .setAddressMapping("donations", donationWallet, 4)
  .accounts({
    authority: other.publicKey,
    profile: profilePDA,
    mapping: donationMappingPDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([other])
  .rpc();

console.log("✅ Multiple mappings created successfully");

// Verify all mappings
const walletMapping = await program.account.addressMapping.fetch(walletMappingPDA);
const tokenMapping = await program.account.addressMapping.fetch(tokenMappingPDA);
const donationMapping = await program.account.addressMapping.fetch(donationMappingPDA);

console.log("All mappings:", {
  wallet: walletMapping.target.toString(),
  token: tokenMapping.target.toString(),
  donations: donationMapping.target.toString(),
});
```

**Expected Results**:
- ✅ All mappings created successfully
- ✅ Each mapping has correct type and target

### Test Case 5.3: ❌ Invalid Address Type

**Purpose**: Test that invalid address types are rejected

**Prerequisites**: Profile exists

**Steps**:
```typescript
const [profilePDA] = profilePda(username);
const [mappingPDA] = mappingPda(username, "BadType");

try {
  await program.methods
    .setAddressMapping("BadType", owner.publicKey, 4) // Invalid - uppercase
    .accounts({
      authority: other.publicKey,
      profile: profilePDA,
      mapping: mappingPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([other])
    .rpc();
  
  console.log("❌ Test failed - should have rejected invalid address type");
} catch (error) {
  console.log("✅ Correctly rejected invalid address type:", error.message);
}
```

**Expected Results**:
- ❌ Transaction fails
- ❌ Error contains "Invalid address type" or "InvalidAddressType"

---

## Function 6: `get_address_mapping`

### Test Case 6.1: ✅ Get Existing Mapping

**Purpose**: Test fetching existing mapping (emits event)

**Prerequisites**: NFT mapping created from Test 5.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);
const [mappingPDA] = mappingPda(username, "nft");

const tx = await program.methods
  .getAddressMapping()
  .accounts({
    profile: profilePDA,
    mapping: mappingPDA,
  })
  .rpc();

console.log("✅ Mapping fetched (event emitted):", tx);
```

**Expected Results**:
- ✅ Transaction succeeds
- ✅ MappingFetched event emitted

---

## Function 7: `clear_address_mapping`

### Test Case 7.1: ✅ Clear Mapping and Refund Rent

**Purpose**: Test clearing mapping and rent refund

**Prerequisites**: NFT mapping created from Test 5.1

**Steps**:
```typescript
const [profilePDA] = profilePda(username);
const [mappingPDA] = mappingPda(username, "nft");

// Get authority balance before clearing
const balanceBefore = await provider.connection.getBalance(other.publicKey);

// Create the mapping instruction manually to set authority as writable
const instruction = await program.methods
  .clearAddressMapping()
  .accounts({
    authority: other.publicKey,
    profile: profilePDA,
    mapping: mappingPDA,
  })
  .instruction();

// Ensure authority account is writable to receive rent refund
instruction.keys[0].isWritable = true;

const transaction = new Transaction().add(instruction);
const tx = await provider.sendAndConfirm(transaction, [other]);

console.log("✅ Mapping cleared:", tx);

// Verify mapping is deleted
try {
  await program.account.addressMapping.fetch(mappingPDA);
  console.log("❌ Test failed - mapping should be deleted");
} catch (error) {
  console.log("✅ Mapping successfully deleted");
}

// Check rent refund
const balanceAfter = await provider.connection.getBalance(other.publicKey);
console.log("Rent refunded:", balanceAfter - balanceBefore, "lamports");
```

**Expected Results**:
- ✅ Transaction succeeds
- ✅ Mapping account deleted
- ✅ Rent refunded to authority

### Test Case 7.2: ❌ Clear Non-Existent Mapping

**Purpose**: Test clearing a mapping that doesn't exist

**Steps**:
```typescript
const [profilePDA] = profilePda(username);
const [mappingPDA] = mappingPda(username, "nonexistent");

try {
  const instruction = await program.methods
    .clearAddressMapping()
    .accounts({
      authority: other.publicKey,
      profile: profilePDA,
      mapping: mappingPDA,
    })
    .instruction();

  instruction.keys[0].isWritable = true;
  const transaction = new Transaction().add(instruction);
  await provider.sendAndConfirm(transaction, [other]);
  
  console.log("❌ Test failed - should not clear non-existent mapping");
} catch (error) {
  console.log("✅ Correctly failed to clear non-existent mapping:", error.message);
}
```

**Expected Results**:
- ❌ Transaction fails
- ❌ Error contains "Account does not exist"

---

## Utility Functions for Testing

### Fund Test Account
```typescript
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
```

### Test Runner Template
```typescript
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

// Usage
async function runAllTests() {
  await runTest("Create Profile Happy Path", testCreateProfileHappyPath);
  await runTest("Invalid Username with @", testInvalidUsernameAt);
  // ... more tests
}
```

---

## Test Execution Order

**Recommended order for manual testing**:

1. **Setup**: Fund test accounts
2. **Test 1.1**: Create profile (establishes base state)
3. **Test 1.2-1.5**: Test profile creation edge cases
4. **Test 2.1**: Update profile details
5. **Test 2.2**: Test unauthorized profile update
6. **Test 3.1**: Change main address
7. **Test 3.2**: Test unauthorized main address change
8. **Test 4.1**: Transfer authority
9. **Test 4.2-4.3**: Verify authority transfer effects
10. **Test 5.1-5.3**: Test address mappings
11. **Test 6.1**: Test get mapping
12. **Test 7.1-7.2**: Test clear mapping

Each test is independent and can be run individually, but some tests depend on the state created by previous tests (especially authority transfers).

---

## Expected Test Results Summary

| Function | Test Cases | Expected Pass | Expected Fail |
|----------|------------|---------------|---------------|
| `create_profile` | 5 | 1 | 4 |
| `set_profile_details` | 2 | 1 | 1 |
| `set_main_address` | 2 | 1 | 1 |
| `set_authority` | 3 | 2 | 1 |
| `set_address_mapping` | 3 | 2 | 1 |
| `get_address_mapping` | 1 | 1 | 0 |
| `clear_address_mapping` | 2 | 1 | 1 |
| **Total** | **18** | **9** | **9** |

This gives you comprehensive coverage of all functions with both positive and negative test cases! 🚀 