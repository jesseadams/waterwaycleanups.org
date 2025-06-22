#!/bin/bash

# Script to clean up duplicate Terraform resources
# This removes the old CloudFront and Lambda@Edge configuration that's no longer needed

set -e  # Exit on error

echo "=== Cleaning up Duplicate Terraform Resources ==="
echo "-----------------------------------------"

cd "$(dirname "$0")"  # Change to script directory

# Step 1: Rename old CloudFront configuration file to keep it as reference
echo "Step 1: Moving old CloudFront configuration to backup..."
if [ -f "cloudfront_route53.tf" ]; then
  mv cloudfront_route53.tf cloudfront_route53.tf.bak
  echo "  ✓ Renamed: cloudfront_route53.tf → cloudfront_route53.tf.bak"
fi

# Step 2: Remove Lambda@Edge resource declarations if not needed
echo "Step 2: Moving Lambda@Edge resources to backup..."
if [ -f "lambda_edge.tf" ]; then
  mv lambda_edge.tf lambda_edge.tf.bak
  echo "  ✓ Renamed: lambda_edge.tf → lambda_edge.tf.bak"
fi

# Step 3: Remove duplicate bucket versioning from website_bucket.tf
echo "Step 3: Checking for duplicate bucket versioning..."
if grep -q "aws_s3_bucket_versioning" website_bucket.tf; then
  # Create backup
  cp website_bucket.tf website_bucket.tf.bak
  
  # Remove versioning section
  sed -i '/# S3 bucket versioning/,/}/d' website_bucket.tf
  
  echo "  ✓ Removed duplicate versioning from website_bucket.tf"
  echo "  ✓ Backup saved: website_bucket.tf.bak"
fi

# Step 4: Check for other duplicate declarations
echo "Step 4: Checking for other duplicate declarations..."
DUPLICATES=$(grep -r "aws_cloudfront_distribution\|aws_route53_record\|aws_s3_bucket_policy" --include="*.tf" | grep -v "separate_distributions.tf\|s3_bucket_policies.tf" | awk -F: '{print $1}' | sort | uniq)

if [ -n "$DUPLICATES" ]; then
  echo "Found potential duplicates in these files:"
  echo "$DUPLICATES"
  
  for FILE in $DUPLICATES; do
    if [ "$FILE" != "separate_distributions.tf" ] && [ "$FILE" != "s3_bucket_policies.tf" ]; then
      echo "Creating backup of $FILE"
      cp "$FILE" "${FILE}.bak"
    fi
  done
  
  echo "Backups created. Please review and manually remove duplicate declarations."
else
  echo "  ✓ No other duplicate declarations found."
fi

echo "-----------------------------------------"
echo "Cleanup complete!"
echo 
echo "The following backup files were created:"
echo "- cloudfront_route53.tf.bak"
echo "- lambda_edge.tf.bak"
echo "- [others if identified]"
echo
echo "Next steps:"
echo "1. Run 'terraform validate' to check for conflicts"
echo "2. Deploy your changes with 'terraform plan' and 'terraform apply'"
echo "3. Remove backup files once everything is working"

exit 0
