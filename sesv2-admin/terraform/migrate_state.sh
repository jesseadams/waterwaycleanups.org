#!/bin/bash
# Script to migrate SESv2 Admin Terraform state to S3 backend

set -e

# Color formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${YELLOW}${BOLD}SESv2 Admin Terraform State Migration Script${NC}"
echo -e "${YELLOW}This script will configure the sesv2-admin module to use the S3 backend.${NC}"
echo

# Step 1: Check if Terraform is installed
echo -e "${GREEN}Step 1: Checking Terraform installation...${NC}"
if ! command -v terraform &> /dev/null; then
    echo -e "${RED}Terraform could not be found! Please install Terraform first.${NC}"
    exit 1
fi
echo -e "✅ Terraform is installed."
echo

# Step 2: Check if the main state infrastructure exists
echo -e "${GREEN}Step 2: Checking if state infrastructure exists...${NC}"
echo -e "Verifying that the S3 bucket and DynamoDB table exist..."

# Check if we can access the S3 bucket
aws s3 ls s3://waterwaycleanups-terraform-state --summarize >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: S3 bucket 'waterwaycleanups-terraform-state' not found or not accessible!"
    echo -e "Please run the migrate_state.sh script in the main terraform directory first.${NC}"
    exit 1
fi

# Check if we can access the DynamoDB table
aws dynamodb describe-table --table-name waterwaycleanups-terraform-locks >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: DynamoDB table 'waterwaycleanups-terraform-locks' not found or not accessible!"
    echo -e "Please run the migrate_state.sh script in the main terraform directory first.${NC}"
    exit 1
fi
echo -e "✅ State infrastructure exists."
echo

# Step 3: Migrate the SESv2 Admin state to S3
echo -e "${GREEN}Step 3: Migrating SESv2 Admin state to S3...${NC}"
echo -e "Initializing Terraform with the S3 backend..."

# Initialize with force-copy to migrate existing state
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
echo -e "The SESv2 Admin module's Terraform state is now stored in S3 with DynamoDB locking."
echo -e "You can now run terraform plan/apply as normal."
echo
