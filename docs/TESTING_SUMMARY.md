# Testing Quick Reference

## Running Tests

### Local Testing (Fast)
```bash
npm run test:e2e              # Chromium + Firefox
npm run test:e2e:chromium     # Chromium only
npm run test:e2e:firefox      # Firefox only
npm run test:e2e:webkit       # WebKit (may fail on Linux)
```

### Docker Testing (CI-Identical)
```bash
npm run test:e2e:docker:build    # Build image (first time)
npm run test:e2e:docker          # All tests
npm run test:e2e:docker:chromium # Chromium only
npm run test:e2e:docker:firefox  # Firefox only
npm run test:e2e:docker:webkit   # WebKit only
```

### Specific Test Suites
```bash
npm run test:e2e:auth      # Authentication tests
npm run test:e2e:waiver    # Waiver tests
npm run test:e2e:rsvp      # RSVP tests
npm run test:e2e:minors    # Minors system tests
npm run test:e2e:smoke     # Smoke tests only
```

### Debug Mode
```bash
npm run test:e2e:headed    # See browser
npm run test:e2e:ui        # Interactive UI
npm run test:e2e:debug     # Step-by-step debugger
```

## Viewing Test Reports

### After Any Test Run
```bash
# Interactive HTML report with Playwright server
npm run test:e2e:report

# Open HTML report directly in browser
npm run test:e2e:report:open
```

### Report Locations
- **HTML Report**: `test-results/html-report/index.html`
- **JSON Results**: `test-results/test-results.json`
- **JUnit XML**: `test-results/test-results.xml`
- **Screenshots/Videos**: `test-results/artifacts/`

## When to Use What

| Scenario | Command | Why |
|----------|---------|-----|
| Quick local check | `npm run test:e2e` | Fastest, good for development |
| WebKit testing | `npm run test:e2e:docker:webkit` | WebKit needs Docker on Linux |
| Pre-commit check | `npm run test:e2e:docker` | Matches CI exactly |
| Debugging failures | `npm run test:e2e:debug` | Step through test execution |
| CI troubleshooting | `npm run test:e2e:docker` | Reproduce CI environment |

## Documentation

- **Docker Testing**: `docs/DOCKER_TESTING.md` - Full Docker setup guide
- **WebKit Testing**: `docs/WEBKIT_TESTING.md` - WebKit-specific notes
- **Test Writing**: `tests/QUICK_START.md` - How to write tests

## Test Results

All test runs (local or Docker) save results to the same location:
- Reports are always generated, even on failure
- Docker mounts `./test-results/` so reports are immediately available
- Use `npm run test:e2e:report` to view after any test run
