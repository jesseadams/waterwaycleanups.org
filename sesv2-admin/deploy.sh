#!/bin/bash

# This script deploys the SESv2 admin app to its dedicated S3 bucket
# Usage: ./deploy.sh

set -e

# Build the SESv2 admin app
echo "Building SESv2 admin app..."
npm run build

# Sync the build files to the dedicated S3 bucket
# Important: Files need to be at the root of the bucket, not in a /sesv2-admin/ prefix
echo "Deploying SESv2 admin app to S3 bucket..."
aws s3 sync build/ s3://waterwaycleanups-sesv2-admin/ --delete

# Verify the deployment by listing the bucket contents
echo "Verifying deployment..."
aws s3 ls s3://waterwaycleanups-sesv2-admin/ --recursive | head -5
echo "..."

# Invalidate CloudFront cache for the admin app paths
echo "Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'waterwaycleanups.org')]].Id" --output text)
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/sesv2-admin/*" "/sesv2-admin"

echo "Deployment complete! SESv2 admin app is available at https://waterwaycleanups.org/sesv2-admin/"
echo ""
echo "NOTE: It may take a few minutes for the CloudFront cache invalidation to complete."
echo "If you see 403 errors for static assets, it's likely because the Lambda@Edge function needs to be updated"
echo "or the CloudFront cache still has old responses."
