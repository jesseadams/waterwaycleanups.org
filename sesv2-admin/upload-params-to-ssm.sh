#!/bin/bash

# Script to upload environment variables from .env to AWS SSM Parameter Store as SecureString
# Usage: ./upload-params-to-ssm.sh [environment]
# Example: ./upload-params-to-ssm.sh prod

set -e

# Default to dev if no environment is provided
ENV=${1:-dev}
APP_PREFIX="/waterwaycleanups/sesv2-admin/${ENV}"
AWS_REGION="us-east-1"  # Set your desired AWS region
REGION=${AWS_REGION}
export AWS_REGION="us-east-1"

echo "Uploading parameters to SSM Parameter Store with prefix: $APP_PREFIX"

# Get the directory where the script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$DIR/.env-${ENV}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env file not found at $ENV_FILE"
    exit 1
fi

# Read .env file and upload each variable to SSM
while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments and empty lines
    if [[ -z "$line" || "$line" =~ ^# ]]; then
        continue
    fi
    
    # Extract key and value
    key=$(echo "$line" | cut -d= -f1)
    value=$(echo "$line" | cut -d= -f2-)
    
    # Create SSM parameter with appropriate path
    param_name="$APP_PREFIX/$key"
    
    echo "Creating/updating parameter: $param_name"
    aws ssm put-parameter \
        --name "$param_name" \
        --value "$value" \
        --type "SecureString" \
        --overwrite
    
done < "$ENV_FILE"

echo "All parameters have been uploaded to SSM Parameter Store"
