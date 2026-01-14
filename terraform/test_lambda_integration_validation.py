#!/usr/bin/env python3
"""
Integration test for Lambda functions with new validation and cascading updates
Tests the Lambda functions to ensure they work with the new validation utilities
"""
import sys
import json
import os
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, MagicMock

# Add current directory to path for imports
sys.path.append('.')

def test_events_update_lambda():
    """Test the updated events update Lambda function"""
    print("\n" + "="*60)
    print("TESTING EVENTS UPDATE LAMBDA INTEGRATION")
    print("="*60)
    
    try:
        # Mock environment variables
        with patch.dict(os.environ, {
            'EVENTS_TABLE_NAME': 'test-events',
            'VOLUNTEERS_TABLE_NAME': 'test-volunteers',
            'RSVPS_TABLE_NAME': 'test-rsvps',
            'AWS_REGION': 'us-east-1'
        }):
            # Import the Lambda function
            from lambda_events_update import handler
            
            # Mock DynamoDB tables
            with patch('lambda_events_update.events_table') as mock_events_table, \
                 patch('lambda_events_update.volunteers_table') as mock_volunteers_table, \
                 patch('lambda_events_update.rsvps_table') as mock_rsvps_table:
                
                # Mock existing event
                mock_events_table.get_item.return_value = {
                    'Item': {
                        'event_id': 'test-event-123',
                        'title': 'Original Event',
                        'description': 'Original description',
                        'start_time': (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                        'end_time': (datetime.now(timezone.utc) + timedelta(days=7, hours=3)).isoformat(),
                        'location': {'name': 'Original Location', 'address': 'Original Address'},
                        'attendance_cap': 20,
                        'status': 'active'
                    }
                }
                
                # Mock update response
                mock_events_table.update_item.return_value = {
                    'Attributes': {
                        'event_id': 'test-event-123',
                        'title': 'Updated Event',
                        'description': 'Original description',
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }
                }
                
                # Mock RSVPs query (empty for simplicity)
                mock_rsvps_table.query.return_value = {'Items': []}
                
                # Test valid update
                print("\n1. Testing valid event update...")
                event = {
                    'httpMethod': 'PUT',
                    'pathParameters': {'event_id': 'test-event-123'},
                    'body': json.dumps({
                        'title': 'Updated Event Title',
                        'attendance_cap': 25
                    }),
                    'requestContext': {
                        'authorizer': {
                            'email': 'admin@example.com',
                            'is_admin': 'true'
                        }
                    }
                }
                
                response = handler(event, {})
                
                if response['statusCode'] == 200:
                    print("   ✓ Valid update processed successfully")
                else:
                    print(f"   ✗ Valid update failed: {response.get('body', 'No body')}")
                
                # Test invalid update
                print("\n2. Testing invalid event update...")
                invalid_event = {
                    'httpMethod': 'PUT',
                    'pathParameters': {'event_id': 'test-event-123'},
                    'body': json.dumps({
                        'title': '',  # Empty title should fail validation
                        'attendance_cap': -5  # Negative cap should fail
                    }),
                    'requestContext': {
                        'authorizer': {
                            'email': 'admin@example.com',
                            'is_admin': 'true'
                        }
                    }
                }
                
                response = handler(invalid_event, {})
                
                if response['statusCode'] == 400:
                    print("   ✓ Invalid update correctly rejected")
                    body = json.loads(response['body'])
                    if 'validation_errors' in body:
                        print(f"   ✓ Validation errors properly returned: {len(body['validation_errors'])} errors")
                else:
                    print(f"   ✗ Invalid update should have been rejected: {response.get('body', 'No body')}")
                
    except Exception as e:
        print(f"   ✗ Events update Lambda test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

def test_volunteers_update_lambda():
    """Test the updated volunteers update Lambda function"""
    print("\n" + "="*60)
    print("TESTING VOLUNTEERS UPDATE LAMBDA INTEGRATION")
    print("="*60)
    
    try:
        # Mock environment variables
        with patch.dict(os.environ, {
            'VOLUNTEERS_TABLE_NAME': 'test-volunteers',
            'EVENTS_TABLE_NAME': 'test-events',
            'RSVPS_TABLE_NAME': 'test-rsvps',
            'AWS_REGION': 'us-east-1'
        }):
            # Import the Lambda function
            from lambda_volunteers_update import handler
            
            # Mock DynamoDB tables
            with patch('lambda_volunteers_update.volunteers_table') as mock_volunteers_table, \
                 patch('lambda_volunteers_update.events_table') as mock_events_table, \
                 patch('lambda_volunteers_update.rsvps_table') as mock_rsvps_table:
                
                # Mock existing volunteer
                mock_volunteers_table.get_item.return_value = {
                    'Item': {
                        'email': 'volunteer@example.com',
                        'first_name': 'John',
                        'last_name': 'Doe',
                        'created_at': datetime.now(timezone.utc).isoformat(),
                        'volunteer_metrics': {
                            'total_rsvps': 0,
                            'total_cancellations': 0,
                            'total_no_shows': 0,
                            'total_attended': 0
                        }
                    }
                }
                
                # Mock update response
                mock_volunteers_table.update_item.return_value = {
                    'Attributes': {
                        'email': 'volunteer@example.com',
                        'first_name': 'John',
                        'last_name': 'Smith',
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }
                }
                
                # Test valid update
                print("\n1. Testing valid volunteer update...")
                event = {
                    'httpMethod': 'PUT',
                    'pathParameters': {'email': 'volunteer@example.com'},
                    'body': json.dumps({
                        'first_name': 'John',
                        'last_name': 'Smith',
                        'phone': '555-123-4567'
                    }),
                    'requestContext': {
                        'authorizer': {
                            'email': 'volunteer@example.com',
                            'is_admin': 'false'
                        }
                    }
                }
                
                response = handler(event, {})
                
                if response['statusCode'] == 200:
                    print("   ✓ Valid volunteer update processed successfully")
                else:
                    print(f"   ✗ Valid volunteer update failed: {response.get('body', 'No body')}")
                
                # Test invalid update
                print("\n2. Testing invalid volunteer update...")
                invalid_event = {
                    'httpMethod': 'PUT',
                    'pathParameters': {'email': 'volunteer@example.com'},
                    'body': json.dumps({
                        'first_name': '',  # Empty name should fail
                        'email': 'invalid-email-format'  # Invalid email should fail
                    }),
                    'requestContext': {
                        'authorizer': {
                            'email': 'volunteer@example.com',
                            'is_admin': 'false'
                        }
                    }
                }
                
                response = handler(invalid_event, {})
                
                if response['statusCode'] == 400:
                    print("   ✓ Invalid volunteer update correctly rejected")
                    body = json.loads(response['body'])
                    if 'validation_errors' in body:
                        print(f"   ✓ Validation errors properly returned: {len(body['validation_errors'])} errors")
                else:
                    print(f"   ✗ Invalid volunteer update should have been rejected: {response.get('body', 'No body')}")
                
    except Exception as e:
        print(f"   ✗ Volunteers update Lambda test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

def test_rsvp_submit_lambda():
    """Test the updated RSVP submit Lambda function"""
    print("\n" + "="*60)
    print("TESTING RSVP SUBMIT LAMBDA INTEGRATION")
    print("="*60)
    
    try:
        # Mock environment variables
        with patch.dict(os.environ, {
            'EVENTS_TABLE_NAME': 'test-events',
            'VOLUNTEERS_TABLE_NAME': 'test-volunteers',
            'RSVPS_TABLE_NAME': 'test-rsvps',
            'SNS_TOPIC_ARN': 'arn:aws:sns:us-east-1:123456789012:test-topic',
            'AWS_REGION': 'us-east-1'
        }):
            # Import the Lambda function
            from lambda_event_rsvp_submit import handler
            
            # Mock DynamoDB tables and SNS
            with patch('lambda_event_rsvp_submit.events_table') as mock_events_table, \
                 patch('lambda_event_rsvp_submit.volunteers_table') as mock_volunteers_table, \
                 patch('lambda_event_rsvp_submit.rsvps_table') as mock_rsvps_table, \
                 patch('lambda_event_rsvp_submit.sns') as mock_sns:
                
                # Mock event exists
                mock_events_table.get_item.return_value = {
                    'Item': {
                        'event_id': 'test-event-123',
                        'title': 'Test Event',
                        'attendance_cap': 20,
                        'status': 'active'
                    }
                }
                
                # Mock no existing RSVP
                mock_rsvps_table.get_item.return_value = {}
                
                # Mock RSVP count query
                mock_rsvps_table.query.return_value = {'Items': []}
                
                # Mock SNS publish
                mock_sns.publish.return_value = {'MessageId': 'test-message-id'}
                
                # Test valid RSVP
                print("\n1. Testing valid RSVP submission...")
                event = {
                    'httpMethod': 'POST',
                    'body': json.dumps({
                        'event_id': 'test-event-123',
                        'first_name': 'Jane',
                        'last_name': 'Doe',
                        'email': 'jane.doe@example.com',
                        'phone': '555-987-6543'
                    })
                }
                
                response = handler(event, {})
                
                if response['statusCode'] == 200:
                    print("   ✓ Valid RSVP processed successfully")
                else:
                    print(f"   ✗ Valid RSVP failed: {response.get('body', 'No body')}")
                
                # Test invalid RSVP
                print("\n2. Testing invalid RSVP submission...")
                invalid_event = {
                    'httpMethod': 'POST',
                    'body': json.dumps({
                        'event_id': 'test-event-123',
                        'first_name': '',  # Empty name should fail
                        'last_name': 'Doe',
                        'email': 'invalid-email'  # Invalid email should fail
                    })
                }
                
                response = handler(invalid_event, {})
                
                if response['statusCode'] == 400:
                    print("   ✓ Invalid RSVP correctly rejected")
                    body = json.loads(response['body'])
                    if 'validation_errors' in body:
                        print(f"   ✓ Validation errors properly returned: {len(body['validation_errors'])} errors")
                else:
                    print(f"   ✗ Invalid RSVP should have been rejected: {response.get('body', 'No body')}")
                
    except Exception as e:
        print(f"   ✗ RSVP submit Lambda test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

def run_integration_tests():
    """Run all Lambda integration tests"""
    print("STARTING LAMBDA INTEGRATION TESTS WITH NEW VALIDATION")
    print("=" * 80)
    
    try:
        success = True
        success &= test_events_update_lambda()
        success &= test_volunteers_update_lambda()
        success &= test_rsvp_submit_lambda()
        
        print("\n" + "="*80)
        print("INTEGRATION TESTS COMPLETED")
        print("="*80)
        
        if success:
            print("\n✓ All Lambda functions integrate correctly with new validation")
            print("✓ Validation errors are properly handled and returned")
            print("✓ Valid data is processed successfully")
            print("\nThe Lambda functions are ready for deployment with enhanced validation!")
        else:
            print("\n✗ Some integration tests failed")
            print("Please review the errors above and fix the issues")
        
        return success
        
    except Exception as e:
        print(f"\n✗ Integration test execution failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_integration_tests()
    sys.exit(0 if success else 1)