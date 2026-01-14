#!/usr/bin/env python3
"""
Test script for check-event-rsvp Lambda enhancement
Tests the new guardian query and formatting functionality
"""

import json
import sys
import os

# Set mock environment variables to prevent boto3 initialization errors
os.environ['AWS_DEFAULT_REGION'] = 'us-east-1'
os.environ['EVENTS_TABLE_NAME'] = 'events-test'
os.environ['VOLUNTEERS_TABLE_NAME'] = 'volunteers-test'
os.environ['RSVPS_TABLE_NAME'] = 'rsvps-test'
os.environ['EVENT_RSVPS_TABLE_NAME'] = 'event_rsvps-test'

def test_format_rsvp_record():
    """Test the format_rsvp_record function"""
    print("\n=== Testing format_rsvp_record ===")
    
    # Mock boto3 to avoid AWS connection
    import unittest.mock as mock
    sys.modules['boto3'] = mock.MagicMock()
    
    # Import the function after mocking
    sys.path.insert(0, '.')
    from lambda_event_rsvp_check import format_rsvp_record
    
    # Test 1: Volunteer RSVP with all fields
    print("\n1. Testing volunteer RSVP with all fields...")
    volunteer_rsvp = {
        'attendee_id': 'volunteer@example.com',
        'attendee_type': 'volunteer',
        'first_name': 'John',
        'last_name': 'Doe',
        'email': 'volunteer@example.com',
        'created_at': '2025-01-14T10:00:00Z'
    }
    result = format_rsvp_record(volunteer_rsvp)
    assert result['attendee_id'] == 'volunteer@example.com'
    assert result['attendee_type'] == 'volunteer'
    assert result['first_name'] == 'John'
    assert result['last_name'] == 'Doe'
    assert result['created_at'] == '2025-01-14T10:00:00Z'
    assert 'age' not in result  # Age should not be included for volunteers
    print("   ✓ Volunteer RSVP formatted correctly")
    
    # Test 2: Minor RSVP with age
    print("\n2. Testing minor RSVP with age...")
    minor_rsvp = {
        'attendee_id': 'minor-uuid-123',
        'attendee_type': 'minor',
        'first_name': 'Jane',
        'last_name': 'Doe',
        'email': 'volunteer@example.com',
        'guardian_email': 'volunteer@example.com',
        'age': 12,
        'created_at': '2025-01-14T10:00:00Z'
    }
    result = format_rsvp_record(minor_rsvp)
    assert result['attendee_id'] == 'minor-uuid-123'
    assert result['attendee_type'] == 'minor'
    assert result['first_name'] == 'Jane'
    assert result['last_name'] == 'Doe'
    assert result['age'] == 12  # Age should be included for minors
    assert result['created_at'] == '2025-01-14T10:00:00Z'
    print("   ✓ Minor RSVP formatted correctly with age")
    
    # Test 3: Legacy RSVP without attendee_type
    print("\n3. Testing legacy RSVP without attendee_type...")
    legacy_rsvp = {
        'email': 'legacy@example.com',
        'first_name': 'Legacy',
        'last_name': 'User',
        'submission_date': '2024-12-01T10:00:00Z'
    }
    result = format_rsvp_record(legacy_rsvp)
    assert result['attendee_id'] == 'legacy@example.com'  # Should default to email
    assert result['attendee_type'] == 'volunteer'  # Should default to volunteer
    assert result['first_name'] == 'Legacy'
    assert result['last_name'] == 'User'
    assert result['created_at'] == '2024-12-01T10:00:00Z'  # Should use submission_date
    print("   ✓ Legacy RSVP handled correctly with defaults")
    
    # Test 4: Legacy RSVP without attendee_id
    print("\n4. Testing legacy RSVP without attendee_id...")
    legacy_rsvp2 = {
        'email': 'another@example.com',
        'first_name': 'Another',
        'last_name': 'User',
        'created_at': '2024-11-15T10:00:00Z'
    }
    result = format_rsvp_record(legacy_rsvp2)
    assert result['attendee_id'] == 'another@example.com'  # Should default to email
    assert result['attendee_type'] == 'volunteer'  # Should default to volunteer
    print("   ✓ Legacy RSVP without attendee_id handled correctly")
    
    # Test 5: Minor without age (edge case)
    print("\n5. Testing minor RSVP without age...")
    minor_no_age = {
        'attendee_id': 'minor-uuid-456',
        'attendee_type': 'minor',
        'first_name': 'Young',
        'last_name': 'Person',
        'email': 'guardian@example.com',
        'guardian_email': 'guardian@example.com',
        'created_at': '2025-01-14T10:00:00Z'
    }
    result = format_rsvp_record(minor_no_age)
    assert result['attendee_type'] == 'minor'
    assert 'age' not in result  # Age should not be included if not present
    print("   ✓ Minor RSVP without age handled correctly")
    
    print("\n✅ All format_rsvp_record tests passed!")


def main():
    """Run all tests"""
    print("=" * 60)
    print("Testing Check Event RSVP Enhancement")
    print("=" * 60)
    
    try:
        test_format_rsvp_record()
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        print("\nThe check-event-rsvp Lambda enhancement is working correctly:")
        print("  ✓ Formats RSVP records with complete attendee information")
        print("  ✓ Includes age for minor attendees")
        print("  ✓ Handles legacy records without attendee_type")
        print("  ✓ Defaults attendee_id to email for legacy records")
        print("  ✓ Handles missing fields gracefully")
        
        return 0
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
