#!/usr/bin/env python3
"""
End-to-End Test for Multi-Person RSVP System in Staging
Tests the deployed Lambda functions via API Gateway
"""

import json
import requests
import sys
from datetime import datetime, timedelta

# Configuration
API_BASE_URL = "https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging"
TEST_EMAIL = f"test-{int(datetime.now().timestamp())}@example.com"
TEST_EVENT_ID = f"test-event-{int(datetime.now().timestamp())}"

print("=" * 60)
print("Multi-Person RSVP End-to-End Test (Staging)")
print("=" * 60)
print(f"API Base URL: {API_BASE_URL}")
print(f"Test Email: {TEST_EMAIL}")
print(f"Test Event ID: {TEST_EVENT_ID}")
print("")

tests_passed = 0
tests_failed = 0

def print_test(name, passed, details=""):
    global tests_passed, tests_failed
    if passed:
        print(f"✓ PASS: {name}")
        tests_passed += 1
    else:
        print(f"✗ FAIL: {name}")
        if details:
            print(f"  Details: {details}")
        tests_failed += 1

# Test 1: Check RSVP endpoint (no RSVPs yet)
print("\n=== Test 1: Check RSVP (Empty) ===")
try:
    response = requests.post(
        f"{API_BASE_URL}/check-event-rsvp",
        json={"event_id": TEST_EVENT_ID, "email": TEST_EMAIL},
        headers={"Content-Type": "application/json"}
    )
    data = response.json()
    print_test(
        "Check RSVP returns success",
        response.status_code == 200 and data.get("success") == True,
        f"Status: {response.status_code}, Response: {json.dumps(data, indent=2)}"
    )
    print_test(
        "No RSVPs found initially",
        data.get("user_registered") == False,
        f"user_registered: {data.get('user_registered')}"
    )
except Exception as e:
    print_test("Check RSVP endpoint", False, str(e))

# Test 2: Submit legacy format RSVP (backward compatibility)
print("\n=== Test 2: Submit Legacy Format RSVP ===")
try:
    response = requests.post(
        f"{API_BASE_URL}/submit-event-rsvp",
        json={
            "event_id": TEST_EVENT_ID,
            "email": TEST_EMAIL,
            "first_name": "Test",
            "last_name": "User",
            "attendance_cap": 20
        },
        headers={"Content-Type": "application/json"}
    )
    data = response.json()
    print_test(
        "Legacy format RSVP accepted",
        response.status_code == 200 and data.get("success") == True,
        f"Status: {response.status_code}, Response: {json.dumps(data, indent=2)}"
    )
except Exception as e:
    print_test("Legacy format RSVP", False, str(e))

# Test 3: Check RSVP after submission
print("\n=== Test 3: Check RSVP (After Submission) ===")
try:
    response = requests.post(
        f"{API_BASE_URL}/check-event-rsvp",
        json={"event_id": TEST_EVENT_ID, "email": TEST_EMAIL},
        headers={"Content-Type": "application/json"}
    )
    data = response.json()
    print_test(
        "RSVP found after submission",
        data.get("user_registered") == True,
        f"user_registered: {data.get('user_registered')}"
    )
    print_test(
        "RSVP has attendee information",
        len(data.get("user_rsvps", [])) > 0,
        f"RSVPs: {json.dumps(data.get('user_rsvps', []), indent=2)}"
    )
    
    if len(data.get("user_rsvps", [])) > 0:
        rsvp = data["user_rsvps"][0]
        print_test(
            "RSVP has attendee_type field",
            "attendee_type" in rsvp,
            f"attendee_type: {rsvp.get('attendee_type')}"
        )
        print_test(
            "RSVP has attendee_id field",
            "attendee_id" in rsvp,
            f"attendee_id: {rsvp.get('attendee_id')}"
        )
except Exception as e:
    print_test("Check RSVP after submission", False, str(e))

# Test 4: Test duplicate prevention
print("\n=== Test 4: Duplicate Prevention ===")
try:
    response = requests.post(
        f"{API_BASE_URL}/submit-event-rsvp",
        json={
            "event_id": TEST_EVENT_ID,
            "email": TEST_EMAIL,
            "first_name": "Test",
            "last_name": "User",
            "attendance_cap": 20
        },
        headers={"Content-Type": "application/json"}
    )
    data = response.json()
    print_test(
        "Duplicate RSVP rejected",
        response.status_code == 400 or data.get("success") == False,
        f"Status: {response.status_code}, Response: {json.dumps(data, indent=2)}"
    )
except Exception as e:
    print_test("Duplicate prevention", False, str(e))

# Test 5: Test capacity enforcement
print("\n=== Test 5: Capacity Enforcement ===")
try:
    # Try to submit with capacity of 0 (should fail)
    response = requests.post(
        f"{API_BASE_URL}/submit-event-rsvp",
        json={
            "event_id": f"{TEST_EVENT_ID}-capacity",
            "email": f"capacity-{TEST_EMAIL}",
            "first_name": "Capacity",
            "last_name": "Test",
            "attendance_cap": 0
        },
        headers={"Content-Type": "application/json"}
    )
    data = response.json()
    print_test(
        "Capacity enforcement works",
        response.status_code == 400 or data.get("success") == False,
        f"Status: {response.status_code}, Response: {json.dumps(data, indent=2)}"
    )
except Exception as e:
    print_test("Capacity enforcement", False, str(e))

# Test 6: Test API endpoints exist
print("\n=== Test 6: API Endpoints ===")
endpoints = [
    "check-event-rsvp",
    "submit-event-rsvp",
    "cancel-event-rsvp",
    "list-event-rsvps"
]

for endpoint in endpoints:
    try:
        response = requests.options(f"{API_BASE_URL}/{endpoint}")
        print_test(
            f"{endpoint} endpoint accessible",
            response.status_code == 200,
            f"Status: {response.status_code}"
        )
    except Exception as e:
        print_test(f"{endpoint} endpoint", False, str(e))

# Summary
print("\n" + "=" * 60)
print("Test Summary")
print("=" * 60)
total_tests = tests_passed + tests_failed
print(f"Total Tests: {total_tests}")
print(f"✓ Passed: {tests_passed}")
print(f"✗ Failed: {tests_failed}")
print("")

if tests_failed == 0:
    print("=" * 60)
    print("All tests passed! ✓")
    print("=" * 60)
    sys.exit(0)
else:
    print("=" * 60)
    print("Some tests failed! ✗")
    print("=" * 60)
    sys.exit(1)
