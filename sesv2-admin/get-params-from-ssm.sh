#!/bin/bash

export AWS_REGION="us-east-1"

# Script to retrieve environment variables from AWS SSM Parameter Store
# Usage: ./get-params-from-ssm.sh [environment]
# Example: ./get-params-from-ssm.sh prod

set -e

# Default to prod if no environment is provided in CI/CD context
ENV=${1:-prod}
APP_PREFIX="/waterwaycleanups/sesv2-admin/${ENV}"

echo "Retrieving parameters from SSM Parameter Store with prefix: $APP_PREFIX"

# Get all parameters under the specified path
PARAMS=$(aws ssm get-parameters-by-path \
    --path "$APP_PREFIX" \
    --with-decryption \
    --recursive \
    --query "Parameters[*].[Name,Value]" \
    --output json)

# Generate .env file
ENV_FILE=".env"
echo "# Generated from SSM Parameter Store for environment: $ENV" > "$ENV_FILE"
echo "# Generated at: $(date)" >> "$ENV_FILE"

echo "$PARAMS" | jq -r '.[] | "\(.[0] | split("/") | last)=\(.[1])"' >> "$ENV_FILE"

echo "Environment file has been created at $ENV_FILE"

cat $ENV_FILE