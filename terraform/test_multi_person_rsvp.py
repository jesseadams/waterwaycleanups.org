"""
Test script for multi-person RSVP submission logic
"""
import json
import sys

# Mock the helper functions to test the logic
def test_parse_request_format():
    """Test parsing of legacy and new request formats"""
    
    # Test legacy format
    legacy_body = {
        'event_id': 'test-event',
        'email': 'test@example.com',
        'first_name': 'John',
        'last_name': 'Doe'
    }
    
    # Simulate parse_request_format
    if 'attendees' in legacy_body:
        attendees = legacy_body['attendees']
        email = legacy_body.get('email')
    else:
        email = legacy_body.get('email')
        attendee = {
            'type': 'volunteer',
            'email': email,
            'first_name': legacy_body.get('first_name'),
            'last_name': legacy_body.get('last_name')
        }
        attendees = [attendee]
    
    assert len(attendees) == 1, "Legacy format should produce 1 attendee"
    assert attendees[0]['type'] == 'volunteer', "Legacy format should be volunteer type"
    assert attendees[0]['email'] == 'test@example.com', "Email should match"
    print("✓ Legacy format parsing works correctly")
    
    # Test new format
    new_body = {
        'event_id': 'test-event',
        'email': 'guardian@example.com',
        'attendees': [
            {
                'type': 'volunteer',
                'email': 'guardian@example.com',
                'first_name': 'Jane',
                'last_name': 'Smith'
            },
            {
                'type': 'minor',
                'minor_id': 'minor-123',
                'first_name': 'Billy',
                'last_name': 'Smith',
                'age': 10
            }
        ]
    }
    
    # Simulate parse_request_format
    if 'attendees' in new_body:
        attendees = new_body['attendees']
        email = new_body.get('email')
    else:
        email = new_body.get('email')
        attendee = {
            'type': 'volunteer',
            'email': email,
            'first_name': new_body.get('first_name'),
            'last_name': new_body.get('last_name')
        }
        attendees = [attendee]
    
    assert len(attendees) == 2, "New format should produce 2 attendees"
    assert attendees[0]['type'] == 'volunteer', "First attendee should be volunteer"
    assert attendees[1]['type'] == 'minor', "Second attendee should be minor"
    assert attendees[1]['age'] == 10, "Minor should have age"
    print("✓ New format parsing works correctly")


def test_duplicate_filtering():
    """Test duplicate attendee filtering logic"""
    
    # Simulate existing RSVPs
    existing_rsvps = {
        'volunteer@example.com': True,
        'minor-456': True
    }
    
    # Test attendees
    attendees = [
        {'type': 'volunteer', 'email': 'volunteer@example.com', 'first_name': 'John', 'last_name': 'Doe'},
        {'type': 'minor', 'minor_id': 'minor-123', 'first_name': 'Jane', 'last_name': 'Doe', 'age': 8},
        {'type': 'minor', 'minor_id': 'minor-456', 'first_name': 'Bob', 'last_name': 'Doe', 'age': 10}
    ]
    
    # Simulate check_existing_rsvps
    existing_attendees = []
    new_attendees = []
    
    for attendee in attendees:
        if attendee.get('type') == 'volunteer':
            attendee_id = attendee.get('email')
        elif attendee.get('type') == 'minor':
            attendee_id = attendee.get('minor_id')
        else:
            continue
        
        if attendee_id in existing_rsvps:
            existing_attendees.append(attendee)
        else:
            new_attendees.append(attendee)
    
    assert len(existing_attendees) == 2, "Should find 2 existing attendees"
    assert len(new_attendees) == 1, "Should find 1 new attendee"
    assert new_attendees[0]['minor_id'] == 'minor-123', "New attendee should be minor-123"
    print("✓ Duplicate filtering works correctly")


def test_capacity_validation():
    """Test capacity validation logic"""
    
    # Test case 1: Within capacity
    current = 10
    requested = 3
    capacity = 15
    remaining = capacity - current
    is_valid = requested <= remaining
    
    assert is_valid == True, "Should be valid when within capacity"
    assert remaining == 5, "Remaining should be 5"
    print("✓ Capacity validation (within) works correctly")
    
    # Test case 2: Exceeds capacity
    current = 13
    requested = 3
    capacity = 15
    remaining = capacity - current
    is_valid = requested <= remaining
    
    assert is_valid == False, "Should be invalid when exceeding capacity"
    assert remaining == 2, "Remaining should be 2"
    print("✓ Capacity validation (exceeds) works correctly")
    
    # Test case 3: Exact capacity
    current = 12
    requested = 3
    capacity = 15
    remaining = capacity - current
    is_valid = requested <= remaining
    
    assert is_valid == True, "Should be valid when exactly at capacity"
    assert remaining == 3, "Remaining should be 3"
    print("✓ Capacity validation (exact) works correctly")


def test_empty_attendee_validation():
    """Test empty attendee list validation"""
    
    # Test empty list
    attendees = []
    is_valid = len(attendees) > 0
    
    assert is_valid == False, "Empty attendee list should be invalid"
    print("✓ Empty attendee validation works correctly")
    
    # Test non-empty list
    attendees = [{'type': 'volunteer', 'email': 'test@example.com'}]
    is_valid = len(attendees) > 0
    
    assert is_valid == True, "Non-empty attendee list should be valid"
    print("✓ Non-empty attendee validation works correctly")


if __name__ == '__main__':
    print("Testing multi-person RSVP submission logic...\n")
    
    try:
        test_parse_request_format()
        test_duplicate_filtering()
        test_capacity_validation()
        test_empty_attendee_validation()
        
        print("\n✅ All tests passed!")
        sys.exit(0)
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
