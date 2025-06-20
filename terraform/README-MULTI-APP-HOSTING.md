# Hosting Multiple SPAs on a Single CloudFront Distribution with Lambda@Edge

This document explains how we host two single-page applications (SPAs) on a single CloudFront distribution using Lambda@Edge:

1. Main app (`/`) - The main Waterway Cleanups website
2. SESv2 Admin app (`/sesv2-admin/`) - The SES v2 admin interface

## Architecture

Our solution uses Lambda@Edge to implement a pseudo-reverse-proxy pattern, following the approach outlined in [this Medium article](https://medium.com/@yatharthagoenka/deploying-multiple-spas-using-aws-cloudfront-and-s3-with-lamda-edge-as-pseudo-reverse-proxy-8f6314531885).

Key components:

1. **Two S3 Buckets** - Each SPA has its own bucket:
   - `waterwaycleanups.org` - Main website
   - `waterwaycleanups-sesv2-admin` - SESv2 admin app (Files at the root - **not** in a `/sesv2-admin/` folder)

2. **CloudFront Distribution**:
   - Configured with both origins
   - Path pattern `/sesv2-admin/*` routes to the admin app bucket
   - Default behavior routes to the main website bucket
   - Lambda@Edge function handles SPA routing and path translation

3. **Lambda@Edge Function**:
   - Runs at the `origin-request` event
   - Handles SPA routing by serving index.html for non-file paths
   - For admin app static assets, transforms `/sesv2-admin/static/...` to `/static/...`
   - Redirects `/sesv2-admin` to `/sesv2-admin/` for consistency

## How the Lambda@Edge Function Works

The Lambda@Edge function (`lambda-at-edge.js`) receives CloudFront requests at the origin-request phase and:

1. For files under `/sesv2-admin/`:
   - Transforms the path by removing the `/sesv2-admin/` prefix
   - Because the files in the S3 bucket are at the root level, not in a subfolder

2. For SPA routes:
   - Serves index.html to support client-side routing
   - Works for both apps with appropriate path handling

3. For the `/sesv2-admin` base path:
   - Issues a 301 redirect to `/sesv2-admin/` for proper basename handling

## CloudFront Configuration

The CloudFront distribution has:

1. **Two Origins**:
   - `s3-main` - Points to the main website S3 bucket
   - `s3-admin` - Points to the SESv2 admin S3 bucket

2. **Two Cache Behaviors**:
   - Ordered cache behavior for `/sesv2-admin/*` - Routes to the admin app bucket
   - Default cache behavior - Routes to the main website bucket

3. **Custom Cache Policy**:
   - Minimal caching (0-60 seconds) to prevent stale content
   - Supports brotli and gzip encoding

## React Router Configuration

The SESv2 admin React app is correctly configured with:

```jsx
<BrowserRouter basename="/sesv2-admin">
  <App />
</BrowserRouter>
```

This ensures all routes within the admin app are properly prefixed.

## Directory Structure for S3 Buckets

### waterwaycleanups.org bucket (main website)
```
/index.html
/static/css/...
/static/js/...
/images/...
/about/...
```

### waterwaycleanups-sesv2-admin bucket (admin app)
```
/index.html  <- NOT in a /sesv2-admin/ folder
/static/css/...
/static/js/...
/assets/...
```

## Deployment Process

1. **Main App Deployment**:
   ```bash
   aws s3 sync ./public/ s3://waterwaycleanups.org/ --delete
   ```

2. **SESv2 Admin App Deployment**:
   ```bash
   cd sesv2-admin
   npm run build
   aws s3 sync build/ s3://waterwaycleanups-sesv2-admin/ --delete
   ```

3. **CloudFront Cache Invalidation**:
   ```bash
   DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'waterwaycleanups.org')]].Id" --output text)
   aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/sesv2-admin/*" "/sesv2-admin" "/*"
   ```

## Troubleshooting

If you encounter 403 errors for static assets:

1. Check Lambda@Edge logs across all regions using the `check-lambdaedge-logs.sh` script
2. Make sure the static assets are at the root of the admin bucket (not in a `/sesv2-admin/` folder)
3. Verify the Lambda@Edge function is correctly transforming the paths
4. Try a full CloudFront cache invalidation and wait 5-15 minutes

For more details on accessing Lambda@Edge logs, see the `README-LAMBDA-EDGE-LOGS.md` file.
