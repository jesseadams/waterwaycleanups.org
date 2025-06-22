#!/bin/bash

# Script to deploy separate CloudFront distributions for main website and SESv2 admin app
# This creates a clean separation between the two applications

set -e  # Exit on error

echo "=== Deploying Separate CloudFront Distributions ==="
echo "-----------------------------------------"

# Step 1: Initialize and apply Terraform changes
echo "Step 1: Applying Terraform changes for separate CloudFront distributions..."
cd "$(dirname "$0")"  # Change to script directory
terraform init
terraform apply -auto-approve

# Step 2: Invalidate both CloudFront caches
echo "Step 2: Invalidating CloudFront caches..."
MAIN_DISTRIBUTION_ID=$(terraform output -raw main_cloudfront_distribution_id)
ADMIN_DISTRIBUTION_ID=$(terraform output -raw admin_cloudfront_distribution_id)

echo "Invalidating main website distribution ($MAIN_DISTRIBUTION_ID)..."
aws cloudfront create-invalidation --distribution-id $MAIN_DISTRIBUTION_ID --paths "/*"

echo "Invalidating SESv2 admin distribution ($ADMIN_DISTRIBUTION_ID)..."
aws cloudfront create-invalidation --distribution-id $ADMIN_DISTRIBUTION_ID --paths "/*"

# Step 3: Wait for a bit and test the deployments
echo "Step 3: Waiting for invalidation to start propagating (30 seconds)..."
sleep 30

echo "Testing main website..."
curl -s -I https://waterwaycleanups.org/ | grep -E "HTTP|X-Cache"
echo ""

echo "Testing SESv2 admin app..."
curl -s -I https://sesv2-admin.waterwaycleanups.org/ | grep -E "HTTP|X-Cache"
echo ""

echo "-----------------------------------------"
echo "Deployment complete!"
echo ""
echo "Your websites are now available at:"
echo "  - Main website: https://waterwaycleanups.org/"
echo "  - SESv2 Admin: https://sesv2-admin.waterwaycleanups.org/"
echo ""
echo "Important Next Steps:"
echo "1. Update the SESv2 admin app's React Router configuration to use:"
echo "   <BrowserRouter basename=\"/\"> instead of <BrowserRouter basename=\"/sesv2-admin\">"
echo ""
echo "2. Update any API endpoints or CORS settings to work with the new domain"

exit 0
