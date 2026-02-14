# WebKit Testing

## Overview

WebKit (Safari) browser tests work perfectly in Docker but fail on Ubuntu 25.04 due to missing `libicu74` library dependency.

## Recommended Approach: Docker Testing

Use the Docker testing environment which mirrors GitHub Actions:

```bash
# Build the Docker image (first time only)
npm run test:e2e:docker:build

# Run all tests (all browsers)
npm run test:e2e:docker

# Run specific browser
npm run test:e2e:docker:webkit
npm run test:e2e:docker:firefox
npm run test:e2e:docker:chromium
```

See `docs/DOCKER_TESTING.md` for complete documentation.

## Legacy WebKit-Only Docker Setup

The original webkit-only setup still works:

```bash
npm run test:e2e:webkit:build  # Build webkit-only image
npm run test:e2e:webkit:docker # Run webkit tests only
```

## Why Docker?

The Docker environment:
- Mirrors GitHub Actions (Ubuntu 24.04, Node 18, Hugo 0.147.1)
- Includes all browser dependencies
- Automatically mounts AWS credentials
- Saves test results to local filesystem
- Works consistently across all machines

## CI Environment

GitHub Actions uses Ubuntu 22.04 which has proper webkit support, so webkit tests run normally in CI without Docker.
