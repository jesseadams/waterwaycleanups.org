// Simple utility to check if required environment variables are available
// This will be used in the GitHub Actions workflow to verify variables are correctly loaded

const requiredEnvVars = [
  'REACT_APP_AWS_REGION',
  'REACT_APP_COGNITO_USER_POOL_ID',
  'REACT_APP_COGNITO_APP_CLIENT_ID',
  'REACT_APP_COGNITO_DOMAIN',
  'REACT_APP_COGNITO_IDENTITY_POOL_ID',
  'REACT_APP_REDIRECT_URL',
  'REACT_APP_S3_BUCKET',
  'REACT_APP_S3_PREFIX',
  'REACT_APP_S3_REGION'
];

console.log('====== Environment Variable Debug ======');
console.log('Checking for required environment variables...');

const missing = [];
const available = [];

requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    available.push(varName);
    // Don't log actual values for security, just indicate they exist
    console.log(`✓ ${varName}: [Value Available]`);
  } else {
    missing.push(varName);
    console.log(`✗ ${varName}: [MISSING]`);
  }
});

console.log('\nSummary:');
console.log(`- Available: ${available.length}/${requiredEnvVars.length}`);
console.log(`- Missing: ${missing.length}/${requiredEnvVars.length}`);

if (missing.length > 0) {
  console.log('\nMissing variables:');
  missing.forEach(varName => console.log(`- ${varName}`));
  process.exit(1); // Exit with error code
} else {
  console.log('\nAll required environment variables are available!');
  process.exit(0); // Exit success
}
