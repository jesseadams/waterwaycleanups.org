#!/bin/bash

# Script to clean up Lambda@Edge resources that are no longer needed
# This removes the Lambda@Edge function and associated resources

set -e  # Exit on error

echo "=== Cleaning up Lambda@Edge Resources ==="
echo "-----------------------------------------"

cd "$(dirname "$0")"  # Change to script directory

# Step 1: List the Lambda@Edge functions
echo "Step 1: Listing Lambda@Edge functions..."
aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'spa-router')].{Name:FunctionName,Runtime:Runtime}" --output table

# Step 2: Prompt for confirmation
echo 
echo "IMPORTANT: This script will delete Lambda@Edge resources that are no longer needed."
echo "Make sure you have deployed the separate CloudFront distributions first."
echo
read -p "Do you want to continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Operation cancelled."
  exit 1
fi

# Step 3: Delete Lambda@Edge function
echo "Step 3: Deleting Lambda@Edge function..."
SPA_ROUTER_ARN=$(aws lambda list-functions --query "Functions[?FunctionName=='spa-router'].FunctionArn" --output text)
if [ -n "$SPA_ROUTER_ARN" ]; then
  echo "Found SPA router function: $SPA_ROUTER_ARN"
  
  # Get all versions
  VERSIONS=$(aws lambda list-versions-by-function --function-name spa-router --query "Versions[?Version!='$LATEST'].Version" --output text)
  
  # Delete each version
  for VERSION in $VERSIONS; do
    echo "Deleting function version $VERSION..."
    aws lambda delete-function --function-name spa-router --qualifier $VERSION || true
  done
  
  # Delete the latest version
  echo "Deleting latest function version..."
  aws lambda delete-function --function-name spa-router || true
  
  echo "Lambda@Edge function deleted."
else
  echo "SPA router function not found."
fi

# Step 4: Remove Lambda@Edge related files
echo "Step 4: Removing Lambda@Edge related files..."
rm -f lambda-at-edge.js lambda-at-edge.zip || true

echo "-----------------------------------------"
echo "Cleanup complete!"
echo
echo "These files have been removed:"
echo "- lambda-at-edge.js"
echo "- lambda-at-edge.zip"
echo
echo "Lambda@Edge function 'spa-router' has been deleted."
echo
echo "Note: Some resources may still appear in the AWS console for a while due to replication lag."
echo "CloudFront distributions using Lambda@Edge cannot be modified until the Lambda@Edge functions are fully deleted."
echo "This process may take up to several hours."

exit 0
