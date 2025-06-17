#!/usr/bin/env node

/**
 * This script generates a runtime-accessible environment configuration file.
 * It creates a file that will be included in the build and makes environment variables
 * available to the React app at runtime, not just during build time.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

console.log('Generating runtime environment configuration...');

// Load .env file
const envPath = path.resolve(__dirname, '.env');
let envValues = {};

if (fs.existsSync(envPath)) {
  console.log(`Loading variables from ${envPath}`);
  envValues = dotenv.parse(fs.readFileSync(envPath));
  
  // List the names of env vars found (not their values)
  console.log('Found environment variables: ', Object.keys(envValues).join(', '));
} else {
  console.log('No .env file found, using process.env values');
}

// Combine .env variables with process.env, with process.env taking precedence
const combinedEnv = { ...envValues };
for (const key in process.env) {
  if (key.startsWith('REACT_APP_')) {
    combinedEnv[key] = process.env[key];
  }
}

// Create content for the runtime config
const envConfigContent = `
// THIS FILE IS AUTO-GENERATED - DO NOT EDIT
// Runtime environment configuration generated at build time

window.ENV_CONFIG = {
  REACT_APP_AWS_REGION: "${combinedEnv.REACT_APP_AWS_REGION || ''}",
  REACT_APP_COGNITO_USER_POOL_ID: "${combinedEnv.REACT_APP_COGNITO_USER_POOL_ID || ''}",
  REACT_APP_COGNITO_APP_CLIENT_ID: "${combinedEnv.REACT_APP_COGNITO_APP_CLIENT_ID || ''}",
  REACT_APP_COGNITO_DOMAIN: "${combinedEnv.REACT_APP_COGNITO_DOMAIN || ''}",
  REACT_APP_COGNITO_IDENTITY_POOL_ID: "${combinedEnv.REACT_APP_COGNITO_IDENTITY_POOL_ID || ''}",
  REACT_APP_REDIRECT_URL: "${combinedEnv.REACT_APP_REDIRECT_URL || 'http://localhost:3000'}",
  REACT_APP_S3_BUCKET: "${combinedEnv.REACT_APP_S3_BUCKET || ''}",
  REACT_APP_S3_PREFIX: "${combinedEnv.REACT_APP_S3_PREFIX || ''}",
  REACT_APP_S3_REGION: "${combinedEnv.REACT_APP_S3_REGION || ''}"
};
`;

// Write the file to public directory so it will be included in the build
const outputDir = path.resolve(__dirname, 'public');
const outputFile = path.join(outputDir, 'env-config.js');

// Make sure the directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write the file
fs.writeFileSync(outputFile, envConfigContent);

console.log(`Environment configuration written to ${outputFile}`);
console.log('This file will be included in the build and available at runtime.');
