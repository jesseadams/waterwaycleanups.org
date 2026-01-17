# CI/CD Integration for Playwright Tests

## Overview

This document describes the CI/CD integration for the Playwright end-to-end test suite. Tests run automatically on pull requests and pushes to main/develop branches.

## GitHub Actions Workflow

The workflow is defined in `.github/workflows/playwright.yml` and includes:

- **Multi-browser testing**: Tests run on Chromium, Firefox, and WebKit
- **Headless execution**: Tests run in headless mode in CI
- **Parallel execution**: Tests run in parallel across browsers
- **Automatic retries**: Failed tests retry up to 2 times
- **Artifact collection**: Screenshots, videos, traces, and reports are uploaded

### Workflow Triggers

- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop` branches

### Test Artifacts

When tests complete, the following artifacts are uploaded:

1. **Test Results (JSON)**: Machine-readable test results
2. **Test Results (JUnit XML)**: For integration with CI tools
3. **HTML Report**: Interactive test report with detailed results
4. **Screenshots**: Captured on test failures
5. **Videos**: Recorded for failed tests
6. **Traces**: Playwright traces for debugging failures

All artifacts are retained for 30 days.

## NPM Scripts

### Running All Tests

```bash
npm run test:e2e              # Run all tests
npm run test:e2e:headed       # Run with visible browser
npm run test:e2e:debug        # Run in debug mode
npm run test:e2e:ui           # Run with Playwright UI
```

### Running Specific Test Suites

```bash
npm run test:e2e:auth         # Authentication tests
npm run test:e2e:waiver       # Waiver submission tests
npm run test:e2e:rsvp         # RSVP flow tests
npm run test:e2e:minors       # Minor management tests
```

### Running Smoke Tests

```bash
npm run test:e2e:smoke        # Run only tests tagged with @smoke
```

To tag a test as a smoke test, add `.only` or use test tags:

```typescript
test('critical user flow @smoke', async ({ page }) => {
  // Test implementation
});
```

### Browser-Specific Tests

```bash
npm run test:e2e:chromium     # Run on Chromium only
npm run test:e2e:firefox      # Run on Firefox only
npm run test:e2e:webkit       # Run on WebKit only
```

### Viewing Reports

```bash
npm run test:e2e:report       # Open HTML report in browser
```

### CI-Specific Execution

```bash
npm run test:e2e:ci           # Run with CI-optimized reporters
```

## Environment Configuration

Tests can run against different environments:

- **local**: `http://localhost:1313` (default)
- **ci**: `http://localhost:1313` (CI environment)
- **staging**: Staging environment URL
- **production**: Production environment URL

Set the environment using the `TEST_ENV` variable:

```bash
TEST_ENV=staging npm run test:e2e
```

## Test Configuration

The Playwright configuration (`playwright.config.ts`) includes:

- **Parallel execution**: Tests run in parallel locally
- **Sequential on CI**: Tests run sequentially in CI for stability
- **Automatic retries**: 2 retries on CI, 0 locally
- **Timeouts**: 60s per test, 30min global timeout on CI
- **Artifacts**: Screenshots and videos on failure, traces on retry

## Best Practices

1. **Tag critical tests**: Use `@smoke` tag for critical path tests
2. **Keep tests isolated**: Each test should be independent
3. **Use fixtures**: Leverage test fixtures for setup/teardown
4. **Check CI logs**: Review artifacts when tests fail in CI
5. **Run locally first**: Test changes locally before pushing

## Troubleshooting

### Tests fail in CI but pass locally

- Check the uploaded screenshots and videos
- Review the trace files for detailed execution logs
- Ensure timing/network conditions are handled properly

### Artifacts not uploading

- Verify the artifact paths in the workflow file
- Check that tests are generating the expected output files
- Review GitHub Actions logs for upload errors

### Browser installation issues

- The workflow installs browsers automatically
- If issues occur, check the "Install Playwright Browsers" step
- Ensure the correct browser versions are specified

## Requirements Validation

This CI/CD setup validates the following requirements:

- **6.1**: Tests run in headless mode in CI ✅
- **6.2**: Multiple report formats generated (HTML, JSON, JUnit) ✅
- **6.3**: Screenshots and videos captured on failure ✅
- **6.4**: Environment-specific configuration supported ✅
- **6.5**: Proper exit codes for pipeline integration ✅
- **10.2**: Scripts for running all tests and specific suites ✅
