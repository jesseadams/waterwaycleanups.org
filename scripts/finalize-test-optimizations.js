#!/usr/bin/env node

/**
 * Finalize test wait optimizations
 * Removes all remaining TODO waits with proper replacements
 */

const fs = require('fs');
const path = require('path');

function optimizeFile(filePath) {
  console.log(`\n📝 Finalizing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  // Pattern 1: Remove waits after waitForDashboardLoad (dashboard is already ready)
  const dashboardPattern = /await dashboardPage\.waitForDashboardLoad\(\);\s*await page\.waitForTimeout\(\d+\);.*\n/g;
  const dashboardMatches = content.match(dashboardPattern);
  if (dashboardMatches) {
    content = content.replace(
      dashboardPattern,
      `await dashboardPage.waitForDashboardLoad();\n      // waitForDashboardLoad already ensures dashboard is ready\n`
    );
    changes += dashboardMatches.length;
    console.log(`  ✅ Removed ${dashboardMatches.length} unnecessary wait(s) after dashboard load`);
  }
  
  // Pattern 2: Reduce waits after RSVP success
  const rsvpSuccessPattern = /await eventPage\.expectRsvpSuccess\(\);\s*await page\.waitForTimeout\(2000\);.*\n/g;
  const rsvpSuccessMatches = content.match(rsvpSuccessPattern);
  if (rsvpSuccessMatches) {
    content = content.replace(
      rsvpSuccessPattern,
      `await eventPage.expectRsvpSuccess();\n      await page.waitForTimeout(500); // Brief wait for backend processing\n`
    );
    changes += rsvpSuccessMatches.length;
    console.log(`  ✅ Optimized ${rsvpSuccessMatches.length} RSVP success wait(s)`);
  }
  
  // Pattern 3: Reduce waits after cancellation
  const cancelPattern = /await eventPage\.cancelRsvp\(\);\s*await page\.waitForTimeout\(2000\);.*\n/g;
  const cancelMatches = content.match(cancelPattern);
  if (cancelMatches) {
    content = content.replace(
      cancelPattern,
      `await eventPage.cancelRsvp();\n      await page.waitForTimeout(500); // Brief wait for backend processing\n`
    );
    changes += cancelMatches.length;
    console.log(`  ✅ Optimized ${cancelMatches.length} cancellation wait(s)`);
  }
  
  if (changes > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✨ Applied ${changes} optimization(s)`);
    return changes;
  } else {
    console.log(`  ℹ️  No additional optimizations needed`);
    return 0;
  }
}

// Files to optimize
const testFiles = [
  'tests/e2e/rsvp/time-restrictions.spec.ts',
];

console.log('🚀 Finalizing test wait optimizations...\n');

let totalChanges = 0;

for (const file of testFiles) {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    totalChanges += optimizeFile(filePath);
  } else {
    console.log(`\n⚠️  File not found: ${file}`);
  }
}

console.log(`\n✅ Finalization complete! Applied ${totalChanges} changes.`);
