import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction } from "@solana/web3.js";

// Master Test Runner for All Functions
// Executes all function tests in the correct order

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

// Import all test functions
import { runAllCreateProfileTests } from './manual-test-1-create-profile';
import { runAllSetProfileDetailsTests } from './manual-test-2-set-profile-details';
import { runAllSetMainAddressTests } from './manual-test-3-set-main-address';
import { runAllSetAuthorityTests } from './manual-test-4-set-authority';
import { runAllSetAddressMappingTests } from './manual-test-5-set-address-mapping';
import { runAllGetAddressMappingTests } from './manual-test-6-get-address-mapping';
import { runAllClearAddressMappingTests } from './manual-test-7-clear-address-mapping';

// Test runner function
async function runTest(testName: string, testFunction: () => Promise<void>) {
  console.log(`\n🧪 Running: ${testName}`);
  console.log("=".repeat(60));
  
  try {
    await testFunction();
    console.log(`✅ ${testName} - PASSED`);
  } catch (error) {
    console.log(`❌ ${testName} - FAILED:`, error.message);
    throw error; // Re-throw to stop execution on critical failures
  }
  
  console.log("=".repeat(60));
}

// ============================================================================
// MASTER TEST RUNNER
// ============================================================================
async function runAllFunctionTests() {
  console.log("🚀 Starting Complete Function Test Suite");
  console.log("Program ID:", program.programId.toString());
  console.log("Network: Gorbagan Chain");
  console.log("RPC:", RPC_ENDPOINT);
  console.log("Timestamp:", new Date().toISOString());
  
  const startTime = Date.now();
  
  try {
    // Test Function 1: create_profile
    await runTest("Function 1: create_profile", runAllCreateProfileTests);
    
    // Test Function 2: set_profile_details
    await runTest("Function 2: set_profile_details", runAllSetProfileDetailsTests);
    
    // Test Function 3: set_main_address
    await runTest("Function 3: set_main_address", runAllSetMainAddressTests);
    
    // Test Function 4: set_authority
    await runTest("Function 4: set_authority", runAllSetAuthorityTests);
    
    // Test Function 5: set_address_mapping
    await runTest("Function 5: set_address_mapping", runAllSetAddressMappingTests);
    
    // Test Function 6: get_address_mapping
    await runTest("Function 6: get_address_mapping", runAllGetAddressMappingTests);
    
    // Test Function 7: clear_address_mapping
    await runTest("Function 7: clear_address_mapping", runAllClearAddressMappingTests);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log("\n🎉 ALL FUNCTION TESTS COMPLETED SUCCESSFULLY!");
    console.log("⏱️  Total execution time:", duration.toFixed(2), "seconds");
    console.log("✅ All 7 functions tested with comprehensive test cases");
    
  } catch (error) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log("\n❌ FUNCTION TEST SUITE FAILED!");
    console.log("⏱️  Execution time before failure:", duration.toFixed(2), "seconds");
    console.log("💥 Error:", error.message);
    
    throw error;
  }
}

// ============================================================================
// INDIVIDUAL FUNCTION TEST RUNNERS
// ============================================================================

// Run only create_profile tests
async function runCreateProfileOnly() {
  console.log("🧪 Running create_profile function tests only");
  await runAllCreateProfileTests();
}

// Run only set_profile_details tests
async function runSetProfileDetailsOnly() {
  console.log("🧪 Running set_profile_details function tests only");
  await runAllSetProfileDetailsTests();
}

// Run only set_main_address tests
async function runSetMainAddressOnly() {
  console.log("🧪 Running set_main_address function tests only");
  await runAllSetMainAddressTests();
}

// Run only set_authority tests
async function runSetAuthorityOnly() {
  console.log("🧪 Running set_authority function tests only");
  await runAllSetAuthorityTests();
}

// Run only set_address_mapping tests
async function runSetAddressMappingOnly() {
  console.log("🧪 Running set_address_mapping function tests only");
  await runAllSetAddressMappingTests();
}

// Run only get_address_mapping tests
async function runGetAddressMappingOnly() {
  console.log("🧪 Running get_address_mapping function tests only");
  await runAllGetAddressMappingTests();
}

// Run only clear_address_mapping tests
async function runClearAddressMappingOnly() {
  console.log("🧪 Running clear_address_mapping function tests only");
  await runAllClearAddressMappingTests();
}

// ============================================================================
// TEST SELECTION MENU
// ============================================================================
async function showTestMenu() {
  console.log("\n📋 Manual Test Selection Menu");
  console.log("=".repeat(40));
  console.log("1. Run ALL function tests (recommended)");
  console.log("2. Run create_profile tests only");
  console.log("3. Run set_profile_details tests only");
  console.log("4. Run set_main_address tests only");
  console.log("5. Run set_authority tests only");
  console.log("6. Run set_address_mapping tests only");
  console.log("7. Run get_address_mapping tests only");
  console.log("8. Run clear_address_mapping tests only");
  console.log("9. Exit");
  console.log("=".repeat(40));
  
  // For now, just run all tests
  // In a real CLI, you'd read user input here
  console.log("🚀 Auto-selecting: Run ALL function tests");
  await runAllFunctionTests();
}

// ============================================================================
// EXPORTS
// ============================================================================
export {
  runAllFunctionTests,
  runCreateProfileOnly,
  runSetProfileDetailsOnly,
  runSetMainAddressOnly,
  runSetAuthorityOnly,
  runSetAddressMappingOnly,
  runGetAddressMappingOnly,
  runClearAddressMappingOnly,
  showTestMenu
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================
if (require.main === module) {
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // No arguments - run all tests
    runAllFunctionTests().catch(console.error);
  } else {
    const functionNumber = parseInt(args[0]);
    
    switch (functionNumber) {
      case 1:
        runCreateProfileOnly().catch(console.error);
        break;
      case 2:
        runSetProfileDetailsOnly().catch(console.error);
        break;
      case 3:
        runSetMainAddressOnly().catch(console.error);
        break;
      case 4:
        runSetAuthorityOnly().catch(console.error);
        break;
      case 5:
        runSetAddressMappingOnly().catch(console.error);
        break;
      case 6:
        runGetAddressMappingOnly().catch(console.error);
        break;
      case 7:
        runClearAddressMappingOnly().catch(console.error);
        break;
      default:
        console.log("Invalid function number. Use 1-7 or no arguments for all tests.");
        console.log("Usage: ts-node manual-test-all-functions.ts [function_number]");
        process.exit(1);
    }
  }
} 