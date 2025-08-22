# Manual Testing Files - Decentralized Profiles Program

This directory contains comprehensive manual testing files for each function in the Decentralized Profiles program. Each function is tested individually with multiple test cases covering both success and failure scenarios.

## 📁 Test Files Structure

### Individual Function Test Files
- **`manual-test-1-create-profile.ts`** - Tests for `create_profile` function
- **`manual-test-2-set-profile-details.ts`** - Tests for `set_profile_details` function  
- **`manual-test-3-set-main-address.ts`** - Tests for `set_main_address` function
- **`manual-test-4-set-authority.ts`** - Tests for `set_authority` function
- **`manual-test-5-set-address-mapping.ts`** - Tests for `set_address_mapping` function
- **`manual-test-6-get-address-mapping.ts`** - Tests for `get_address_mapping` function
- **`manual-test-7-clear-address-mapping.ts`** - Tests for `clear_address_mapping` function

### Master Test Runner
- **`manual-test-all-functions.ts`** - Runs all function tests in sequence

## 🚀 How to Run Tests

### Prerequisites
1. **Node.js and Yarn** installed
2. **Anchor CLI** installed and configured
3. **Solana CLI** installed
4. **Wallet** with SOL on Gorbagan chain
5. **Program deployed** on Gorbagan chain

### Setup
```bash
# Navigate to the profiles directory
cd /home/saurabh/Desktop/suneswar-profiles/profiles

# Install dependencies
yarn install

# Build the program
anchor build

# Deploy to Gorbagan chain
solana program deploy target/deploy/profiles.so --url https://rpc.gorbchain.xyz
```

### Running Tests

#### Option 1: Run All Functions (Recommended)
```bash
# Run all function tests in sequence
npx ts-node tests/manual-test-all-functions.ts
```

#### Option 2: Run Individual Functions
```bash
# Run specific function tests
npx ts-node tests/manual-test-all-functions.ts 1  # create_profile only
npx ts-node tests/manual-test-all-functions.ts 2  # set_profile_details only
npx ts-node tests/manual-test-all-functions.ts 3  # set_main_address only
npx ts-node tests/manual-test-all-functions.ts 4  # set_authority only
npx ts-node tests/manual-test-all-functions.ts 5  # set_address_mapping only
npx ts-node tests/manual-test-all-functions.ts 6  # get_address_mapping only
npx ts-node tests/manual-test-all-functions.ts 7  # clear_address_mapping only
```

#### Option 3: Run Individual Test Files
```bash
# Run specific test file directly
npx ts-node tests/manual-test-1-create-profile.ts
npx ts-node tests/manual-test-2-set-profile-details.ts
# ... etc
```

## 🧪 Test Coverage Summary

| Function | Test Cases | Expected Pass | Expected Fail | Purpose |
|----------|------------|---------------|---------------|---------|
| `create_profile` | 5 | 1 | 4 | Profile creation with validation |
| `set_profile_details` | 4 | 2 | 2 | Profile updates and authorization |
| `set_main_address` | 4 | 3 | 1 | Main address changes and reverse lookups |
| `set_authority` | 6 | 4 | 2 | Ownership transfer and verification |
| `set_address_mapping` | 6 | 3 | 3 | UPI-style address mappings |
| `get_address_mapping` | 5 | 4 | 1 | Mapping retrieval and events |
| `clear_address_mapping` | 5 | 3 | 2 | Mapping cleanup and rent refunds |
| **Total** | **35** | **20** | **15** | **Complete function coverage** |

## 📋 Test Case Details

### Function 1: `create_profile`
- ✅ **Test 1.1**: Create Profile (Happy Path)
- ❌ **Test 1.2**: Invalid Username (Contains @)
- ❌ **Test 1.3**: Invalid Username (Uppercase)
- ❌ **Test 1.4**: Username Too Long (>32 chars)
- ❌ **Test 1.5**: Duplicate Username

### Function 2: `set_profile_details`
- ✅ **Test 2.1**: Update Profile Details (Happy Path)
- ❌ **Test 2.2**: Update by Non-Authority
- ✅ **Test 2.3**: Update with Null Values (Partial Update)
- ✅ **Test 2.4**: Update with Empty Strings

### Function 3: `set_main_address`
- ✅ **Test 3.1**: Change Main Address (Happy Path)
- ❌ **Test 3.2**: Change Main Address by Non-Authority
- ✅ **Test 3.3**: Change Main Address Multiple Times
- ✅ **Test 3.4**: Change Main Address to Same Address

### Function 4: `set_authority`
- ✅ **Test 4.1**: Transfer Authority (Happy Path)
- ✅ **Test 4.2**: Verify New Authority Can Update
- ❌ **Test 4.3**: Old Authority Cannot Update
- ✅ **Test 4.4**: Transfer Authority Multiple Times
- ❌ **Test 4.5**: Transfer Authority by Non-Authority
- ✅ **Test 4.6**: Transfer Authority to Same Authority

### Function 5: `set_address_mapping`
- ✅ **Test 5.1**: Create NFT Mapping (Happy Path)
- ✅ **Test 5.2**: Create Multiple Mappings
- ❌ **Test 5.3**: Invalid Address Type
- ❌ **Test 5.4**: Invalid Address Type (Special Characters)
- ✅ **Test 5.5**: Update Existing Mapping (Upsert)
- ❌ **Test 5.6**: Create Mapping by Non-Authority

### Function 6: `get_address_mapping`
- ✅ **Test 6.1**: Get Existing Mapping (Happy Path)
- ✅ **Test 6.2**: Get Multiple Different Mappings
- ❌ **Test 6.3**: Get Non-Existent Mapping
- ❌ **Test 6.4**: Get Mapping with Wrong Profile
- ✅ **Test 6.5**: Get Mapping Multiple Times (Same Mapping)

### Function 7: `clear_address_mapping`
- ✅ **Test 7.1**: Clear Mapping and Refund Rent (Happy Path)
- ❌ **Test 7.2**: Clear Non-Existent Mapping
- ❌ **Test 7.3**: Clear Mapping by Non-Authority
- ✅ **Test 7.4**: Clear Multiple Mappings
- ✅ **Test 7.5**: Clear Mapping and Verify Profile Unchanged

## 🔧 Test Configuration

### Network Settings
- **RPC Endpoint**: `https://rpc.gorbchain.xyz`
- **WS Endpoint**: `wss://rpc.gorbchain.xyz/ws/`
- **Program ID**: `GrJrqEtxztquco6Zsg9WfrArYwy5BZwzJ4ce4TfcJLuJ`

### Test Data Generation
- **Unique Usernames**: Generated using timestamp to avoid conflicts
- **Fresh Keypairs**: Each test run uses new test accounts
- **Automatic Funding**: Test accounts are automatically funded with SOL

### Error Handling
- **Expected Failures**: Tests are designed to fail in certain scenarios
- **Error Validation**: Error messages are verified to contain expected content
- **State Verification**: Account states are verified after each operation

## 📊 Expected Results

### Success Scenarios (20 tests)
- Profile creation with valid data
- Profile updates by authorized users
- Main address changes
- Authority transfers
- Address mapping creation
- Mapping retrieval
- Mapping cleanup

### Failure Scenarios (15 tests)
- Invalid usernames (special chars, uppercase, too long)
- Unauthorized operations
- Duplicate usernames
- Invalid address types
- Non-existent mappings
- Wrong profile references

## 🚨 Important Notes

### Test Dependencies
- **Sequential Execution**: Some tests depend on previous test state
- **Profile Creation**: Most tests require a profile to exist first
- **Authority Transfer**: Tests 4.2-4.3 depend on Test 4.1

### Test Isolation
- **Unique Data**: Each test run uses unique usernames and accounts
- **Clean State**: Tests don't interfere with each other
- **Independent Execution**: Individual function tests can run separately

### Network Requirements
- **Gorbagan Chain**: Tests run on the deployed program
- **SOL Balance**: Wallet needs sufficient SOL for transaction fees
- **Connection Stability**: RPC endpoint must be accessible

## 🎯 Testing Strategy

### Manual Testing Approach
1. **Function by Function**: Test each function independently
2. **Comprehensive Coverage**: Both success and failure scenarios
3. **Real Network**: Tests run on actual deployed program
4. **State Verification**: Verify all account changes and data integrity

### Test Execution Order
1. **Setup**: Ensure program is deployed and wallet has SOL
2. **Function 1**: Test profile creation thoroughly
3. **Function 2**: Test profile updates and authorization
4. **Function 3**: Test main address changes
5. **Function 4**: Test authority transfers
6. **Function 5**: Test address mapping creation
7. **Function 6**: Test mapping retrieval
8. **Function 7**: Test mapping cleanup

## 🔍 Troubleshooting

### Common Issues
- **RPC Connection**: Ensure Gorbagan chain is accessible
- **SOL Balance**: Check wallet has sufficient funds
- **Program Deployment**: Verify program is deployed and accessible
- **Dependencies**: Ensure all Node.js packages are installed

### Debug Information
- **Console Output**: Each test provides detailed logging
- **Transaction Signatures**: All transactions are logged with signatures
- **Account States**: Before/after states are displayed
- **Error Messages**: Detailed error information for failed tests

## 📚 Additional Resources

- **USER_FLOW.md**: High-level user journey guide
- **MANUAL_TESTING_GUIDE.md**: Detailed testing instructions
- **Anchor Documentation**: https://book.anchor-lang.com/
- **Solana Documentation**: https://docs.solana.com/

---

**Happy Testing! 🚀**

These manual tests provide comprehensive coverage of your Decentralized Profiles program, ensuring every function works correctly on the Gorbagan chain. 