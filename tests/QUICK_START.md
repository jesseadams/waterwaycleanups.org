# Playwright E2E Tests - Quick Start Guide

## Initial Setup (One-time)

```bash
# 1. Install dependencies (already done)
npm install

# 2. Install Playwright browsers (already done)
npx playwright install

# 3. Configure environment
cp .env.test.example .env.test
# Edit .env.test with your settings
```

## Running Tests

### Quick Commands

```bash
# Run all tests
npm run test:e2e

# Run with visible browser
npm run test:e2e:headed

# Debug mode (step through tests)
npm run test:e2e:debug

# Run specific browser
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit

# Run specific test suite
npm run test:e2e:auth
npm run test:e2e:waiver
npm run test:e2e:rsvp
npm run test:e2e:minors

# View test report
npm run test:e2e:report

# Interactive UI mode
npm run test:e2e:ui
```

### Advanced Commands

```bash
# Run specific test file
npx playwright test tests/e2e/auth/login.spec.ts

# Run tests matching pattern
npx playwright test --grep "login"

# Run with specific environment
TEST_ENV=staging npm run test:e2e

# Run with trace
npx playwright test --trace on
```

## Test Development Workflow

1. **Start Hugo server** (in separate terminal):
   ```bash
   npm run start
   ```

2. **Write your test** in appropriate directory:
   - `tests/e2e/auth/` - Authentication tests
   - `tests/e2e/waiver/` - Waiver tests
   - `tests/e2e/rsvp/` - RSVP tests
   - `tests/e2e/minors/` - Minor management tests

3. **Run test in debug mode**:
   ```bash
   npx playwright test your-test.spec.ts --debug
   ```

4. **Fix issues and iterate**

5. **Run full suite** before committing:
   ```bash
   npm run test:e2e
   ```

## Debugging Failed Tests

### View Screenshots and Videos

Failed tests automatically capture screenshots and videos:
```bash
# Screenshots and videos are in:
test-results/artifacts/
```

### View Trace

If test failed on retry, view the trace:
```bash
npx playwright show-trace test-results/artifacts/trace.zip
```

### Run with Playwright Inspector

```bash
npx playwright test --debug
```

### Run with Headed Browser

```bash
npm run test:e2e:headed
```

## Environment Configuration

### Local Testing (Default)
```bash
TEST_ENV=local npm run test:e2e
```
Tests run against `http://localhost:1313`

### Staging Testing
```bash
TEST_ENV=staging npm run test:e2e
```
Tests run against staging URL

### Production Testing (Use with caution!)
```bash
TEST_ENV=production npm run test:e2e
```
Tests run against production URL

## CI/CD

Tests automatically run in GitHub Actions on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

View results in the Actions tab of your repository.

## Common Issues

### "Browser not found"
```bash
npx playwright install
```

### "Connection refused"
Make sure Hugo server is running:
```bash
npm run start
```

### "Test timeout"
Increase timeout in `playwright.config.ts` or specific test:
```typescript
test('my test', async ({ page }) => {
  test.setTimeout(120000); // 2 minutes
  // ... test code
});
```

### Flaky tests
- Add explicit waits: `await page.waitForLoadState('networkidle')`
- Use `waitForSelector` with visible state
- Implement retry logic for network requests

## Next Steps

1. Review the [full README](./README.md) for detailed documentation
2. Check out [Playwright documentation](https://playwright.dev)
3. Start writing tests following the Page Object Model pattern
4. Use fixtures for common setup/teardown logic

## Getting Help

- Playwright Docs: https://playwright.dev
- Playwright Discord: https://aka.ms/playwright/discord
- Project README: [tests/README.md](./README.md)
