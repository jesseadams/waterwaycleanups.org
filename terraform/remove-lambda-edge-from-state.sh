#!/bin/bash

# Script to remove Lambda@Edge related resources from Terraform state
# This will remove the resources from state without destroying them in AWS

set -e  # Exit on error

echo "=== Removing Lambda@Edge Resources from Terraform State ==="
echo "-----------------------------------------"

cd "$(dirname "$0")"  # Change to script directory

# Step 1: List resources related to Lambda@Edge in the state
echo "Step 1: Listing Lambda@Edge related resources in Terraform state..."
terraform state list | grep -E "aws_lambda_function\.spa_router|aws_iam_role.*lambda.*edge|aws_iam_policy.*lambda.*edge|aws_lambda.*spa_router" || true

# Step 2: Prompt for confirmation
echo 
echo "IMPORTANT: This script will remove Lambda@Edge resources from Terraform state WITHOUT destroying them in AWS."
echo "This is useful when migrating to separate CloudFront distributions and no longer need the Lambda@Edge function."
echo
read -p "Do you want to continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Operation cancelled."
  exit 1
fi

# Step 3: Remove resources from state
echo "Step 3: Removing Lambda@Edge resources from Terraform state..."

# Remove Lambda function
echo "Removing aws_lambda_function.spa_router..."
terraform state rm aws_lambda_function.spa_router 2>/dev/null || echo "Resource not found in state"

# Remove IAM role and policies
echo "Removing IAM roles and policies..."
terraform state rm aws_iam_role.lambda_edge_role 2>/dev/null || echo "Resource not found in state"
terraform state rm aws_iam_policy.lambda_edge_logs_policy 2>/dev/null || echo "Resource not found in state"
terraform state rm aws_iam_role_policy_attachment.lambda_edge_logs_attachment 2>/dev/null || echo "Resource not found in state" 
terraform state rm aws_iam_role_policy_attachment.lambda_edge_basic 2>/dev/null || echo "Resource not found in state"

# Remove any other possible related resources
echo "Checking for other related resources..."
for resource in $(terraform state list | grep -E "lambda.*edge|spa.*router" || true); do
  echo "Removing $resource..."
  terraform state rm "$resource" 2>/dev/null || echo "Failed to remove $resource"
done

echo "-----------------------------------------"
echo "Removal from state complete!"
echo
echo "The Lambda@Edge resources have been removed from Terraform state."
echo "They still exist in AWS but are no longer managed by Terraform."
echo
echo "To delete them from AWS, use the AWS Console or the cleanup-lambda-edge.sh script."

exit 0
