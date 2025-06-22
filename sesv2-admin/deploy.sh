#!/bin/bash

# This script deploys the SESv2 admin app to its dedicated S3 bucket and CloudFront distribution
# Usage: ./deploy.sh

set -e

# Build the SESv2 admin app
echo "Building SESv2 admin app..."
npm run build

# Sync the build files to the dedicated S3 bucket
echo "Deploying SESv2 admin app to S3 bucket..."
aws s3 sync build/ s3://waterwaycleanups-sesv2-admin/ --delete

# Verify the deployment by listing the bucket contents
echo "Verifying deployment..."
aws s3 ls s3://waterwaycleanups-sesv2-admin/ --recursive | head -5
echo "..."

# Invalidate CloudFront cache for the admin app
echo "Invalidating CloudFront cache..."
# Get the distribution ID from Terraform output
cd ../terraform
ADMIN_DISTRIBUTION_ID=$(terraform output -raw admin_cloudfront_distribution_id)
cd ../sesv2-admin

if [ -n "$ADMIN_DISTRIBUTION_ID" ]; then
  echo "Invalidating CloudFront distribution: $ADMIN_DISTRIBUTION_ID"
  aws cloudfront create-invalidation --distribution-id $ADMIN_DISTRIBUTION_ID --paths "/*"
else
  echo "WARNING: Could not get CloudFront distribution ID from Terraform output"
  echo "Using aws CLI to find the distribution ID..."
  ADMIN_DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'sesv2-admin.waterwaycleanups.org')]].Id" --output text)
  
  if [ -n "$ADMIN_DISTRIBUTION_ID" ]; then
    echo "Found distribution ID: $ADMIN_DISTRIBUTION_ID"
    aws cloudfront create-invalidation --distribution-id $ADMIN_DISTRIBUTION_ID --paths "/*"
  else
    echo "ERROR: Could not find CloudFront distribution ID. Cache invalidation skipped."
  fi
fi

echo "Deployment complete! SESv2 admin app is available at https://sesv2-admin.waterwaycleanups.org/"
echo ""
echo "NOTE: It may take a few minutes for the CloudFront cache invalidation to complete."
