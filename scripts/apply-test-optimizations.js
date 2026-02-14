#!/usr/bin/env node

/**
 * Apply test wait optimizations automatically
 * 
 * This script implements the optimizations from optimize-test-waits.md:
 * 1. Remove duplicative waits after networkidle
 * 2. Replace long timeouts with element waits where possible
 * 3. Add comments explaining remaining waits
 */

const fs = require('fs');
const path = require('path');

// Files to optimize
const testFiles = [
  'tests/e2e/rsvp/rsvp-submission.spec.ts',
  'tests/e2e/rsvp/capacity-race-conditions.spec.ts',
  'tests/e2e/rsvp/time-restrictions.spec.ts',
  'tests/e2e/auth/authentication.spec.ts',
  'tests/e2e/auth/session-management.spec.ts',
  'tests/e2e/auth/unauthenticated-access.spec.ts',
];

function optimizeFile(filePath) {
  console.log(`\n📝 Optimizing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  // Pattern 1: Remove duplicative waits after networkidle
  const networkidlePattern = /await page\.waitForLoadState\('networkidle'\);\s*await page\.waitForTimeout\(\d+\);/g;
  const networkidleMatches = content.match(networkidlePattern);
  if (networkidleMatches) {
    content = content.replace(
      networkidlePattern,
      "await page.waitForLoadState('networkidle');\n      // networkidle already waited for network activity to stop"
    );
    changes += networkidleMatches.length;
    console.log(`  ✅ Removed ${networkidleMatches.length} duplicative wait(s) after networkidle`);
  }
  
  // Pattern 2: Replace "Wait for RSVP to be processed" with proper wait
  const rsvpProcessedPattern = /\/\/ Wait for RSVP to be processed\s*await page\.waitForTimeout\((\d+)\);/g;
  const rsvpMatches = content.match(rsvpProcessedPattern);
  if (rsvpMatches) {
    content = content.replace(
      rsvpProcessedPattern,
      `// Wait for RSVP to be processed (backend operation)
      await page.waitForTimeout(1000); // Reduced from $1ms - backend needs brief time to process`
    );
    changes += rsvpMatches.length;
    console.log(`  ✅ Optimized ${rsvpMatches.length} RSVP processing wait(s)`);
  }
  
  // Pattern 3: Replace "Wait for cancellation to be processed" with proper wait
  const cancellationPattern = /\/\/ Wait for cancellation to be processed\s*await page\.waitForTimeout\((\d+)\);/g;
  const cancellationMatches = content.match(cancellationPattern);
  if (cancellationMatches) {
    content = content.replace(
      cancellationPattern,
      `// Wait for cancellation to be processed (backend operation)
      await page.waitForTimeout(1000); // Reduced from $1ms - backend needs brief time to process`
    );
    changes += cancellationMatches.length;
    console.log(`  ✅ Optimized ${cancellationMatches.length} cancellation wait(s)`);
  }
  
  // Pattern 4: Add comments to remaining long waits (2000ms+)
  const longWaitPattern = /await page\.waitForTimeout\(([2-9]\d{3,}|\d{5,})\);(?!\s*\/\/)/g;
  const longWaitMatches = content.match(longWaitPattern);
  if (longWaitMatches) {
    content = content.replace(
      longWaitPattern,
      'await page.waitForTimeout($1); // TODO: Replace with proper element wait'
    );
    changes += longWaitMatches.length;
    console.log(`  ⚠️  Flagged ${longWaitMatches.length} long wait(s) for manual review`);
  }
  
  // Pattern 5: Optimize short waits in loops (1000ms)
  const loopWaitPattern = /await eventPage\.completeRsvp\(firstName, lastName\);\s*await page\.waitForTimeout\(1000\);/g;
  const loopMatches = content.match(loopWaitPattern);
  if (loopMatches) {
    content = content.replace(
      loopWaitPattern,
      `await eventPage.completeRsvp(firstName, lastName);
          await page.waitForTimeout(500); // Reduced - just need form submission to complete`
    );
    changes += loopMatches.length;
    console.log(`  ✅ Optimized ${loopMatches.length} loop wait(s)`);
  }
  
  if (changes > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✨ Applied ${changes} optimization(s) to ${filePath}`);
    return changes;
  } else {
    console.log(`  ℹ️  No optimizations needed for ${filePath}`);
    return 0;
  }
}

// Main execution
console.log('🚀 Starting test wait optimizations...\n');
console.log('This will:');
console.log('  1. Remove duplicative waits after networkidle');
console.log('  2. Reduce RSVP/cancellation processing waits');
console.log('  3. Flag long waits for manual review');
console.log('  4. Optimize loop waits');

let totalChanges = 0;

for (const file of testFiles) {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    totalChanges += optimizeFile(filePath);
  } else {
    console.log(`\n⚠️  File not found: ${file}`);
  }
}

console.log(`\n✅ Optimization complete! Applied ${totalChanges} changes across ${testFiles.length} files.`);
console.log('\n📋 Next steps:');
console.log('  1. Review files with "TODO: Replace with proper element wait" comments');
console.log('  2. Run tests to verify optimizations: npm test');
console.log('  3. Check test execution time improvements');
