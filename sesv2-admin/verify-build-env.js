#!/usr/bin/env node

/**
 * This script verifies that all required environment variables are 
 * available during the build process. It's meant to be run during
 * the CI/CD workflow to catch any issues with environment variables.
 */

const requiredVars = [
  'REACT_APP_AWS_REGION',
  'REACT_APP_COGNITO_USER_POOL_ID',
  'REACT_APP_COGNITO_APP_CLIENT_ID',
  'REACT_APP_COGNITO_DOMAIN',
  'REACT_APP_COGNITO_IDENTITY_POOL_ID'
];

console.log('Verifying build environment variables...');

// Check if environment variables are available
const missingVars = [];
requiredVars.forEach(varName => {
  if (!process.env[varName]) {
    missingVars.push(varName);
    console.error(`❌ Missing required environment variable: ${varName}`);
  } else {
    // Don't print the actual values for security
    console.log(`✅ ${varName} is available`);
  }
});

// Exit with error if any variables are missing
if (missingVars.length > 0) {
  console.error(`\n❌ Missing ${missingVars.length} required environment variables`);
  console.error('This will cause the build to fail in the Amplify configuration.\n');

  // Print troubleshooting information
  console.log('TROUBLESHOOTING:');
  console.log('1. Check that the .env file exists and contains these variables');
  console.log('2. Verify that get-params-from-ssm.sh is correctly retrieving parameters');
  console.log('3. Confirm that the variables are being exported to the environment');
  console.log('4. Make sure the webpack configuration is correctly loading the variables\n');

  // Exit with error
  process.exit(1);
} else {
  console.log('\n✅ All required environment variables are available');
  process.exit(0);
}
