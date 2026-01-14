#!/usr/bin/env python3
"""Test the check-event-rsvp API to see what it returns"""

import requests
import json

# API endpoint
url = "https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging/check-event-rsvp"

# Test data
payload = {
    "event_id": "brooke-road-and-thorny-point-road-cleanup-february-2026",
    "email": "jesse@techno-geeks.org"
}

print(f"Testing check-event-rsvp API...")
print(f"URL: {url}")
print(f"Payload: {json.dumps(payload, indent=2)}\n")

response = requests.post(url, json=payload)

print(f"Status Code: {response.status_code}")
print(f"Response:\n{json.dumps(response.json(), indent=2)}")
