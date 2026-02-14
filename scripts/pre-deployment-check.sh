#!/bin/bash

# Pre-Deployment Check Script
# Runs all necessary checks before deploying to production

# Don't exit on error - we want to collect all failures
set +e

echo "🚀 Pre-Deployment Check for Production"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
CHECKS_PASSED=0
CHECKS_FAILED=0

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        echo -e "${RED}❌ $2${NC}"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check 1: Node modules installed
echo "📦 Checking dependencies..."
if [ -d "node_modules" ]; then
    print_status 0 "Node modules installed"
else
    print_status 1 "Node modules not found - run 'npm install'"
fi
echo ""

# Check 2: Environment files
echo "🔧 Checking environment configuration..."
if [ -f ".env" ]; then
    print_status 0 ".env file exists"
    
    # Check for production Stripe key
    if grep -q "sk_live_" .env; then
        print_status 0 "Production Stripe secret key configured"
    else
        print_status 1 "Production Stripe secret key not found (should start with sk_live_)"
    fi
else
    print_status 1 ".env file not found"
fi
echo ""

# Check 3: Hugo configuration
echo "📝 Checking Hugo configuration..."
if [ -f "config.yaml" ]; then
    print_status 0 "config.yaml exists"
    
    # Check base URL
    if grep -q "baseURL: https://waterwaycleanups.org/" config.yaml; then
        print_status 0 "Production baseURL configured"
    else
        print_warning "baseURL may not be set to production"
    fi
    
    # Check for live Stripe key
    if grep -q "pk_live_" config.yaml; then
        print_status 0 "Production Stripe publishable key configured"
    else
        print_status 1 "Production Stripe publishable key not found (should start with pk_live_)"
    fi
else
    print_status 1 "config.yaml not found"
fi
echo ""

# Check 4: Build scripts
echo "🔨 Checking build scripts..."
if [ -f "scripts/build-prod.sh" ]; then
    print_status 0 "Production build script exists"
    if [ -x "scripts/build-prod.sh" ]; then
        print_status 0 "Build script is executable"
    else
        print_warning "Build script is not executable - run 'chmod +x scripts/build-prod.sh'"
    fi
else
    print_status 1 "Production build script not found"
fi
echo ""

# Check 5: Terraform configuration
echo "🏗️  Checking Terraform configuration..."
if [ -d "terraform" ]; then
    print_status 0 "Terraform directory exists"
    
    if [ -f "terraform/main.tf" ]; then
        print_status 0 "Terraform main.tf exists"
    else
        print_status 1 "Terraform main.tf not found"
    fi
else
    print_status 1 "Terraform directory not found"
fi
echo ""

# Check 6: AWS credentials
echo "🔐 Checking AWS credentials..."
if command -v aws &> /dev/null; then
    print_status 0 "AWS CLI installed"
    
    if aws sts get-caller-identity &> /dev/null; then
        print_status 0 "AWS credentials configured"
        AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
        echo "   Account: $AWS_ACCOUNT"
    else
        print_status 1 "AWS credentials not configured or invalid"
    fi
else
    print_warning "AWS CLI not installed"
fi
echo ""

# Check 7: Hugo installed
echo "📚 Checking Hugo installation..."
if command -v hugo &> /dev/null; then
    HUGO_VERSION=$(hugo version | grep -oP 'v\d+\.\d+\.\d+' | head -1)
    print_status 0 "Hugo installed ($HUGO_VERSION)"
else
    print_status 1 "Hugo not installed"
fi
echo ""

# Check 8: Test build
echo "🧪 Testing production build..."
if npm run build:prod &> /tmp/build-test.log; then
    print_status 0 "Production build successful"
    
    # Check if public directory was created
    if [ -d "public" ]; then
        FILE_COUNT=$(find public -type f | wc -l)
        print_status 0 "Build output created ($FILE_COUNT files)"
    else
        print_status 1 "Build output directory not found"
    fi
else
    print_status 1 "Production build failed - check /tmp/build-test.log"
fi
echo ""

# Check 9: Database validation
echo "🗄️  Validating databases..."

# Check staging first (should be working)
if node scripts/validate-deployment.js --environment=staging &> /tmp/db-validation-staging.log; then
    print_status 0 "Staging database validation passed"
else
    print_status 1 "Staging database validation failed - check /tmp/db-validation-staging.log"
fi

# Check if production tables exist (they may not yet)
if node scripts/validate-deployment.js --environment=prod &> /tmp/db-validation-prod.log; then
    print_status 0 "Production database validation passed"
else
    print_warning "Production database not ready (expected if not deployed yet)"
    echo "   Run 'cd terraform && terraform apply' to create production infrastructure"
fi
echo ""

# Check 10: Critical files exist
echo "📄 Checking critical files..."
CRITICAL_FILES=(
    "package.json"
    "webpack.config.js"
    "tailwind.config.js"
    "postcss.config.js"
    "playwright.config.ts"
    "tsconfig.json"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_status 0 "$file exists"
    else
        print_status 1 "$file not found"
    fi
done
echo ""

# Summary
echo "======================================"
echo "📊 Summary"
echo "======================================"
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC}"
echo -e "${RED}Failed: $CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready for production deployment.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review PRODUCTION_DEPLOYMENT_CHECKLIST.md"
    echo "2. Deploy infrastructure: cd terraform && terraform apply"
    echo "3. Run migration: npm run migrate:prod:dry-run"
    echo "4. Generate Hugo content: npm run generate-hugo:prod"
    echo "5. Deploy site: npm run build:prod && [deploy to hosting]"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please fix the issues before deploying.${NC}"
    echo ""
    echo "Review the errors above and:"
    echo "1. Fix configuration issues"
    echo "2. Install missing dependencies"
    echo "3. Verify AWS credentials"
    echo "4. Re-run this script"
    exit 1
fi
