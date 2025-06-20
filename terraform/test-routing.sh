#!/bin/bash

# Script to test Lambda@Edge routing between main app and sesv2-admin app
# This makes HTTP requests and displays response headers to verify the routing is working correctly

echo "Testing Lambda@Edge routing for multiple SPAs..."
echo "-----------------------------------------"

# CloudFront domain - replace with your actual domain
DOMAIN="waterwaycleanups.org"

# Function to make a request and check response headers
make_request() {
  local url=$1
  local description=$2
  
  echo -e "\nTesting $description: $url"
  echo "--------------------------------"
  
  # Make the request and capture headers
  RESPONSE_HEADERS=$(curl -s -I "$url")
  HTTP_STATUS=$(echo "$RESPONSE_HEADERS" | grep -i "^HTTP" | head -1)
  
  # Print status code
  echo "Status: $HTTP_STATUS"
  
  # Check for specific headers
  CACHE_HEADER=$(echo "$RESPONSE_HEADERS" | grep -i "X-Cache:")
  CACHE_HIT=$(echo "$RESPONSE_HEADERS" | grep -i "X-Cache-Hit:")
  CONTENT_TYPE=$(echo "$RESPONSE_HEADERS" | grep -i "Content-Type:")
  
  echo "X-Cache: ${CACHE_HEADER:-Not present}"
  echo "Content-Type: ${CONTENT_TYPE:-Not present}"
  
  # Check for any error indicators in headers
  if [[ "$CACHE_HEADER" == *"Error"* ]]; then
    echo -e "\n⚠️  WARNING: X-Cache Error detected! This suggests a CloudFront configuration issue."
    echo "Check your Lambda@Edge function and CloudFront error responses."
  fi
  
  # Make another request to get the body and check title
  BODY=$(curl -s "$url")
  TITLE=$(echo "$BODY" | grep -o "<title>.*</title>" | head -1)
  echo "Page title: $TITLE"
}

# Test main routes
make_request "https://$DOMAIN/" "main app root route"
make_request "https://$DOMAIN/about/" "main app non-root route"
make_request "https://$DOMAIN/static/css/style.css" "main app static asset"

# Test admin routes
make_request "https://$DOMAIN/sesv2-admin/" "admin app root route"
make_request "https://$DOMAIN/sesv2-admin/settings/" "admin app non-root route"
make_request "https://$DOMAIN/sesv2-admin" "admin app without trailing slash (should redirect)"

echo -e "\n-----------------------------------------"
echo "Debug Information:"

echo -e "\n1. Testing CloudFront origin selection with verbose curl:"
echo "Main app (/)"
curl -s -v "https://$DOMAIN/" 2>&1 | grep -E "Host:|> GET|< HTTP|< x-cache"
echo

echo "SESv2 admin app (/sesv2-admin/)"
curl -s -v "https://$DOMAIN/sesv2-admin/" 2>&1 | grep -E "Host:|> GET|< HTTP|< x-cache"

echo -e "\n-----------------------------------------"
echo "Lambda@Edge Log Check Instructions:"
echo "  1. Run the check-lambdaedge-logs.sh script to check logs across all regions"
echo "  2. If no logs are found, wait a few minutes for logs to propagate"
echo "  3. See README-LAMBDA-EDGE-LOGS.md for more detailed information"
