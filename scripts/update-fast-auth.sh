#!/bin/bash

# Script to update all test files to use the new fast-auth utility

files=(
  "tests/e2e/rsvp/time-restrictions.spec.ts"
  "tests/e2e/rsvp/capacity-race-conditions.spec.ts"
  "tests/e2e/dashboard/accessibility.spec.ts"
  "tests/e2e/dashboard/form-validation.spec.ts"
  "tests/e2e/dashboard/empty-states.spec.ts"
  "tests/e2e/dashboard/network-recovery.spec.ts"
  "tests/e2e/dashboard/mobile-responsive.spec.ts"
  "tests/e2e/dashboard/performance.spec.ts"
)

echo "Updating ${#files[@]} test files to use fast-auth utility..."

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    
    # Add import at the top (after other imports)
    sed -i '/^import.*from.*fixtures\/test-fixtures/a import { authenticateFreshUserWithWaiver } from '\''../../utils/fast-auth'\'';' "$file"
    
    # Remove old imports that are no longer needed
    sed -i '/import.*WaiverPage/d' "$file"
    sed -i '/import.*generateWaiverData/d' "$file"
    sed -i '/import.*generateTestUser.*generateValidationCode/d' "$file"
    sed -i '/import.*insertTestValidationCode/d' "$file"
    
    # Remove the local authenticateFreshUserWithWaiver function (between /** and closing })
    sed -i '/\/\*\*$/,/^  }$/{ /async function authenticateFreshUserWithWaiver/,/^  }$/d; }' "$file"
    
    # Update the call to remove the request parameter
    sed -i 's/authenticateFreshUserWithWaiver(page, request)/authenticateFreshUserWithWaiver(page)/g' "$file"
    
    echo "✓ Updated $file"
  else
    echo "✗ File not found: $file"
  fi
done

echo ""
echo "Done! Updated ${#files[@]} files."
echo "Please review the changes and run tests to verify."
