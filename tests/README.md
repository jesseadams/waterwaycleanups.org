# Playwright E2E Tests

This directory contains end-to-end tests for the Waterway Cleanups volunteer user experience using Playwright.

## Setup

### Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### Configuration

1. Copy `.env.test.example` to `.env.test` and configure your environment variables:
   ```bash
   cp .env.test.example .env.test
   ```

2. Update the environment variables in `.env.test` based on your testing needs.

## Running Tests

### All Tests

```bash
# Run all tests
npx playwright test

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in debug mode
npx playwright test --debug
```

### Specific Test Suites

```bash
# Run authentication tests only
npx playwright test tests/e2e/auth

# Run waiver tests only
npx playwright test tests/e2e/waiver

# Run RSVP tests only
npx playwright test tests/e2e/rsvp

# Run minor management tests only
npx playwright test tests/e2e/minors
```

### Specific Browsers

```bash
# Run tests in Chromium only
npx playwright test --project=chromium

# Run tests in Firefox only
npx playwright test --project=firefox

# Run tests in WebKit only
npx playwright test --project=webkit
```

### Environment-Specific Testing

```bash
# Test against local environment
TEST_ENV=local npx playwright test

# Test against staging environment
TEST_ENV=staging npx playwright test

# Test against production environment (use with caution!)
TEST_ENV=production npx playwright test
```

## Test Reports

After running tests, you can view the HTML report:

```bash
npx playwright show-report test-results/html-report
```

Test results are also available in:
- `test-results/test-results.json` - JSON format
- `test-results/test-results.xml` - JUnit XML format
- `test-results/artifacts/` - Screenshots and videos of failures

## Test Structure

```
tests/
├── e2e/                    # End-to-end test specs
│   ├── auth/              # Authentication flow tests
│   ├── waiver/            # Waiver submission tests
│   ├── rsvp/              # Event RSVP tests
│   └── minors/            # Minor management tests
├── fixtures/              # Test fixtures for setup/teardown
├── pages/                 # Page Object Models
├── utils/                 # Helper utilities
└── README.md             # This file
```

## Writing Tests

### Page Objects

Use Page Object Models to encapsulate page-specific logic:

```typescript
import { LoginPage } from '../pages/LoginPage';

test('user can login', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('test@example.com');
  await loginPage.expectLoginSuccess();
});
```

### Fixtures

Use fixtures for common setup and teardown:

```typescript
import { test } from '../fixtures/auth.fixture';

test('authenticated user can view dashboard', async ({ authenticatedPage }) => {
  // authenticatedPage is already logged in
  await authenticatedPage.goto('/volunteer');
  // ... test logic
});
```

## CI/CD Integration

Tests are configured to run in CI environments with:
- Headless mode enabled
- 2 retries on failure
- Sequential execution (workers: 1)
- Automatic screenshot and video capture on failure

## Debugging

### Visual Debugging

```bash
# Open Playwright Inspector
npx playwright test --debug

# Run with headed browser and slow motion
npx playwright test --headed --slow-mo=1000
```

### Trace Viewer

If a test fails on retry, a trace is captured. View it with:

```bash
npx playwright show-trace test-results/artifacts/trace.zip
```

## Best Practices

1. **Use Page Objects**: Encapsulate page-specific logic in Page Object Models
2. **Use Fixtures**: Share common setup/teardown logic via fixtures
3. **Wait for Elements**: Always wait for elements to be visible/interactive
4. **Unique Test Data**: Generate unique test data for each test run
5. **Clean Up**: Always clean up test data after tests complete
6. **Descriptive Names**: Use clear, descriptive test names
7. **Independent Tests**: Each test should be independent and not rely on others

## Troubleshooting

### Tests Timing Out

- Increase timeout in `playwright.config.ts`
- Check network conditions
- Verify the application is running and accessible

### Flaky Tests

- Add explicit waits for dynamic content
- Use `page.waitForLoadState('networkidle')`
- Implement retry logic for network requests

### Browser Not Found

```bash
# Reinstall browsers
npx playwright install
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)
