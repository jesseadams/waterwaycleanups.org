#!/usr/bin/env python3
"""
Unit tests for event lifecycle management Lambda function
"""

import json
import unittest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone, timedelta
import sys
import os

# Add the terraform directory to the path to import the Lambda function
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Mock the boto3 imports before importing the Lambda function
sys.modules['boto3'] = Mock()
sys.modules['boto3.dynamodb'] = Mock()
sys.modules['boto3.dynamodb.conditions'] = Mock()

# Import the Lambda function after mocking
import lambda_events_lifecycle

class TestEventLifecycleManagement(unittest.TestCase):
    
    def setUp(self):
        """Set up test fixtures"""
        self.mock_dynamodb = Mock()
        self.mock_sns = Mock()
        self.mock_events_table = Mock()
        self.mock_rsvps_table = Mock()
        self.mock_volunteers_table = Mock()
        
        # Mock environment variables
        os.environ['EVENTS_TABLE_NAME'] = 'test-events-table'
        os.environ['RSVPS_TABLE_NAME'] = 'test-rsvps-table'
        os.environ['VOLUNTEERS_TABLE_NAME'] = 'test-volunteers-table'
        os.environ['SNS_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:123456789012:test-topic'
        
        # Patch the AWS clients
        lambda_events_lifecycle.events_table = self.mock_events_table
        lambda_events_lifecycle.rsvps_table = self.mock_rsvps_table
        lambda_events_lifecycle.volunteers_table = self.mock_volunteers_table
        lambda_events_lifecycle.sns = self.mock_sns
    
    def test_update_completed_events_success(self):
        """Test successful update of completed events"""
        # Mock current time
        current_time = datetime.now(timezone.utc).isoformat()
        past_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        
        # Mock active events query response
        mock_events = [
            {
                'event_id': 'test-event-1',
                'title': 'Test Event 1',
                'end_time': past_time,  # Event has ended
                'status': 'active'
            },
            {
                'event_id': 'test-event-2', 
                'title': 'Test Event 2',
                'end_time': (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),  # Event still active
                'status': 'active'
            }
        ]
        
        self.mock_events_table.query.return_value = {'Items': mock_events}
        self.mock_events_table.update_item.return_value = {}
        
        # Create test event
        test_event = {
            'httpMethod': 'POST',
            'body': json.dumps({'action': 'update_completed_events'})
        }
        
        # Call the handler
        result = lambda_events_lifecycle.handler(test_event, {})
        
        # Verify response
        self.assertEqual(result['statusCode'], 200)
        response_body = json.loads(result['body'])
        self.assertTrue(response_body['success'])
        self.assertIn('test-event-1', response_body['updated_events'])
        self.assertNotIn('test-event-2', response_body['updated_events'])
        
        # Verify update_item was called for the completed event
        self.mock_events_table.update_item.assert_called_once()
    
    def test_cancel_event_success(self):
        """Test successful event cancellation"""
        # Mock event data
        mock_event = {
            'event_id': 'test-event-cancel',
            'title': 'Test Cancellation Event',
            'start_time': (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            'location': {'name': 'Test Location'}
        }
        
        # Mock RSVPs for the event
        mock_rsvps = [
            {
                'event_id': 'test-event-cancel',
                'email': 'volunteer1@test.com',
                'status': 'active'
            },
            {
                'event_id': 'test-event-cancel', 
                'email': 'volunteer2@test.com',
                'status': 'active'
            }
        ]
        
        self.mock_events_table.get_item.return_value = {'Item': mock_event}
        self.mock_events_table.update_item.return_value = {}
        self.mock_rsvps_table.query.return_value = {'Items': mock_rsvps}
        self.mock_rsvps_table.update_item.return_value = {}
        self.mock_sns.publish.return_value = {'MessageId': 'test-message-id'}
        
        # Create test event
        test_event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                'action': 'cancel_event',
                'event_id': 'test-event-cancel',
                'reason': 'Test cancellation',
                'notify_volunteers': True
            })
        }
        
        # Call the handler
        result = lambda_events_lifecycle.handler(test_event, {})
        
        # Verify response
        self.assertEqual(result['statusCode'], 200)
        response_body = json.loads(result['body'])
        self.assertTrue(response_body['success'])
        self.assertEqual(response_body['event_id'], 'test-event-cancel')
        self.assertEqual(response_body['notification_count'], 2)
        
        # Verify event was updated to cancelled
        event_update_calls = self.mock_events_table.update_item.call_args_list
        self.assertTrue(any('cancelled' in str(call) for call in event_update_calls))
        
        # Verify RSVPs were updated
        self.assertEqual(self.mock_rsvps_table.update_item.call_count, 2)
        
        # Verify SNS notifications were sent
        self.assertEqual(self.mock_sns.publish.call_count, 2)
    
    def test_categorize_events_success(self):
        """Test successful event categorization"""
        current_time = datetime.now(timezone.utc)
        
        # Mock events with different time ranges
        mock_events = [
            {
                'event_id': 'future-event',
                'title': 'Future Event',
                'start_time': (current_time + timedelta(days=1)).isoformat(),
                'end_time': (current_time + timedelta(days=1, hours=4)).isoformat()
            },
            {
                'event_id': 'past-event',
                'title': 'Past Event', 
                'start_time': (current_time - timedelta(days=1)).isoformat(),
                'end_time': (current_time - timedelta(hours=20)).isoformat()
            },
            {
                'event_id': 'current-event',
                'title': 'Current Event',
                'start_time': (current_time - timedelta(hours=1)).isoformat(),
                'end_time': (current_time + timedelta(hours=1)).isoformat()
            }
        ]
        
        self.mock_events_table.query.return_value = {'Items': mock_events}
        
        # Create test event
        test_event = {
            'httpMethod': 'POST',
            'body': json.dumps({'action': 'categorize_events'})
        }
        
        # Call the handler
        result = lambda_events_lifecycle.handler(test_event, {})
        
        # Verify response
        self.assertEqual(result['statusCode'], 200)
        response_body = json.loads(result['body'])
        self.assertTrue(response_body['success'])
        
        categories = response_body['categories']
        summary = response_body['summary']
        
        # Verify categorization
        self.assertEqual(summary['upcoming_count'], 1)
        self.assertEqual(summary['past_count'], 1)
        self.assertEqual(summary['current_count'], 1)
        
        # Verify specific events are in correct categories
        upcoming_ids = [event['event_id'] for event in categories['upcoming']]
        past_ids = [event['event_id'] for event in categories['past']]
        current_ids = [event['event_id'] for event in categories['current']]
        
        self.assertIn('future-event', upcoming_ids)
        self.assertIn('past-event', past_ids)
        self.assertIn('current-event', current_ids)
    
    def test_invalid_action(self):
        """Test handling of invalid action"""
        test_event = {
            'httpMethod': 'POST',
            'body': json.dumps({'action': 'invalid_action'})
        }
        
        result = lambda_events_lifecycle.handler(test_event, {})
        
        self.assertEqual(result['statusCode'], 400)
        response_body = json.loads(result['body'])
        self.assertIn('Invalid action', response_body['error'])
    
    def test_options_request(self):
        """Test CORS preflight OPTIONS request"""
        test_event = {
            'httpMethod': 'OPTIONS'
        }
        
        result = lambda_events_lifecycle.handler(test_event, {})
        
        self.assertEqual(result['statusCode'], 200)
        self.assertIn('Access-Control-Allow-Origin', result['headers'])
        self.assertEqual(result['headers']['Access-Control-Allow-Origin'], '*')

if __name__ == '__main__':
    print("Running Event Lifecycle Management Unit Tests")
    print("=" * 50)
    
    # Run the tests
    unittest.main(verbosity=2)