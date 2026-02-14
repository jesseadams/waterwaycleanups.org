# Docker Testing Guide

This guide explains how to run Playwright tests in Docker, mirroring the exact environment used in GitHub Actions CI.

## Why Docker Testing?

- **Consistency**: Same environment as CI (Hugo 0.147.1, Node 18, all browsers)
- **Isolation**: No conflicts with local dependencies
- **WebKit Support**: Runs WebKit tests on Linux without library issues
- **Reproducibility**: Identical results across different machines

## Quick Start

```bash
# Build the Docker image (first time only)
npm run test:e2e:docker:build

# Run all tests
npm run test:e2e:docker

# Run specific browser
npm run test:e2e:docker:chromium
npm run test:e2e:docker:firefox
npm run test:e2e:docker:webkit
```

## Viewing Test Reports

After running tests in Docker, reports are automatically saved to your local `./test-results/` directory:

### HTML Report (Interactive)
```bash
# Open with Playwright's built-in server
npm run test:e2e:report

# Or open directly in browser
npm run test:e2e:report:open
```

The HTML report includes:
- Test results with pass/fail status
- Screenshots and videos of failures
- Trace files for debugging
- Filtering and search capabilities

### Other Report Formats
- **JSON**: `test-results/test-results.json` - Machine-readable results
- **JUnit XML**: `test-results/test-results.xml` - For CI integration
- **Artifacts**: `test-results/artifacts/` - Screenshots, videos, traces

## How It Works

The Docker setup uses:
- `Dockerfile.test` - Full CI environment with Hugo, Node, and all Playwright browsers
- `docker-compose.test.yml` - Orchestration with volume mounting for results
- `network_mode: host` - Allows Hugo server on localhost:1313

Test results are mounted from the container to your local filesystem, so you can view them immediately after tests complete.

## AWS Credentials

The Docker container mounts your `~/.aws` credentials read-only, allowing tests to interact with DynamoDB and other AWS services just like in CI.

## Troubleshooting

### Tests fail with "Connection refused"
- The Hugo server may not have started yet
- The Docker compose file includes a 10-second sleep, but you may need to increase it

### Reports not generated
- Check that `test-results/` directory exists
- Verify volume mounting in `docker-compose.test.yml`
- Reports are generated even if tests fail

### WebKit tests fail
- WebKit is fully supported in Docker
- If issues persist, check the Dockerfile for missing dependencies

## Comparison with Local Testing

| Feature | Local | Docker |
|---------|-------|--------|
| Setup | Requires local browsers | One-time image build |
| WebKit | May fail on Linux | Always works |
| Consistency | Varies by machine | Identical to CI |
| Speed | Faster | Slightly slower (containerization overhead) |
| Reports | Same location | Same location |

## CI Parity

This Docker setup exactly mirrors the GitHub Actions workflow:
- Same Hugo version (0.147.1)
- Same Node version (18)
- Same Playwright version
- Same browser versions
- Same environment variables

If tests pass in Docker, they should pass in CI.
