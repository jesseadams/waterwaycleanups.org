#!/usr/bin/env node

/**
 * Fix all page.goto() calls to include proper wait strategies
 */

const fs = require('fs');
const glob = require('glob');

const testFiles = glob.sync('tests/e2e/**/*.spec.ts');

let totalFixes = 0;

testFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Pattern: await page.goto('/path'); (without options)
  // Replace with proper wait strategy
  const lines = content.split('\n');
  const newLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this is a simple goto without options
    const gotoMatch = line.match(/^(\s*)await (page|this\.page)\.goto\((['"`][^'"`]+['"`])\);$/);
    
    if (gotoMatch) {
      const indent = gotoMatch[1];
      const pageVar = gotoMatch[2];
      const url = gotoMatch[3];
      
      // Check if next line already has waitForLoadState
      const nextLine = lines[i + 1] || '';
      if (!nextLine.includes('waitForLoadState') && !nextLine.includes('waitForTimeout')) {
        // Add the proper wait strategy
        newLines.push(`${indent}await ${pageVar}.goto(${url}, { waitUntil: 'load', timeout: 30000 });`);
        newLines.push(`${indent}await ${pageVar}.waitForLoadState('domcontentloaded');`);
        newLines.push(`${indent}await ${pageVar}.waitForTimeout(500);`);
        modified = true;
        totalFixes++;
      } else {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log(`✓ Fixed ${filePath}`);
  }
});

console.log(`\n✓ Total fixes: ${totalFixes}`);
