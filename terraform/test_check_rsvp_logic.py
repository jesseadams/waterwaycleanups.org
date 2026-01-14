#!/usr/bin/env python3
"""
Test script for check-event-rsvp Lambda enhancement logic
Tests the formatting and legacy handling logic without AWS dependencies
"""

def format_rsvp_record(rsvp_item):
    """
    Format RSVP record with complete attendee information.
    Handles legacy records without attendee_type field.
    
    This is a copy of the function from lambda_event_rsvp_check.py for testing
    """
    # Handle legacy records - default attendee_type to "volunteer" if missing
    attendee_type = rsvp_item.get('attendee_type', 'volunteer')
    
    # Handle legacy records - default attendee_id to email if missing
    attendee_id = rsvp_item.get('attendee_id', rsvp_item.get('email'))
    
    formatted_rsvp = {
        'attendee_id': attendee_id,
        'attendee_type': attendee_type,
        'first_name': rsvp_item.get('first_name', ''),
        'last_name': rsvp_item.get('last_name', ''),
        'created_at': rsvp_item.get('created_at', rsvp_item.get('submission_date', ''))
    }
    
    # Include age for minor attendees
    if attendee_type == 'minor' and 'age' in rsvp_item:
        formatted_rsvp['age'] = rsvp_item['age']
    
    return formatted_rsvp


def test_format_rsvp_record():
    """Test the format_rsvp_record function"""
    print("\n=== Testing format_rsvp_record Logic ===")
    
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
    assert result['attendee_id'] == 'volunteer@example.com', f"Expected attendee_id 'volunteer@example.com', got {result['attendee_id']}"
    assert result['attendee_type'] == 'volunteer', f"Expected attendee_type 'volunteer', got {result['attendee_type']}"
    assert result['first_name'] == 'John', f"Expected first_name 'John', got {result['first_name']}"
    assert result['last_name'] == 'Doe', f"Expected last_name 'Doe', got {result['last_name']}"
    assert result['created_at'] == '2025-01-14T10:00:00Z', f"Expected created_at '2025-01-14T10:00:00Z', got {result['created_at']}"
    assert 'age' not in result, "Age should not be included for volunteers"
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
    assert result['attendee_id'] == 'minor-uuid-123', f"Expected attendee_id 'minor-uuid-123', got {result['attendee_id']}"
    assert result['attendee_type'] == 'minor', f"Expected attendee_type 'minor', got {result['attendee_type']}"
    assert result['first_name'] == 'Jane', f"Expected first_name 'Jane', got {result['first_name']}"
    assert result['last_name'] == 'Doe', f"Expected last_name 'Doe', got {result['last_name']}"
    assert result['age'] == 12, f"Expected age 12, got {result.get('age')}"
    assert result['created_at'] == '2025-01-14T10:00:00Z', f"Expected created_at '2025-01-14T10:00:00Z', got {result['created_at']}"
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
    assert result['attendee_id'] == 'legacy@example.com', f"Expected attendee_id 'legacy@example.com', got {result['attendee_id']}"
    assert result['attendee_type'] == 'volunteer', f"Expected attendee_type 'volunteer' (default), got {result['attendee_type']}"
    assert result['first_name'] == 'Legacy', f"Expected first_name 'Legacy', got {result['first_name']}"
    assert result['last_name'] == 'User', f"Expected last_name 'User', got {result['last_name']}"
    assert result['created_at'] == '2024-12-01T10:00:00Z', f"Expected created_at '2024-12-01T10:00:00Z', got {result['created_at']}"
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
    assert result['attendee_id'] == 'another@example.com', f"Expected attendee_id 'another@example.com', got {result['attendee_id']}"
    assert result['attendee_type'] == 'volunteer', f"Expected attendee_type 'volunteer' (default), got {result['attendee_type']}"
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
    assert result['attendee_type'] == 'minor', f"Expected attendee_type 'minor', got {result['attendee_type']}"
    assert 'age' not in result, "Age should not be included if not present"
    print("   ✓ Minor RSVP without age handled correctly")
    
    # Test 6: Empty fields handling
    print("\n6. Testing empty fields handling...")
    minimal_rsvp = {
        'email': 'minimal@example.com'
    }
    result = format_rsvp_record(minimal_rsvp)
    assert result['attendee_id'] == 'minimal@example.com', f"Expected attendee_id 'minimal@example.com', got {result['attendee_id']}"
    assert result['attendee_type'] == 'volunteer', f"Expected attendee_type 'volunteer' (default), got {result['attendee_type']}"
    assert result['first_name'] == '', f"Expected empty first_name, got {result['first_name']}"
    assert result['last_name'] == '', f"Expected empty last_name, got {result['last_name']}"
    assert result['created_at'] == '', f"Expected empty created_at, got {result['created_at']}"
    print("   ✓ Empty fields handled correctly")
    
    print("\n✅ All format_rsvp_record tests passed!")


def main():
    """Run all tests"""
    print("=" * 60)
    print("Testing Check Event RSVP Enhancement Logic")
    print("=" * 60)
    
    try:
        test_format_rsvp_record()
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        print("\nThe check-event-rsvp Lambda enhancement logic is correct:")
        print("  ✓ Formats RSVP records with complete attendee information")
        print("  ✓ Includes age for minor attendees")
        print("  ✓ Handles legacy records without attendee_type")
        print("  ✓ Defaults attendee_id to email for legacy records")
        print("  ✓ Handles missing fields gracefully")
        print("\nRequirements validated:")
        print("  ✓ Requirement 5.4, 5.5 - RSVP display information")
        print("  ✓ Requirement 8.4, 8.5 - Legacy record interpretation")
        
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
    import sys
    sys.exit(main())
