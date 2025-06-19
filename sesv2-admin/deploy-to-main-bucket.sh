#!/bin/bash

# This script deploys the SESv2 admin app to the main S3 bucket in the /sesv2-admin/ prefix
# Usage: ./deploy-to-main-bucket.sh

set -e

# Build the SESv2 admin app
echo "Building SESv2 admin app..."
npm run build

# Create sesv2-admin directory in main bucket if it doesn't exist
echo "Creating sesv2-admin directory in main bucket..."
aws s3api put-object --bucket waterwaycleanups.org --key sesv2-admin/

# Sync the build files to the /sesv2-admin/ prefix in the main bucket
echo "Deploying SESv2 admin app to /sesv2-admin/ in the main bucket..."
aws s3 sync ./build/ s3://waterwaycleanups.org/sesv2-admin/ --delete

echo "Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'waterwaycleanups.org')]].Id" --output text)
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/sesv2-admin/*"

echo "Deployment complete! SESv2 admin app is available at https://waterwaycleanups.org/sesv2-admin/"
