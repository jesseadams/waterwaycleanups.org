#!/usr/bin/env python3
"""
Test script for Events API Gateway and Lambda functions
"""

import json
import requests
import sys
from datetime import datetime, timedelta

class EventsAPITester:
    def __init__(self, base_url, api_key=None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session_token = None
        
    def get_headers(self, include_auth=True):
        headers = {'Content-Type': 'application/json'}
        
        if self.api_key:
            headers['X-Api-Key'] = self.api_key
            
        if include_auth and self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'
            
        return headers
    
    def test_public_endpoints(self):
        """Test public endpoints that don't require authentication"""
        print("Testing public endpoints...")
        
        # Test GET /events
        try:
            response = requests.get(
                f"{self.base_url}/events",
                headers=self.get_headers(include_auth=False)
            )
            print(f"GET /events: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"  Found {len(data.get('events', []))} events")
            else:
                print(f"  Error: {response.text}")
        except Exception as e:
            print(f"  Exception: {e}")
        
        # Test GET /events/{event_id} with a sample ID
        try:
            response = requests.get(
                f"{self.base_url}/events/sample-event-id",
                headers=self.get_headers(include_auth=False)
            )
            print(f"GET /events/sample-event-id: {response.status_code}")
            if response.status_code != 200:
                print(f"  Expected 404 for non-existent event: {response.text}")
        except Exception as e:
            print(f"  Exception: {e}")
    
    def test_authenticated_endpoints(self):
        """Test endpoints that require authentication"""
        print("Testing authenticated endpoints...")
        
        if not self.session_token:
            print("  Skipping - no session token available")
            return
        
        # Test POST /events (admin only)
        test_event = {
            "title": "Test Event",
            "description": "This is a test event created by the API tester",
            "start_time": (datetime.utcnow() + timedelta(days=7)).isoformat() + "Z",
            "end_time": (datetime.utcnow() + timedelta(days=7, hours=2)).isoformat() + "Z",
            "location": {
                "name": "Test Location",
                "address": "123 Test St, Test City, TC 12345"
            },
            "attendance_cap": 25,
            "status": "active"
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/events",
                headers=self.get_headers(),
                json=test_event
            )
            print(f"POST /events: {response.status_code}")
            if response.status_code == 201:
                data = response.json()
                event_id = data.get('event', {}).get('event_id')
                print(f"  Created event: {event_id}")
                
                # Test updating the event
                if event_id:
                    update_data = {"title": "Updated Test Event"}
                    response = requests.put(
                        f"{self.base_url}/events/{event_id}",
                        headers=self.get_headers(),
                        json=update_data
                    )
                    print(f"PUT /events/{event_id}: {response.status_code}")
                    
                    # Test deleting the event
                    response = requests.delete(
                        f"{self.base_url}/events/{event_id}",
                        headers=self.get_headers()
                    )
                    print(f"DELETE /events/{event_id}: {response.status_code}")
            else:
                print(f"  Error: {response.text}")
        except Exception as e:
            print(f"  Exception: {e}")
    
    def test_volunteer_endpoints(self):
        """Test volunteer-related endpoints"""
        print("Testing volunteer endpoints...")
        
        # Test GET /volunteers/{email}
        test_email = "test@example.com"
        try:
            response = requests.get(
                f"{self.base_url}/volunteers/{test_email}",
                headers=self.get_headers()
            )
            print(f"GET /volunteers/{test_email}: {response.status_code}")
            if response.status_code != 200:
                print(f"  Expected response for volunteer lookup: {response.text}")
        except Exception as e:
            print(f"  Exception: {e}")
    
    def test_error_handling(self):
        """Test error handling and validation"""
        print("Testing error handling...")
        
        # Test invalid JSON
        try:
            response = requests.post(
                f"{self.base_url}/events",
                headers=self.get_headers(),
                data="invalid json"
            )
            print(f"POST /events (invalid JSON): {response.status_code}")
            if response.status_code == 400:
                print("  Correctly rejected invalid JSON")
        except Exception as e:
            print(f"  Exception: {e}")
        
        # Test missing required fields
        try:
            response = requests.post(
                f"{self.base_url}/events",
                headers=self.get_headers(),
                json={"title": "Incomplete Event"}
            )
            print(f"POST /events (missing fields): {response.status_code}")
            if response.status_code == 400:
                print("  Correctly rejected incomplete data")
        except Exception as e:
            print(f"  Exception: {e}")
    
    def run_all_tests(self):
        """Run all tests"""
        print(f"Testing Events API at: {self.base_url}")
        print("=" * 50)
        
        self.test_public_endpoints()
        print()
        
        self.test_authenticated_endpoints()
        print()
        
        self.test_volunteer_endpoints()
        print()
        
        self.test_error_handling()
        print()
        
        print("Testing complete!")

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_events_api.py <api_base_url> [api_key] [session_token]")
        print("Example: python test_events_api.py https://api.example.com/dev")
        sys.exit(1)
    
    base_url = sys.argv[1]
    api_key = sys.argv[2] if len(sys.argv) > 2 else None
    session_token = sys.argv[3] if len(sys.argv) > 3 else None
    
    tester = EventsAPITester(base_url, api_key)
    if session_token:
        tester.session_token = session_token
    
    tester.run_all_tests()

if __name__ == "__main__":
    main()