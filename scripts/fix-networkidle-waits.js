#!/usr/bin/env node

/**
 * Script to replace networkidle waits with more reliable load strategies
 * 
 * networkidle is too strict and causes timeouts in CI environments.
 * This script replaces it with 'load' + 'domcontentloaded' + small timeout.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all TypeScript test files
const testFiles = glob.sync('tests/**/*.ts', {
  ignore: ['**/node_modules/**']
});

let totalReplacements = 0;

testFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Pattern 1: await page.waitForLoadState('networkidle');
  // Replace with: await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(500);
  const pattern1 = /await page\.waitForLoadState\('networkidle'\);/g;
  if (pattern1.test(content)) {
    content = content.replace(
      pattern1,
      "await page.waitForLoadState('domcontentloaded');\n    await page.waitForTimeout(500);"
    );
    modified = true;
    totalReplacements++;
  }
  
  // Pattern 2: await this.page.waitForLoadState('networkidle');
  const pattern2 = /await this\.page\.waitForLoadState\('networkidle'\);/g;
  if (pattern2.test(content)) {
    content = content.replace(
      pattern2,
      "await this.page.waitForLoadState('domcontentloaded');\n    await this.page.waitForTimeout(500);"
    );
    modified = true;
    totalReplacements++;
  }
  
  // Pattern 3: goto with networkidle in options
  const pattern3 = /await (\w+)\.goto\(([^)]+),\s*\{\s*waitUntil:\s*'networkidle'\s*\}\);/g;
  if (pattern3.test(content)) {
    content = content.replace(
      pattern3,
      "await $1.goto($2, { waitUntil: 'load', timeout: 30000 });\n    await $1.waitForLoadState('domcontentloaded');\n    await $1.waitForTimeout(500);"
    );
    modified = true;
    totalReplacements++;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Fixed ${filePath}`);
  }
});

console.log(`\n✓ Total replacements: ${totalReplacements}`);
console.log('✓ All networkidle waits have been replaced with more reliable strategies');
