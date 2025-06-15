#!/bin/bash
# Script to migrate Terraform state from local to S3 backend

set -e

# Color formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${YELLOW}${BOLD}Terraform State Migration Script${NC}"
echo -e "${YELLOW}This script will help migrate your Terraform state from local to S3 backend.${NC}"
echo

# Step 1: Check if Terraform is installed
echo -e "${GREEN}Step 1: Checking Terraform installation...${NC}"
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}Terraform could not be found! Please install Terraform first.${NC}"
    exit 1
fi
echo -e "✅ Terraform is installed."
echo

# Step 2: Create the S3 bucket and DynamoDB table
echo -e "${GREEN}Step 2: Creating state storage infrastructure...${NC}"
echo -e "Temporarily disabling backend configuration..."

# Temporarily rename backend.tf to disable it
if [ -f "backend.tf" ]; then
  mv backend.tf backend.tf.bak
  echo -e "Renamed backend.tf to backend.tf.bak temporarily"
fi

echo -e "Initializing Terraform without backend configuration..."
terraform init

echo -e "Creating S3 bucket and DynamoDB table for state management..."
terraform apply -auto-approve \
  -target=aws_s3_bucket.terraform_state \
  -target=aws_s3_bucket_versioning.terraform_state_versioning \
  -target=aws_s3_bucket_server_side_encryption_configuration.terraform_state_encryption \
  -target=aws_s3_bucket_public_access_block.terraform_state_public_access_block \
  -target=aws_dynamodb_table.terraform_locks

# Restore backend.tf
if [ -f "backend.tf.bak" ]; then
  mv backend.tf.bak backend.tf
  echo -e "Restored backend.tf configuration"
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to create state storage infrastructure!${NC}"
    exit 1
fi
echo -e "✅ State infrastructure created successfully."
echo

# Step 3: Re-initialize Terraform with the S3 backend
echo -e "${GREEN}Step 3: Migrating state to S3...${NC}"
echo -e "Re-initializing Terraform with S3 backend..."
terraform init -force-copy

if [ $? -ne 0 ]; then
    echo -e "${RED}State migration failed!${NC}"
    exit 1
fi
echo -e "✅ State migrated successfully to S3 backend."
echo

# Step 4: Check the migration status
echo -e "${GREEN}Step 4: Verifying migration...${NC}"
echo -e "Running terraform state list to verify state exists in S3..."
terraform state list

if [ $? -ne 0 ]; then
    echo -e "${RED}State verification failed!${NC}"
    exit 1
fi
echo
echo -e "${GREEN}${BOLD}Migration completed successfully!${NC}"
echo -e "Your Terraform state is now stored in S3 with DynamoDB locking."
echo -e "You can now run terraform plan/apply as normal."
echo

# SESv2 Admin module instructions
echo -e "${YELLOW}${BOLD}Next Steps:${NC}"
echo -e "To migrate the SESv2 Admin module state:"
echo -e "1. cd ../sesv2-admin/terraform"
echo -e "2. terraform init -force-copy"
echo -e "This will configure the SESv2 Admin module to use the same backend with a different state path."
echo
