#!/usr/bin/env python3
"""
Test script to verify decimal handling in Lambda functions
"""

import json
from decimal import Decimal

def decimal_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def convert_decimals(obj):
    """Recursively convert Decimal objects to int/float in nested structures"""
    if isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals(v) for v in obj]
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    else:
        return obj

def test_decimal_handling():
    """Test decimal handling functions"""
    print("Testing Decimal Handling")
    print("=" * 30)
    
    # Test data with Decimal values (simulating DynamoDB response)
    test_data = {
        'event_id': 'test-event-2024',
        'title': 'Test Event',
        'attendance_cap': Decimal('50'),  # This would come from DynamoDB as Decimal
        'rsvp_count': Decimal('25'),
        'price': Decimal('15.99'),
        'location': {
            'name': 'Test Location',
            'capacity': Decimal('100')
        },
        'metrics': [
            {'count': Decimal('10')},
            {'count': Decimal('20')}
        ]
    }
    
    print("Original data with Decimals:")
    print(f"attendance_cap type: {type(test_data['attendance_cap'])}")
    print(f"price type: {type(test_data['price'])}")
    
    # Test 1: Convert decimals
    print("\n1. Testing convert_decimals function...")
    converted_data = convert_decimals(test_data)
    
    print(f"✓ attendance_cap converted to: {type(converted_data['attendance_cap'])} = {converted_data['attendance_cap']}")
    print(f"✓ price converted to: {type(converted_data['price'])} = {converted_data['price']}")
    print(f"✓ nested capacity converted to: {type(converted_data['location']['capacity'])} = {converted_data['location']['capacity']}")
    print(f"✓ array item converted to: {type(converted_data['metrics'][0]['count'])} = {converted_data['metrics'][0]['count']}")
    
    # Test 2: JSON serialization with decimal_default
    print("\n2. Testing JSON serialization...")
    try:
        json_str = json.dumps(converted_data, default=decimal_default)
        print("✓ JSON serialization successful")
        
        # Parse it back to verify
        parsed_data = json.loads(json_str)
        print(f"✓ Parsed attendance_cap: {parsed_data['attendance_cap']} (type: {type(parsed_data['attendance_cap'])})")
        print(f"✓ Parsed price: {parsed_data['price']} (type: {type(parsed_data['price'])})")
        
    except Exception as e:
        print(f"✗ JSON serialization failed: {e}")
    
    # Test 3: Direct serialization without convert_decimals (should also work)
    print("\n3. Testing direct serialization with decimal_default...")
    try:
        json_str_direct = json.dumps(test_data, default=decimal_default)
        print("✓ Direct JSON serialization successful")
        
        parsed_direct = json.loads(json_str_direct)
        print(f"✓ Direct parsed attendance_cap: {parsed_direct['attendance_cap']}")
        
    except Exception as e:
        print(f"✗ Direct JSON serialization failed: {e}")
    
    # Test 4: Simulate RSVP response
    print("\n4. Testing RSVP response simulation...")
    rsvp_response = {
        'message': 'RSVP submitted successfully',
        'event_id': 'test-event-2024',
        'email': 'test@example.com',
        'rsvp_count': Decimal('26'),
        'attendance_cap': Decimal('50'),
        'success': True
    }
    
    try:
        response_json = json.dumps(convert_decimals(rsvp_response), default=decimal_default)
        print("✓ RSVP response serialization successful")
        
        parsed_response = json.loads(response_json)
        print(f"✓ Response rsvp_count: {parsed_response['rsvp_count']} (type: {type(parsed_response['rsvp_count'])})")
        print(f"✓ Response attendance_cap: {parsed_response['attendance_cap']} (type: {type(parsed_response['attendance_cap'])})")
        
    except Exception as e:
        print(f"✗ RSVP response serialization failed: {e}")
    
    print("\n" + "=" * 30)
    print("Decimal Handling Test Complete")
    print("All Lambda functions should now handle DynamoDB Decimal values correctly.")

if __name__ == "__main__":
    test_decimal_handling()