#!/usr/bin/env node

/**
 * Copy authentication assets to ensure they're available during development
 */

const fs = require('fs');
const path = require('path');

const authFiles = [
  'static/js/auth-client.js',
  'static/js/volunteer-api.js'
];

console.log('Copying authentication assets...');

authFiles.forEach(file => {
  const srcPath = path.resolve(__dirname, '..', file);
  const destPath = path.resolve(__dirname, '..', 'public', file.replace('static/', ''));
  
  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  // Copy file if source exists
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Copied ${file}`);
  } else {
    console.warn(`⚠ Source file not found: ${file}`);
  }
});

console.log('Authentication assets copied successfully!');