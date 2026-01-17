#!/bin/bash

# Production to Staging Migration Test Script
# 
# This script orchestrates the complete migration process:
# 1. Clears staging data
# 2. Migrates production data to staging
# 3. Validates the migrated data
#
# Usage:
#   ./scripts/test-prod-to-staging-migration.sh [--dry-run] [--skip-clear] [--verbose]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=""
SKIP_CLEAR=""
VERBOSE=""

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN="--dry-run"
      ;;
    --skip-clear)
      SKIP_CLEAR="--skip-clear"
      ;;
    --verbose)
      VERBOSE="--verbose"
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--dry-run] [--skip-clear] [--verbose]"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Production to Staging Migration Test                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$DRY_RUN" ]; then
  echo -e "${YELLOW}⚠️  DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

# Check if AWS credentials are configured
echo -e "${BLUE}🔐 Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
  echo -e "${RED}❌ AWS credentials not configured${NC}"
  echo "Please configure AWS credentials using one of:"
  echo "  - aws configure"
  echo "  - export AWS_PROFILE=your-profile"
  echo "  - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
  exit 1
fi

IDENTITY=$(aws sts get-caller-identity --query 'Arn' --output text)
echo -e "${GREEN}✅ Using AWS identity: ${IDENTITY}${NC}"
echo ""

# Step 1: Populate events from markdown
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Step 1: Populate Events from Markdown Files              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

node scripts/populate-events-from-markdown.js --environment=staging $DRY_RUN $VERBOSE

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Event population failed${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Events populated${NC}"
echo ""

# Step 2: Run migration
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Step 2: Migrate Production Data to Staging               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$DRY_RUN" ]; then
  echo -e "${YELLOW}Running migration in dry-run mode...${NC}"
else
  echo -e "${YELLOW}⚠️  This will clear staging data and copy from production!${NC}"
  echo -e "${YELLOW}Press Ctrl+C within 5 seconds to cancel...${NC}"
  sleep 5
  echo ""
fi

node scripts/migrate-prod-to-staging.js $DRY_RUN $SKIP_CLEAR $VERBOSE

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Migration failed${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Migration completed${NC}"
echo ""

# Step 2: Validate (only if not dry-run)
if [ -z "$DRY_RUN" ]; then
  echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║  Step 3: Validate Staging Data                            ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  node scripts/validate-staging-data.js $VERBOSE
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Validation failed${NC}"
    exit 1
  fi
  
  echo ""
  echo -e "${GREEN}✅ Validation passed${NC}"
  echo ""
fi

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Migration Test Complete                                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$DRY_RUN" ]; then
  echo -e "${YELLOW}This was a dry run. To apply changes, run:${NC}"
  echo -e "${YELLOW}  ./scripts/test-prod-to-staging-migration.sh${NC}"
else
  echo -e "${GREEN}✅ Events populated from markdown files (10 events)${NC}"
  echo -e "${GREEN}✅ Production data successfully migrated to staging${NC}"
  echo -e "${GREEN}✅ Staging data validated and ready for use${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Test your application against staging"
  echo "  2. Verify all functionality works as expected"
  echo "  3. Check staging URLs in .env.development"
fi

echo ""
