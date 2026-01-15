# Admin Security Implementation Summary

## Changes Made

### 1. Secure API Endpoint Configuration
- **Before**: Client-side hostname detection (`isLocalhost`, `isStaging`)
- **After**: Build-time environment variable injection via Hugo

**Files Modified:**
- `config.yaml` - Added API URL defaults
- `layouts/partials/api-config.html` - Injects URLs from Hugo config
- `static/js/auth-client.js` - Removed hostname detection, throws error if config missing
- `static/js/volunteer-api.js` - Removed hostname detection, throws error if config missing
- `static/js/events-api-client.js` - Removed hostname detection, fallback logic, and static file loading
- `static/js/event-rsvp.js` - Removed hostname detection (4 instances)
- `static/js/events-api-init.js` - Removed fallback URLs
- `.github/workflows/deploy.yml` - Added `HUGO_EVENTS_API_URL` environment variable

### 2. Admin Access Control
- **Before**: Anyone could access `/admin` page
- **After**: Admin verification after authentication

**Files Modified:**
- `terraform/lambda_auth_validate_session.py` - Returns `isAdmin` flag
- `layouts/admin/single.html` - Verifies admin status, redirects non-admins

### 3. Build Scripts
Created environment-specific build scripts:
- `scripts/build-staging.sh` - Sets staging API URLs
- `scripts/build-prod.sh` - Sets production API URLs
- `package.json` - Added `build:staging` and `build:prod` commands

## How It Works

### CI/CD Pipeline (Automatic)
The GitHub Actions workflow automatically:
1. Runs Terraform to get API Gateway URLs
2. Sets environment variables from Terraform outputs:
   - `HUGO_API_BASE_URL` - Main API Gateway
   - `HUGO_API_BASE_URL_VOLUNTEER` - Volunteer API Gateway
   - `HUGO_EVENTS_API_URL` - Events API Gateway
3. Builds Hugo site with injected URLs
4. Deploys to appropriate environment (staging/production)

### Manual Build (Local Development)
```bash
# Staging build
npm run build:staging

# Production build
npm run build:prod
```

### Runtime
1. Hugo injects `window.API_CONFIG` with build-time URLs
2. All JS clients use `window.API_CONFIG` exclusively
3. Missing config throws clear error (no silent fallbacks)

### Admin Access
1. User visits `/admin` and sees login form
2. User authenticates with email code
3. System validates session and checks `isAdmin` flag
4. Non-admins see error and redirect to `/volunteer`
5. Admins see dashboard

## Deployment

### Automatic (Recommended)
Push to `main` branch - GitHub Actions handles everything automatically

### Manual
```bash
# Build for staging
npm run build:staging

# Build for production
npm run build:prod

# Deploy Lambda changes
cd terraform
terraform apply
```

## Security Benefits

1. **No Client-Side Manipulation**: API URLs cannot be changed by users
2. **Environment Isolation**: Staging and production are completely separate builds
3. **Admin Verification**: Server-side admin check via Lambda authorizer
4. **Proper CORS**: Each environment has correct CORS configuration
5. **Fail-Fast**: Missing configuration throws errors instead of silent fallbacks
6. **CI/CD Integration**: Pipeline automatically uses correct URLs per environment
