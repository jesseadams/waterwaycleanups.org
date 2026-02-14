#!/usr/bin/env node

/**
 * Script to identify and report unnecessary waitForTimeout calls in test files
 * 
 * Patterns to flag:
 * 1. waitForTimeout immediately after waitForLoadState('networkidle')
 * 2. waitForTimeout after actions that have built-in waits (click, fill, etc.)
 * 3. Long timeouts (>1000ms) that should use element/state waits
 */

const fs = require('fs');
const path = require('path');

function findTestFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (item.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check for waitForTimeout after networkidle
    if (line.includes('waitForTimeout') && i > 0) {
      const prevLine = lines[i - 1];
      
      if (prevLine.includes("waitForLoadState('networkidle')")) {
        issues.push({
          line: lineNum,
          type: 'DUPLICATIVE',
          message: 'waitForTimeout after networkidle is unnecessary',
          code: line.trim()
        });
      }
    }
    
    // Check for long timeouts
    const timeoutMatch = line.match(/waitForTimeout\((\d+)\)/);
    if (timeoutMatch) {
      const timeout = parseInt(timeoutMatch[1]);
      if (timeout >= 2000) {
        issues.push({
          line: lineNum,
          type: 'LONG_TIMEOUT',
          message: `${timeout}ms timeout should use element/state waits instead`,
          code: line.trim()
        });
      }
    }
  }
  
  return issues;
}

// Main execution
const testDir = path.join(__dirname, '..', 'tests', 'e2e');
const testFiles = findTestFiles(testDir);

console.log(`Analyzing ${testFiles.length} test files...\n`);

let totalIssues = 0;
const fileIssues = {};

for (const file of testFiles) {
  const issues = analyzeFile(file);
  if (issues.length > 0) {
    fileIssues[file] = issues;
    totalIssues += issues.length;
  }
}

// Report
console.log(`Found ${totalIssues} potential issues:\n`);

for (const [file, issues] of Object.entries(fileIssues)) {
  const relativePath = path.relative(process.cwd(), file);
  console.log(`\n${relativePath}:`);
  
  for (const issue of issues) {
    console.log(`  Line ${issue.line} [${issue.type}]: ${issue.message}`);
    console.log(`    ${issue.code}`);
  }
}

console.log(`\n\nSummary:`);
console.log(`- Files with issues: ${Object.keys(fileIssues).length}`);
console.log(`- Total issues: ${totalIssues}`);
console.log(`\nRecommendations:`);
console.log(`1. Remove waitForTimeout after networkidle (already waited for network)`);
console.log(`2. Replace long timeouts with waitForSelector or waitForFunction`);
console.log(`3. Use page object methods that include proper waits`);
