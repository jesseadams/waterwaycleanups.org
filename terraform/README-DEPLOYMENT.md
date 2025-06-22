# Deployment Guide for Separate CloudFront Distributions

This guide provides step-by-step instructions for deploying the main website and SESv2 admin app with separate CloudFront distributions.

## Prerequisites

- AWS CLI installed and configured with appropriate credentials
- Terraform installed
- Access to the Route 53 hosted zone for `waterwaycleanups.org`
- ACM certificate that covers `*.waterwaycleanups.org`

## Full Deployment Process

### Step 1: Remove Lambda@Edge from Terraform State

Before deploying the new infrastructure, remove the Lambda@Edge resources from Terraform state:

```bash
cd terraform
./remove-lambda-edge-from-state.sh
```

This script:
1. Lists Lambda@Edge resources in your Terraform state
2. Prompts for confirmation before removal
3. Removes the resources from state without destroying them in AWS

### Step 2: Apply Terraform Changes

Deploy the infrastructure with separate CloudFront distributions:

```bash
cd terraform
terraform validate  # Verify configuration is valid
terraform plan      # Review planned changes
terraform apply     # Apply changes
```

Key components to be deployed:
- Two CloudFront distributions
- Two S3 bucket policies
- Route 53 records for both domains

### Step 3: Update and Deploy the SESv2 Admin App

The React Router configuration in `sesv2-admin/src/index.tsx` has been updated to use:

```tsx
<BrowserRouter basename="/">
  <App />
</BrowserRouter>
```

Deploy the updated app:

```bash
cd sesv2-admin
./deploy.sh
```

### Step 4: Invalidate CloudFront Caches

```bash
# Get distribution IDs
MAIN_DISTRIBUTION_ID=$(terraform -chdir=terraform output -raw main_cloudfront_distribution_id)
ADMIN_DISTRIBUTION_ID=$(terraform -chdir=terraform output -raw admin_cloudfront_distribution_id)

# Invalidate caches
aws cloudfront create-invalidation --distribution-id $MAIN_DISTRIBUTION_ID --paths "/*"
aws cloudfront create-invalidation --distribution-id $ADMIN_DISTRIBUTION_ID --paths "/*"
```

### Step 5: Clean Up Lambda@Edge Resources (Optional)

Once everything is working, you can clean up the old Lambda@Edge resources:

```bash
cd terraform
./cleanup-lambda-edge.sh
```

**Note**: Lambda@Edge functions may take several hours to be fully deleted from all AWS regions.

## Verification

After deployment, verify that both websites are working correctly:

1. Main website: https://waterwaycleanups.org/
2. SESv2 Admin app: https://sesv2-admin.waterwaycleanups.org/

Check that:
- Both sites load correctly
- Static assets are served without 403/404 errors
- SPA routing works properly (try navigating to a subpage and refreshing)

## Troubleshooting

### CloudFront Errors

If you see CloudFront errors:
1. Check the CloudFront distribution status in the AWS Console
2. Verify the S3 bucket policies allow access from CloudFront
3. Create an invalidation: `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"`

### DNS Issues

If you can't access the sites:
1. Check Route 53 records in the AWS Console
2. Verify DNS propagation using `dig sesv2-admin.waterwaycleanups.org`
3. Wait for DNS propagation to complete (can take up to 48 hours)

### S3 Access Issues

If you see 403 errors for static assets:
1. Check the S3 bucket policies
2. Verify the Origin Access Control is configured correctly
3. Check CloudFront cache policy settings
