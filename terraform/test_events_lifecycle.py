#!/usr/bin/env python3
"""
Test script for event lifecycle management functionality
"""

import json
import requests
import os
from datetime import datetime, timezone, timedelta

# Configuration
API_BASE_URL = os.environ.get('EVENTS_API_URL', 'https://your-api-gateway-url.amazonaws.com/dev')
API_KEY = os.environ.get('EVENTS_API_KEY', 'your-api-key')

def test_lifecycle_management():
    """Test event lifecycle management functions"""
    
    headers = {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
    }
    
    print("Testing Event Lifecycle Management")
    print("=" * 50)
    
    # Test 1: Update completed events
    print("\n1. Testing automatic status updates for completed events...")
    try:
        response = requests.post(
            f"{API_BASE_URL}/events/lifecycle",
            headers=headers,
            json={'action': 'update_completed_events'}
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"Updated events: {result.get('updated_events', [])}")
            print(f"Message: {result.get('message', 'No message')}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")
    
    # Test 2: Categorize events
    print("\n2. Testing event categorization...")
    try:
        response = requests.post(
            f"{API_BASE_URL}/events/lifecycle",
            headers=headers,
            json={'action': 'categorize_events'}
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            categories = result.get('categories', {})
            summary = result.get('summary', {})
            print(f"Upcoming events: {summary.get('upcoming_count', 0)}")
            print(f"Current events: {summary.get('current_count', 0)}")
            print(f"Past events: {summary.get('past_count', 0)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")
    
    # Test 3: Archive old events
    print("\n3. Testing event archiving...")
    try:
        # Archive events older than 6 months
        archive_date = (datetime.now(timezone.utc) - timedelta(days=180)).isoformat()
        response = requests.post(
            f"{API_BASE_URL}/events/lifecycle",
            headers=headers,
            json={
                'action': 'archive_events',
                'archive_before_date': archive_date,
                'archive_status': 'completed'
            }
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"Archived events: {result.get('archived_events', [])}")
            print(f"Message: {result.get('message', 'No message')}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")
    
    # Test 4: Cancel event (commented out to avoid accidental cancellations)
    print("\n4. Event cancellation test (skipped - would require specific event ID)")
    print("   To test cancellation, uncomment and provide a valid event_id")
    """
    try:
        response = requests.post(
            f"{API_BASE_URL}/events/lifecycle",
            headers=headers,
            json={
                'action': 'cancel_event',
                'event_id': 'test-event-id',
                'reason': 'Testing cancellation workflow',
                'notify_volunteers': False  # Set to False for testing
            }
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"Cancelled event: {result.get('event_id')}")
            print(f"Notified volunteers: {result.get('notification_count', 0)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")
    """

def test_get_events():
    """Test getting events to see current status"""
    
    print("\n" + "=" * 50)
    print("Current Events Status")
    print("=" * 50)
    
    try:
        response = requests.get(f"{API_BASE_URL}/events")
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            events = result.get('events', [])
            print(f"Total events: {len(events)}")
            
            # Group by status
            status_counts = {}
            for event in events:
                status = event.get('status', 'unknown')
                status_counts[status] = status_counts.get(status, 0) + 1
            
            print("Events by status:")
            for status, count in status_counts.items():
                print(f"  {status}: {count}")
                
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    print("Event Lifecycle Management Test")
    print("Make sure to set EVENTS_API_URL and EVENTS_API_KEY environment variables")
    print()
    
    test_get_events()
    test_lifecycle_management()
    
    print("\n" + "=" * 50)
    print("Test completed!")