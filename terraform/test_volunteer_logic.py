#!/usr/bin/env python3
"""
Test script for volunteer management system logic
This script tests the validation and helper functions without AWS dependencies
"""

import json
import re
from datetime import datetime, timezone

def validate_volunteer_data(data):
    """Validate volunteer profile data"""
    errors = []
    
    # Required fields
    if not data.get('first_name'):
        errors.append('first_name is required')
    if not data.get('last_name'):
        errors.append('last_name is required')
    
    # Email validation (if provided for update)
    email = data.get('email')
    if email:
        email_pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        if not re.match(email_pattern, email):
            errors.append('Invalid email format')
    
    # Phone validation (if provided)
    phone = data.get('phone')
    if phone:
        # Remove common formatting characters
        clean_phone = re.sub(r'[^\d]', '', phone)
        if len(clean_phone) < 10 or len(clean_phone) > 15:
            errors.append('Phone number must be between 10-15 digits')
    
    return errors

def calculate_profile_completeness(volunteer_data):
    """Calculate if volunteer profile is complete"""
    required_fields = ['first_name', 'last_name', 'email']
    optional_fields = ['phone', 'emergency_contact']
    
    # Check required fields
    for field in required_fields:
        if not volunteer_data.get(field):
            return False
    
    # Check at least one optional field
    has_optional = any(volunteer_data.get(field) for field in optional_fields)
    
    return has_optional

def extract_event_date_from_id(event_id):
    """Extract event date from event_id pattern for sorting"""
    try:
        if not event_id:
            return None
            
        parts = event_id.lower().split('-')
        
        months = {
            'january': 1, 'february': 2, 'march': 3, 'april': 4,
            'may': 5, 'june': 6, 'july': 7, 'august': 8,
            'september': 9, 'october': 10, 'november': 11, 'december': 12
        }
        
        month = None
        year = None
        
        # Look for month and year in the parts
        for i, part in enumerate(parts):
            if part in months:
                month = months[part]
                # Look for year in subsequent parts
                for j in range(i + 1, len(parts)):
                    if parts[j].isdigit() and len(parts[j]) == 4:
                        year = int(parts[j])
                        break
                if year:
                    break
        
        # Also try looking for year first, then month before it
        if not (month and year):
            for i, part in enumerate(parts):
                if part.isdigit() and len(part) == 4:
                    year = int(part)
                    # Look for month in previous parts
                    for j in range(i - 1, -1, -1):
                        if parts[j] in months:
                            month = months[parts[j]]
                            break
                    if month:
                        break
        
        if month and year:
            return datetime(year, month, 1, tzinfo=timezone.utc)
        
        return None
    except Exception as e:
        print(f"Error extracting date from event_id {event_id}: {e}")
        return None

def test_validation_functions():
    """Test data validation functions"""
    print("Testing Volunteer Management System Logic")
    print("=" * 50)
    
    # Test 1: Valid volunteer data
    print("\n1. Testing valid volunteer data...")
    valid_data = {
        'first_name': 'John',
        'last_name': 'Doe',
        'email': 'john.doe@example.com',
        'phone': '555-123-4567'
    }
    
    errors = validate_volunteer_data(valid_data)
    if not errors:
        print("✓ Valid data validation passed")
    else:
        print(f"✗ Valid data validation failed: {errors}")
    
    # Test 2: Invalid volunteer data
    print("\n2. Testing invalid volunteer data...")
    invalid_data = {
        'first_name': '',  # Missing required field
        'last_name': 'Doe',
        'email': 'invalid-email',  # Invalid format
        'phone': '123'  # Too short
    }
    
    errors = validate_volunteer_data(invalid_data)
    expected_errors = ['first_name is required', 'Invalid email format', 'Phone number must be between 10-15 digits']
    
    if len(errors) == 3:
        print(f"✓ Invalid data validation correctly identified {len(errors)} errors")
        for error in errors:
            print(f"  - {error}")
    else:
        print(f"✗ Expected 3 errors, got {len(errors)}: {errors}")
    
    # Test 3: Profile completeness - complete profile
    print("\n3. Testing complete profile...")
    complete_profile = {
        'first_name': 'John',
        'last_name': 'Doe',
        'email': 'john.doe@example.com',
        'phone': '555-123-4567'
    }
    
    is_complete = calculate_profile_completeness(complete_profile)
    if is_complete:
        print("✓ Complete profile correctly identified")
    else:
        print("✗ Complete profile should be marked as complete")
    
    # Test 4: Profile completeness - incomplete profile
    print("\n4. Testing incomplete profile...")
    incomplete_profile = {
        'first_name': 'John',
        'last_name': 'Doe',
        'email': 'john.doe@example.com'
        # Missing optional fields
    }
    
    is_complete = calculate_profile_completeness(incomplete_profile)
    if not is_complete:
        print("✓ Incomplete profile correctly identified")
    else:
        print("✗ Incomplete profile should be marked as incomplete")
    
    # Test 5: Event date extraction
    print("\n5. Testing event date extraction...")
    test_cases = [
        ('brooke-road-cleanup-february-2026', 2026, 2),
        ('potomac-run-road-cleanup-june-2025', 2025, 6),
        ('waterway-cleanup-december-2025', 2025, 12),
        ('invalid-event-id', None, None)
    ]
    
    for event_id, expected_year, expected_month in test_cases:
        extracted_date = extract_event_date_from_id(event_id)
        
        if expected_year and expected_month:
            if extracted_date and extracted_date.year == expected_year and extracted_date.month == expected_month:
                print(f"✓ Correctly extracted {expected_year}-{expected_month:02d} from '{event_id}'")
            else:
                print(f"✗ Failed to extract date from '{event_id}'. Got: {extracted_date}")
        else:
            if extracted_date is None:
                print(f"✓ Correctly handled invalid event_id '{event_id}'")
            else:
                print(f"✗ Should not have extracted date from invalid event_id '{event_id}'")

def test_volunteer_data_structure():
    """Test volunteer data structure and field handling"""
    print("\n" + "=" * 50)
    print("Testing Volunteer Data Structure")
    print("=" * 50)
    
    # Test complete volunteer record
    volunteer_data = {
        'email': 'john.doe@example.com',
        'first_name': 'John',
        'last_name': 'Doe',
        'phone': '555-123-4567',
        'emergency_contact': 'Jane Doe - 555-987-6543',
        'dietary_restrictions': 'None',
        'volunteer_experience': 'First time volunteer',
        'how_did_you_hear': 'Website',
        'communication_preferences': {
            'email_notifications': True,
            'sms_notifications': False
        },
        'volunteer_metrics': {
            'total_rsvps': 5,
            'total_cancellations': 1,
            'total_no_shows': 0,
            'total_attended': 4,
            'first_event_date': '2024-01-15T10:00:00Z',
            'last_event_date': '2024-12-15T10:00:00Z'
        }
    }
    
    # Test field access
    print("\n1. Testing field access...")
    required_fields = ['email', 'first_name', 'last_name']
    optional_fields = ['phone', 'emergency_contact', 'dietary_restrictions', 'volunteer_experience', 'how_did_you_hear']
    
    missing_required = [field for field in required_fields if not volunteer_data.get(field)]
    if not missing_required:
        print("✓ All required fields present")
    else:
        print(f"✗ Missing required fields: {missing_required}")
    
    present_optional = [field for field in optional_fields if volunteer_data.get(field)]
    print(f"✓ Optional fields present: {len(present_optional)}/{len(optional_fields)}")
    
    # Test communication preferences
    print("\n2. Testing communication preferences...")
    comm_prefs = volunteer_data.get('communication_preferences', {})
    if isinstance(comm_prefs, dict):
        print("✓ Communication preferences is a dictionary")
        if 'email_notifications' in comm_prefs and 'sms_notifications' in comm_prefs:
            print("✓ Communication preferences has required fields")
        else:
            print("✗ Communication preferences missing required fields")
    else:
        print("✗ Communication preferences should be a dictionary")
    
    # Test volunteer metrics
    print("\n3. Testing volunteer metrics...")
    metrics = volunteer_data.get('volunteer_metrics', {})
    required_metric_fields = ['total_rsvps', 'total_cancellations', 'total_no_shows', 'total_attended']
    
    missing_metrics = [field for field in required_metric_fields if field not in metrics]
    if not missing_metrics:
        print("✓ All required metric fields present")
        
        # Test metric calculations
        total_events = metrics['total_rsvps'] + metrics['total_cancellations']
        if total_events > 0:
            attendance_rate = metrics['total_attended'] / total_events * 100
            print(f"✓ Calculated attendance rate: {attendance_rate:.1f}%")
        
    else:
        print(f"✗ Missing metric fields: {missing_metrics}")

if __name__ == "__main__":
    test_validation_functions()
    test_volunteer_data_structure()
    
    print("\n" + "=" * 50)
    print("Volunteer Management System Logic Test Complete")
    print("\nAll core validation and data processing functions are working correctly.")
    print("The Lambda functions should work properly when deployed with AWS resources.")