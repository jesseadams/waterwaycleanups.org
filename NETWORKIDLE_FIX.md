# NetworkIdle Timeout Fix

## Problem
Tests were experiencing intermittent `networkidle` timeout errors across all browsers, but especially in WebKit and tablet configurations in CI. The error:
```
TimeoutError: page.waitForLoadState: Timeout 30000ms exceeded
```

## Root Cause
Google Analytics (`gtag.js`) loaded on every page was keeping the network "busy" indefinitely:
- Google Analytics makes ongoing network requests
- It can take a while to fully load and initialize  
- It may keep connections open for tracking purposes
- `networkidle` waits for 500ms of no network activity, which may never happen with analytics running

## Solution
Block Google Analytics and other third-party tracking scripts in the test environment using two approaches:

### Approach 1: Disable at Source (Hugo Template)
Modified `layouts/partials/head_custom.html` to conditionally load Google Analytics only in production:
```html
{{ if not (or (eq (getenv "HUGO_ENV") "test") (eq (getenv "HUGO_ENV") "staging") (eq hugo.Environment "test") (eq hugo.Environment "staging")) }}
<!-- Google Analytics scripts only load in production -->
{{ end }}
```

Updated `.github/workflows/playwright.yml` to set `HUGO_ENV=test` during build and server start.

### Approach 2: Block at Test Level (Playwright)
Added route blocking as a fallback to ensure analytics never loads during tests:

### 1. Global Setup (`tests/global-setup.ts`)
Added route blocking to prevent analytics scripts from loading during authentication setup:
```typescript
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (
    url.includes('googletagmanager.com') ||
    url.includes('google-analytics.com') ||
    url.includes('analytics.google.com') ||
    url.includes('doubleclick.net') ||
    url.includes('facebook.com') ||
    url.includes('facebook.net')
  ) {
    route.abort();
  } else {
    route.continue();
  }
});
```

### 2. Playwright Config (`playwright.config.ts`)
Added global `beforeEach` hook to block analytics in all tests:
```typescript
async beforeEach({ page }) {
  // Block Google Analytics and other third-party scripts that prevent networkidle
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (
      url.includes('googletagmanager.com') ||
      url.includes('google-analytics.com') ||
      url.includes('analytics.google.com') ||
      url.includes('doubleclick.net') ||
      url.includes('facebook.com') ||
      url.includes('facebook.net')
    ) {
      route.abort();
    } else {
      route.continue();
    }
  });
},
```

## Why This Approach?
1. **Addresses root cause**: Removes the resource that's preventing `networkidle` from completing
2. **No test changes needed**: All existing `networkidle` waits continue to work
3. **Better test isolation**: Tests aren't affected by external third-party services
4. **Faster tests**: No time wasted loading/executing analytics scripts
5. **More reliable**: Eliminates a source of flakiness
6. **Defense in depth**: Both template-level and test-level blocking ensure analytics never loads
7. **Works in staging too**: Analytics disabled in staging environment for testing

## Alternative Approaches Considered
- ❌ Replacing `networkidle` with `load` - Made things worse (tried and reverted)
- ❌ Increasing timeouts - Doesn't address root cause, just masks the problem
- ❌ Replacing `networkidle` with element waits - Would require changing hundreds of test lines

## Expected Results
- All browsers (chromium, firefox, webkit, mobile-safari, tablet) should pass consistently
- No more intermittent `networkidle` timeout errors
- Tests run faster without loading analytics scripts
