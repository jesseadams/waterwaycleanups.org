#!/bin/bash

# Script to deploy the Lambda@Edge-based multi-SPA setup
# This applies Terraform changes and invalidates the CloudFront cache

set -e  # Exit on error

echo "=== Deploying Multi-SPA Configuration with Lambda@Edge ==="
echo "-----------------------------------------"

# Step 1: Create Lambda deployment package
echo "Step 1: Creating Lambda@Edge deployment package..."
cd "$(dirname "$0")"  # Change to script directory
zip -r lambda-at-edge.zip lambda-at-edge.js

# Step 2: Apply Terraform changes
echo "Step 2: Applying Terraform changes..."
terraform init
terraform apply -auto-approve

# Step 3: Invalidate the CloudFront cache
echo "Step 3: Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'waterwaycleanups.org')]].Id" --output text)
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" "/sesv2-admin/*" "/sesv2-admin"

# Step 4: Wait and then test
echo "Step 4: Waiting for invalidation to start propagating (30 seconds)..."
sleep 30

echo "Testing basic URLs to trigger Lambda@Edge execution..."
echo "Main app:"
curl -s -I https://waterwaycleanups.org/ | grep -E "HTTP|X-Cache"
echo ""
echo "Admin app:"
curl -s -I https://waterwaycleanups.org/sesv2-admin/ | grep -E "HTTP|X-Cache"
echo ""

echo "-----------------------------------------"
echo "Multi-SPA configuration deployed!"
echo ""
echo "NOTE: Lambda@Edge deployments can take up to 15 minutes to propagate globally."
echo "If you experience issues, wait a bit and try again."
echo ""
echo "To check for Lambda@Edge logs, run:"
echo "./check-lambdaedge-logs.sh"
echo ""
echo "To run more comprehensive tests, run:"
echo "./test-routing.sh"
echo ""
echo "For more information on Lambda@Edge logs, see README-LAMBDA-EDGE-LOGS.md"

exit 0
