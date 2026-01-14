#!/bin/bash

# Multi-Person RSVP Staging Deployment Test Script
# This script tests all aspects of the multi-person RSVP system in staging

set -e

echo "=========================================="
echo "Multi-Person RSVP Staging Deployment Test"
echo "=========================================="
echo ""

# Configuration
API_BASE_URL="https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_EVENT_ID="test-event-$(date +%s)"

echo "Configuration:"
echo "  API Base URL: $API_BASE_URL"
echo "  Test Email: $TEST_EMAIL"
echo "  Test Event ID: $TEST_EVENT_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test result
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

# Function to print section header
print_section() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

# Test 1: Check Lambda Functions Exist
print_section "Test 1: Verify Lambda Functions"

check_lambda() {
    aws lambda get-function --function-name "$1" --region us-east-1 > /dev/null 2>&1
    return $?
}

check_lambda "event_rsvp_submit-staging"
print_result $? "event_rsvp_submit Lambda exists"

check_lambda "event_rsvp_check-staging"
print_result $? "event_rsvp_check Lambda exists"

check_lambda "event_rsvp_cancel-staging"
print_result $? "event_rsvp_cancel Lambda exists"

check_lambda "event_rsvp_list-staging"
print_result $? "event_rsvp_list Lambda exists"

# Test 2: Check DynamoDB Table Schema
print_section "Test 2: Verify DynamoDB Table Schema"

TABLE_INFO=$(aws dynamodb describe-table --table-name event_rsvps-staging --region us-east-1 2>&1)

if echo "$TABLE_INFO" | grep -q "attendee_id"; then
    print_result 0 "Table has attendee_id attribute"
else
    print_result 1 "Table missing attendee_id attribute"
fi

if echo "$TABLE_INFO" | grep -q "guardian-email-index"; then
    print_result 0 "Table has guardian-email-index GSI"
else
    print_result 1 "Table missing guardian-email-index GSI"
fi

if echo "$TABLE_INFO" | grep -q "email-index"; then
    print_result 0 "Table has email-index GSI"
else
    print_result 1 "Table missing email-index GSI"
fi

# Test 3: Test API Endpoints Accessibility
print_section "Test 3: Test API Endpoints"

test_endpoint() {
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$API_BASE_URL/$1")
    if [ "$RESPONSE" = "200" ]; then
        return 0
    else
        return 1
    fi
}

test_endpoint "check-event-rsvp"
print_result $? "check-event-rsvp endpoint accessible (HTTP $RESPONSE)"

test_endpoint "submit-event-rsvp"
print_result $? "submit-event-rsvp endpoint accessible (HTTP $RESPONSE)"

test_endpoint "cancel-event-rsvp"
print_result $? "cancel-event-rsvp endpoint accessible (HTTP $RESPONSE)"

test_endpoint "list-event-rsvps"
print_result $? "list-event-rsvps endpoint accessible (HTTP $RESPONSE)"

# Test 4: Test Backward Compatibility (Legacy Single-Person RSVP)
print_section "Test 4: Backward Compatibility Test"

echo "Testing legacy single-person RSVP format..."
LEGACY_RESPONSE=$(curl -s -X POST "$API_BASE_URL/check-event-rsvp" \
    -H "Content-Type: application/json" \
    -d "{
        \"event_id\": \"test-event-legacy\",
        \"email\": \"legacy@example.com\"
    }")

if echo "$LEGACY_RESPONSE" | grep -q "success"; then
    print_result 0 "Legacy RSVP format accepted"
else
    print_result 1 "Legacy RSVP format rejected"
    echo "Response: $LEGACY_RESPONSE"
fi

# Test 5: Test Lambda Environment Variables
print_section "Test 5: Verify Lambda Environment Variables"

check_lambda_env() {
    ENV_VARS=$(aws lambda get-function-configuration --function-name "$1" --region us-east-1 --query 'Environment.Variables' 2>&1)
    if echo "$ENV_VARS" | grep -q "$2"; then
        return 0
    else
        return 1
    fi
}

check_lambda_env "event_rsvp_submit-staging" "EVENT_RSVPS_TABLE_NAME"
print_result $? "event_rsvp_submit has EVENT_RSVPS_TABLE_NAME"

check_lambda_env "event_rsvp_submit-staging" "MINORS_TABLE_NAME"
print_result $? "event_rsvp_submit has MINORS_TABLE_NAME"

check_lambda_env "event_rsvp_cancel-staging" "SESSIONS_TABLE_NAME"
print_result $? "event_rsvp_cancel has SESSIONS_TABLE_NAME"

check_lambda_env "event_rsvp_check-staging" "EVENT_RSVPS_TABLE_NAME"
print_result $? "event_rsvp_check has EVENT_RSVPS_TABLE_NAME"

# Test 6: Test Capacity Enforcement Logic
print_section "Test 6: Capacity Enforcement"

echo "Note: This test requires Python and boto3 to be installed"
if command -v python3 &> /dev/null; then
    python3 terraform/test_multi_person_rsvp.py --test-capacity 2>&1 | grep -q "PASS"
    if [ $? -eq 0 ]; then
        print_result 0 "Capacity enforcement logic verified"
    else
        print_result 1 "Capacity enforcement logic failed"
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC}: Python3 not available for capacity test"
fi

# Test 7: Test Duplicate Detection Logic
print_section "Test 7: Duplicate Detection"

if command -v python3 &> /dev/null; then
    python3 terraform/test_multi_person_rsvp.py --test-duplicates 2>&1 | grep -q "PASS"
    if [ $? -eq 0 ]; then
        print_result 0 "Duplicate detection logic verified"
    else
        print_result 1 "Duplicate detection logic failed"
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC}: Python3 not available for duplicate test"
fi

# Test 8: Test Cancellation Flow
print_section "Test 8: Cancellation Flow"

if command -v python3 &> /dev/null; then
    python3 terraform/test_cancel_rsvp.py 2>&1 | grep -q "All tests passed"
    if [ $? -eq 0 ]; then
        print_result 0 "Cancellation flow verified"
    else
        print_result 1 "Cancellation flow failed"
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC}: Python3 not available for cancellation test"
fi

# Test 9: Test Guardian Query
print_section "Test 9: Guardian Query (GSI)"

if command -v python3 &> /dev/null; then
    python3 terraform/test_check_rsvp_enhancement.py 2>&1 | grep -q "All tests passed"
    if [ $? -eq 0 ]; then
        print_result 0 "Guardian query (GSI) verified"
    else
        print_result 1 "Guardian query (GSI) failed"
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC}: Python3 not available for guardian query test"
fi

# Test 10: Verify API Gateway Deployment
print_section "Test 10: API Gateway Deployment"

STAGE_INFO=$(aws apigateway get-stage --rest-api-id ppiqomgl8a --stage-name staging --region us-east-1 2>&1)

if echo "$STAGE_INFO" | grep -q "deploymentId"; then
    print_result 0 "API Gateway stage deployed"
else
    print_result 1 "API Gateway stage not found"
fi

# Summary
print_section "Test Summary"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}=========================================="
    echo "All tests passed! ✓"
    echo -e "==========================================${NC}"
    exit 0
else
    echo -e "${RED}=========================================="
    echo "Some tests failed! ✗"
    echo -e "==========================================${NC}"
    exit 1
fi
