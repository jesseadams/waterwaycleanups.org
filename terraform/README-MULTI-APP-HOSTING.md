# Hosting Multiple SPAs on a Single CloudFront Distribution with Lambda@Edge

This document explains how we host two single-page applications (SPAs) on a single CloudFront distribution using Lambda@Edge:

1. Main app (`/`) - The main Waterway Cleanups website
2. SESv2 Admin app (`/sesv2-admin/`) - The SES v2 admin interface

## Architecture

Our solution uses Lambda@Edge to implement a pseudo-reverse-proxy pattern, following the approach outlined in [this Medium article](https://medium.com/@yatharthagoenka/deploying-multiple-spas-using-aws-cloudfront-and-s3-with-lamda-edge-as-pseudo-reverse-proxy-8f6314531885).

Key components:

1. **Two S3 Buckets** - Each SPA has its own bucket:
   - `waterwaycleanups.org` - Main website
   - `waterwaycleanups-sesv2-admin` - SESv2 admin app

2. **CloudFront Distribution**:
   - Configured with both origins
   - Path pattern `/sesv2-admin/*` routes to the admin app bucket
   - Default behavior routes to the main website bucket
   - Lambda@Edge function handles SPA routing for both applications

3. **Lambda@Edge Function** - Handles SPA routing:
   - Runs at the `origin-request` event
   - Redirects `/sesv2-admin` to `/sesv2-admin/` for consistency
   - Serves `index.html` for non-file requests to support client-side routing

## How the Lambda@Edge Function Works

The Lambda@Edge function (`lambda-at-edge.js`) receives CloudFront requests at the origin-request phase and:

1. If the request is for a file (has an extension), it passes the request through unchanged
2. If the request is for `/sesv2-admin` (without trailing slash), it redirects to `/sesv2-admin/` 
3. For other non-file requests, it serves `index.html` to support SPA routing

This approach allows us to host both SPAs on a single domain while maintaining proper routing for each app.

## CloudFront Configuration

The CloudFront distribution has:

1. **Two Origins**:
   - `s3-main` - Points to the main website S3 bucket
   - `s3-admin` - Points to the SESv2 admin S3 bucket

2. **Two Cache Behaviors**:
   - Ordered cache behavior for `/sesv2-admin/*` - Routes to the admin app bucket
   - Default cache behavior - Routes to the main website bucket and attaches the Lambda@Edge function

## CI/CD Pipeline

The GitHub Actions workflow `.github/workflows/deploy-sesv2-admin.yml` handles:

1. Creating and uploading the Lambda@Edge function
2. Applying all Terraform changes
3. Building and deploying the SESv2 admin app to its S3 bucket
4. Invalidating the CloudFront cache

## SPA Configuration

The SESv2 admin React app is configured with:

```jsx
<BrowserRouter basename="/sesv2-admin">
  <App />
</BrowserRouter>
```

This ensures all routes within the admin app are properly prefixed.

## Folder Structure

- `terraform/lambda-at-edge.js` - The Lambda@Edge function code
- `terraform/lambda_edge.tf` - Terraform configuration for the Lambda@Edge function
- `terraform/cloudfront_route53.tf` - CloudFront distribution configuration
- `terraform/sesv2_admin_bucket.tf` - S3 bucket for the SESv2 admin app

## Deployment Process

The full deployment process is:

1. Create a Lambda deployment package:
   ```bash
   cd terraform
   zip lambda-at-edge.zip lambda-at-edge.js
   ```

2. Apply Terraform changes:
   ```bash
   cd terraform
   terraform init
   terraform apply
   ```

3. Deploy the SESv2 admin app:
   ```bash
   cd sesv2-admin
   npm run build
   aws s3 sync build/ s3://waterwaycleanups-sesv2-admin/ --delete
   ```

4. Invalidate the CloudFront cache:
   ```bash
   DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'waterwaycleanups.org')]].Id" --output text)
   aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" "/sesv2-admin/*" "/sesv2-admin"
   ```

## Troubleshooting

1. **Lambda@Edge Logs**: Lambda@Edge function logs are stored in CloudWatch Logs in the us-east-1 region. Check these logs for any errors in the routing logic.

2. **CloudFront Cache**: Remember that CloudFront caches responses. If changes aren't visible, invalidate the cache.

3. **S3 Bucket Contents**: Verify that both S3 buckets contain the correct files.

4. **Lambda@Edge Deployment**: Lambda@Edge functions require some time to propagate to all CloudFront edge locations. Allow up to 15 minutes for changes to take effect globally.

5. **403 or 404 Errors**: Check that:
   - S3 bucket policies allow CloudFront to access the objects
   - The path in the request is correctly structured
   - The Lambda@Edge function is correctly handling SPA routes
