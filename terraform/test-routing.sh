#!/bin/bash

# Script to test Lambda@Edge routing between main app and sesv2-admin app
# This makes HTTP requests and checks responses to verify the routing is working correctly

echo "Testing Lambda@Edge routing for multiple SPAs..."
echo "-----------------------------------------"

# CloudFront domain - replace with your actual domain
DOMAIN="waterwaycleanups.org"

echo "Testing main app route (/)..."
MAIN_RESPONSE=$(curl -s "https://$DOMAIN/" | grep -o "<title>.*</title>" | head -1)
echo "Main app title: $MAIN_RESPONSE"
echo

echo "Testing SESv2 admin app route (/sesv2-admin/)..."
ADMIN_RESPONSE=$(curl -s "https://$DOMAIN/sesv2-admin/" | grep -o "<title>.*</title>" | head -1)
echo "Admin app title: $ADMIN_RESPONSE"
echo

echo "Testing SESv2 admin app route without trailing slash (/sesv2-admin)..."
curl -s -I "https://$DOMAIN/sesv2-admin" | grep -E "HTTP|Location"
echo

if [[ "$MAIN_RESPONSE" == "$ADMIN_RESPONSE" ]]; then
  echo "⚠️  WARNING: Both applications are returning the same title. This suggests Lambda@Edge routing may not be working correctly."
  echo "The SESv2 admin app should be loaded from a different origin and should have a different title."
else
  echo "✅ Success! The applications are returning different content as expected."
fi

echo "-----------------------------------------"
echo "Debug Information:"
echo

echo "1. Testing SESv2 admin static assets:"
curl -s -I "https://$DOMAIN/sesv2-admin/static/js/main.js" 2>/dev/null | grep -E "HTTP|Content-Type|Content-Length" || echo "File not found"
echo

echo "2. Testing CloudFront origin selection with verbose curl:"
echo "Main app (/)"
curl -s -v "https://$DOMAIN/" 2>&1 | grep -E "Host:|> GET|< HTTP"
echo

echo "SESv2 admin app (/sesv2-admin/)"
curl -s -v "https://$DOMAIN/sesv2-admin/" 2>&1 | grep -E "Host:|> GET|< HTTP"
echo

echo "3. Lambda@Edge Log Check Instructions:"
echo "To verify that the Lambda@Edge function is working correctly:"
echo "  1. Log into AWS Console"
echo "  2. Go to CloudWatch Logs in us-east-1 region"
echo "  3. Look for log groups named like /aws/lambda/us-east-1.spa-router"
echo "  4. Check the latest log streams for request processing"

echo "-----------------------------------------"
echo "If you're still experiencing issues:"
echo "1. Remember Lambda@Edge changes can take up to 15 minutes to propagate"
echo "2. Check that both S3 buckets have the appropriate files"
echo "3. Verify that the CloudFront distribution cache has been invalidated"
echo "4. Ensure bucket policies allow CloudFront to access the objects"
echo "5. Check CloudFront logs for any access denied errors"
echo "6. Verify the Lambda@Edge function version is correctly associated with CloudFront"
