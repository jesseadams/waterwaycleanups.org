# WebKit Testing on Ubuntu 25.04

## Problem

WebKit (Safari) browser tests fail on Ubuntu 25.04 due to missing `libicu74` library dependency. This is a known issue with newer Ubuntu versions.

## Solution: Docker Container

We use Docker to run webkit tests in an Ubuntu 24.04 environment where all dependencies are available.

## Prerequisites

- Docker or Podman installed
- AWS credentials configured in `~/.aws/credentials` (automatically mounted)

## Running WebKit Tests

### First Time Setup

Build the Docker image:

```bash
npm run test:e2e:webkit:build
```

### Run All WebKit Tests

```bash
npm run test:e2e:webkit:docker
```

This will:
1. Start a container with Ubuntu 24.04 and webkit dependencies
2. Mount your local code and AWS credentials into the container
3. Run the webkit test suite
4. Save test results to `./test-results/`

### Run Specific WebKit Tests

```bash
docker-compose -f docker-compose.playwright.yml run --rm playwright \
  npx playwright test tests/e2e/auth --project=webkit
```

Or run a single test file:

```bash
docker-compose -f docker-compose.playwright.yml run --rm playwright \
  npx playwright test tests/e2e/dashboard/form-validation.spec.ts --project=webkit
```

### View Test Reports

Test results are saved to your local `test-results/` directory:

```bash
npm run test:e2e:report
```

## How It Works

The Docker setup:
- Uses the official Playwright Docker image with webkit support
- Mounts your `~/.aws` directory (read-only) for AWS credentials
- Sets `CI=true` to enable webkit tests (they're skipped locally by default)
- Uses `network_mode: host` to access localhost services
- Preserves test results in your local filesystem

## CI Environment

GitHub Actions uses Ubuntu 22.04 which has proper webkit support, so webkit tests run normally in CI without Docker.

## Alternative: Skip WebKit Locally

If you don't need to run webkit tests locally, they're already configured to skip on non-CI environments in `playwright.config.ts`:

```typescript
grep: process.env.CI ? undefined : /$^/,
```

This means webkit tests only run when `CI=true` (in GitHub Actions or Docker).
