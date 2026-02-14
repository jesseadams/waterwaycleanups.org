# Test Wait Optimization Guide

## Summary
Found 145 unnecessary or suboptimal `waitForTimeout` calls across 19 test files.

## Key Optimizations

### 1. Remove Duplicative Waits (Immediate Win)
**Pattern**: `waitForTimeout` immediately after `waitForLoadState('networkidle')`

```typescript
// BEFORE (slow)
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1000);

// AFTER (fast)
await page.waitForLoadState('networkidle');
// networkidle already waited for network activity to stop
```

**Files affected**: 2 instances

### 2. Replace Long Timeouts with Element Waits
**Pattern**: `waitForTimeout(2000+)` after actions

```typescript
// BEFORE (slow, brittle)
await loginPage.clickVerifyCode();
await page.waitForTimeout(2000);
const token = await loginPage.getSessionToken();

// AFTER (fast, reliable)
await loginPage.clickVerifyCode();
await page.waitForFunction(() => localStorage.getItem('sessionToken') !== null);
const token = await loginPage.getSessionToken();
```

**Files affected**: 143 instances

### 3. Use Direct DynamoDB for Test Setup (Biggest Win)
**Pattern**: Browser-based waiver creation in `beforeEach`

```typescript
// BEFORE (19+ seconds)
async function authenticateFreshUserWithWaiver(page, request) {
  // Create waiver through UI (slow)
  await waiverPage.submitCompleteWaiver(...);
  await page.waitForTimeout(2000);
  
  // Authenticate through UI (slow)
  await loginPage.clickSendCode();
  await page.waitForTimeout(2000);
  // ... more waits
}

// AFTER (<1 second)
import { setupFastAuth } from '../../utils/dynamodb-cleanup';

async function authenticateFreshUserWithWaiver(page, request) {
  const testUser = generateTestUser();
  const testCode = generateValidationCode();
  
  // Create waiver + validation code directly in DynamoDB (fast)
  await setupFastAuth(testUser, testCode);
  
  // Only use browser for actual login UI
  await loginPage.enterEmail(testUser.email);
  await loginPage.clickSendCode();
  await loginPage.enterValidationCode(testCode);
  await loginPage.clickVerifyCode();
  await page.waitForFunction(() => localStorage.getItem('sessionToken') !== null);
  
  return { testUser, sessionToken: await loginPage.getSessionToken() };
}
```

## Impact Analysis

### Current State
- **beforeEach hooks**: ~19 seconds (browser-based setup)
- **Test timeouts**: Frequently hitting 60s limit
- **Total test time**: Excessive due to cumulative waits

### After Optimization
- **beforeEach hooks**: <2 seconds (DynamoDB + minimal browser)
- **Test timeouts**: Rare, only on actual failures
- **Total test time**: 80-90% reduction

## Implementation Priority

1. **HIGH**: Replace browser-based auth setup with `setupFastAuth()` (saves 17s per test)
2. **MEDIUM**: Remove duplicative waits after `networkidle` (saves 1-2s per occurrence)
3. **LOW**: Replace long timeouts with element waits (improves reliability, modest time savings)

## Files Requiring Changes

### Critical (beforeEach hooks - 17s savings each)
- `tests/e2e/rsvp/rsvp-submission.spec.ts`
- `tests/e2e/rsvp/multi-person-rsvp.spec.ts`
- `tests/e2e/rsvp/capacity-race-conditions.spec.ts`
- `tests/e2e/dashboard/*.spec.ts` (8 files)
- `tests/e2e/integration/user-journey.spec.ts`

### Important (duplicative waits)
- `tests/e2e/auth/unauthenticated-access.spec.ts`
- `tests/e2e/dashboard/accessibility.spec.ts`

### Nice-to-have (long timeouts)
- All test files (143 instances)

## Next Steps

1. Update `authenticateFreshUserWithWaiver` to use `setupFastAuth()`
2. Remove `waitForTimeout` after `networkidle`
3. Gradually replace long timeouts with proper element waits
