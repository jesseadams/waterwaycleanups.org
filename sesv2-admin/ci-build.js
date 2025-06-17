#!/usr/bin/env node

/**
 * CI Build Helper Script
 * 
 * This script ensures environment variables from .env are available during the build process
 * in CI environments like GitHub Actions. It loads variables from the .env file and
 * then spawns the actual build process with those variables set.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

// Path to .env file
const envPath = path.resolve(__dirname, '.env');

console.log(`CI Build Helper: Loading environment variables from ${envPath}`);

// Check if .env file exists
if (fs.existsSync(envPath)) {
  // Load environment variables from .env file
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  
  // Log loaded variables (names only, not values)
  console.log('Loaded environment variables:');
  Object.keys(envConfig).forEach(key => {
    console.log(`- ${key}`);
    // Set environment variable
    process.env[key] = envConfig[key];
  });
  
  console.log('\nStarting build process with loaded environment variables...');
  
  // Run the actual build command with the loaded environment variables
  const buildProcess = spawn('react-scripts', ['build'], { 
    stdio: 'inherit', 
    env: process.env,
    shell: true
  });
  
  // Handle build process exit
  buildProcess.on('close', (code) => {
    if (code === 0) {
      console.log('Build completed successfully!');
    } else {
      console.error(`Build failed with exit code ${code}`);
      process.exit(code);
    }
  });
} else {
  console.error(`Error: .env file not found at ${envPath}`);
  process.exit(1);
}
