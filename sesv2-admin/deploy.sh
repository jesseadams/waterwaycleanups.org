#!/bin/bash

# This script deploys the SESv2 admin app to its dedicated S3 bucket
# Usage: ./deploy.sh

set -e

# Build the SESv2 admin app
echo "Building SESv2 admin app..."
npm run build

# Sync the build files to the dedicated S3 bucket
echo "Deploying SESv2 admin app to S3 bucket..."
aws s3 sync ./build/ s3://waterwaycleanups-sesv2-admin/ --delete

# Invalidate CloudFront cache for the admin app paths
echo "Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'waterwaycleanups.org')]].Id" --output text)
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/sesv2-admin/*" "/sesv2-admin"

echo "Deployment complete! SESv2 admin app is available at https://waterwaycleanups.org/sesv2-admin/"
