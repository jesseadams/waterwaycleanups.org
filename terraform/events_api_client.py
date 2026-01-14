#!/usr/bin/env python3
"""
Simple API client for testing the Events Management API
"""
import json
import requests
from datetime import datetime, timedelta

class EventsAPIClient:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
    
    def create_event(self, event_data):
        """Create a new event"""
        url = f"{self.base_url}/events"
        response = self.session.post(url, json=event_data)
        return response
    
    def get_events(self, **filters):
        """Get events with optional filters"""
        url = f"{self.base_url}/events"
        response = self.session.get(url, params=filters)
        return response
    
    def get_event(self, event_id):
        """Get a specific event"""
        url = f"{self.base_url}/events/{event_id}"
        response = self.session.get(url)
        return response
    
    def update_event(self, event_id, updates):
        """Update an event"""
        url = f"{self.base_url}/events/{event_id}"
        response = self.session.put(url, json=updates)
        return response
    
    def delete_event(self, event_id):
        """Delete an event"""
        url = f"{self.base_url}/events/{event_id}"
        response = self.session.delete(url)
        return response
    
    def get_event_rsvps(self, event_id):
        """Get RSVPs for an event"""
        url = f"{self.base_url}/events/{event_id}/rsvps"
        response = self.session.get(url)
        return response

def test_api_workflow(api_url):
    """Test the complete API workflow"""
    print(f"Testing Events API at: {api_url}")
    print("=" * 60)
    
    client = EventsAPIClient(api_url)
    
    # Test 1: Create a test event
    print("1. Creating a test event...")
    start_time = (datetime.utcnow() + timedelta(days=30)).isoformat() + 'Z'
    end_time = (datetime.utcnow() + timedelta(days=30, hours=3)).isoformat() + 'Z'
    
    test_event = {
        'title': 'API Test Cleanup Event',
        'description': 'A test cleanup event created via API',
        'start_time': start_time,
        'end_time': end_time,
        'location': {
            'name': 'Test Park',
            'address': '123 Test Street, Test City, VA 22101'
        },
        'attendance_cap': 25,
        'hugo_config': {
            'tags': ['test', 'api', 'cleanup'],
            'preheader_is_light': True
        }
    }
    
    response = client.create_event(test_event)
    print(f"   Status: {response.status_code}")
    if response.status_code == 201:
        event_data = response.json()
        event_id = event_data['event']['event_id']
        print(f"   ✓ Event created with ID: {event_id}")
    else:
        print(f"   ✗ Failed to create event: {response.text}")
        return
    
    # Test 2: Get the created event
    print(f"\n2. Retrieving event {event_id}...")
    response = client.get_event(event_id)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✓ Event retrieved successfully")
    else:
        print(f"   ✗ Failed to retrieve event: {response.text}")
    
    # Test 3: List all events
    print("\n3. Listing all events...")
    response = client.get_events()
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        events = response.json()
        print(f"   ✓ Found {events['count']} events")
    else:
        print(f"   ✗ Failed to list events: {response.text}")
    
    # Test 4: Update the event
    print(f"\n4. Updating event {event_id}...")
    updates = {
        'title': 'Updated API Test Cleanup Event',
        'attendance_cap': 30
    }
    response = client.update_event(event_id, updates)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✓ Event updated successfully")
    else:
        print(f"   ✗ Failed to update event: {response.text}")
    
    # Test 5: Get event RSVPs (should be empty)
    print(f"\n5. Getting RSVPs for event {event_id}...")
    response = client.get_event_rsvps(event_id)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        rsvp_data = response.json()
        print(f"   ✓ Found {rsvp_data['statistics']['total_rsvps']} RSVPs")
    else:
        print(f"   ✗ Failed to get RSVPs: {response.text}")
    
    # Test 6: Delete the event
    print(f"\n6. Deleting event {event_id}...")
    response = client.delete_event(event_id)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✓ Event deleted successfully")
    else:
        print(f"   ✗ Failed to delete event: {response.text}")
    
    print("\n" + "=" * 60)
    print("API workflow test completed!")

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python3 events_api_client.py <API_URL>")
        print("Example: python3 events_api_client.py https://abc123.execute-api.us-east-1.amazonaws.com/dev")
        sys.exit(1)
    
    api_url = sys.argv[1]
    test_api_workflow(api_url)