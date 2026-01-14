#!/usr/bin/env python3
"""
Unit tests for export and analytics Lambda functions
"""

import unittest
import json
import os
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal
from datetime import datetime, timezone

# Mock AWS services before importing Lambda functions
with patch('boto3.resource'):
    import lambda_events_export
    import lambda_analytics
    import lambda_volunteer_metrics

class TestEventsExport(unittest.TestCase):
    """Test cases for events export functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.mock_events_table = Mock()
        self.mock_rsvps_table = Mock()
        
        # Patch the tables in the module
        lambda_events_export.events_table = self.mock_events_table
        lambda_events_export.rsvps_table = self.mock_rsvps_table
    
    def test_convert_decimals(self):
        """Test decimal conversion utility"""
        test_data = {
            'number': Decimal('42'),
            'float_num': Decimal('3.14'),
            'nested': {
                'decimal': Decimal('100'),
                'list': [Decimal('1'), Decimal('2.5')]
            }
        }
        
        result = lambda_events_export.convert_decimals(test_data)
        
        self.assertEqual(result['number'], 42)
        self.assertEqual(result['float_num'], 3.14)
        self.assertEqual(result['nested']['decimal'], 100)
        self.assertEqual(result['nested']['list'], [1, 2.5])
    
    def test_flatten_event_data(self):
        """Test event data flattening for CSV export"""
        event_data = {
            'event_id': 'test-event-1',
            'title': 'Test Event',
            'start_time': '2024-01-15T10:00:00Z',
            'location': {
                'name': 'Test Park',
                'address': '123 Test St',
                'coordinates': {'lat': 40.7128, 'lng': -74.0060}
            },
            'hugo_config': {
                'tags': ['cleanup', 'park'],
                'preheader_is_light': True
            },
            'rsvp_stats': {
                'total_rsvps': 25,
                'active_rsvps': 20,
                'cancelled_rsvps': 5
            }
        }
        
        flattened = lambda_events_export.flatten_event_data(event_data)
        
        self.assertEqual(flattened['event_id'], 'test-event-1')
        self.assertEqual(flattened['location_name'], 'Test Park')
        self.assertEqual(flattened['location_lat'], 40.7128)
        self.assertEqual(flattened['hugo_tags'], 'cleanup, park')
        self.assertEqual(flattened['total_rsvps'], 25)
    
    def test_export_json_format(self):
        """Test JSON export functionality"""
        # Mock event data
        mock_events = [
            {
                'event_id': 'event-1',
                'title': 'Event 1',
                'start_time': '2024-01-15T10:00:00Z'
            }
        ]
        
        self.mock_events_table.scan.return_value = {
            'Items': mock_events,
            'LastEvaluatedKey': None
        }
        
        # Test event
        test_event = {
            'httpMethod': 'GET',
            'queryStringParameters': {
                'format': 'json',
                'include_rsvp_stats': 'false'
            }
        }
        
        result = lambda_events_export.handler(test_event, {})
        
        self.assertEqual(result['statusCode'], 200)
        response_body = json.loads(result['body'])
        self.assertTrue(response_body['success'])
        self.assertEqual(len(response_body['events']), 1)
        self.assertEqual(response_body['events'][0]['event_id'], 'event-1')

class TestAnalytics(unittest.TestCase):
    """Test cases for analytics functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.mock_events_table = Mock()
        self.mock_rsvps_table = Mock()
        self.mock_volunteers_table = Mock()
        
        # Patch the tables in the module
        lambda_analytics.events_table = self.mock_events_table
        lambda_analytics.rsvps_table = self.mock_rsvps_table
        lambda_analytics.volunteers_table = self.mock_volunteers_table
    
    def test_calculate_attendance_rates(self):
        """Test attendance rate calculation"""
        # Mock completed events
        mock_events = [
            {
                'event_id': 'event-1',
                'title': 'Completed Event',
                'start_time': '2024-01-15T10:00:00Z',
                'status': 'completed'
            }
        ]
        
        # Mock RSVPs for the event
        mock_rsvps = [
            {'event_id': 'event-1', 'status': 'attended'},
            {'event_id': 'event-1', 'status': 'attended'},
            {'event_id': 'event-1', 'status': 'no_show'},
            {'event_id': 'event-1', 'status': 'active'}  # Should not count in attendance rate
        ]
        
        self.mock_events_table.scan.return_value = {
            'Items': mock_events,
            'LastEvaluatedKey': None
        }
        
        self.mock_rsvps_table.query.return_value = {
            'Items': mock_rsvps
        }
        
        result = lambda_analytics.calculate_attendance_rates()
        
        # Attendance rate should be 2 attended / (2 attended + 1 no_show) = 66.67%
        self.assertEqual(result['overall_stats']['total_attended'], 2)
        self.assertEqual(result['overall_stats']['total_no_shows'], 1)
        self.assertAlmostEqual(result['overall_stats']['overall_attendance_rate'], 66.67, places=1)
    
    def test_calculate_cancellation_rates(self):
        """Test cancellation rate calculation"""
        # Mock RSVPs with various statuses
        mock_rsvps = [
            {'event_id': 'event-1', 'status': 'active', 'created_at': '2024-01-15T10:00:00Z'},
            {'event_id': 'event-1', 'status': 'cancelled', 'created_at': '2024-01-15T11:00:00Z', 'hours_before_event': 48},  # within_week
            {'event_id': 'event-1', 'status': 'cancelled', 'created_at': '2024-01-15T12:00:00Z', 'hours_before_event': 0.5},  # same_day
            {'event_id': 'event-2', 'status': 'active', 'created_at': '2024-01-16T10:00:00Z'}
        ]
        
        self.mock_rsvps_table.scan.return_value = {
            'Items': mock_rsvps,
            'LastEvaluatedKey': None
        }
        
        result = lambda_analytics.calculate_cancellation_rates()
        
        # Cancellation rate should be 2 cancelled / 4 total = 50%
        self.assertEqual(result['overall_stats']['total_rsvps'], 4)
        self.assertEqual(result['overall_stats']['total_cancelled'], 2)
        self.assertEqual(result['overall_stats']['cancellation_rate'], 50.0)
        
        # Check timing patterns
        # One cancellation at 0.5 hours (same_day), one at 48 hours (within_48_hours)
        self.assertEqual(result['timing_patterns']['same_day'], 1)
        self.assertEqual(result['timing_patterns']['within_48_hours'], 1)

class TestVolunteerMetrics(unittest.TestCase):
    """Test cases for volunteer metrics functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.mock_volunteers_table = Mock()
        self.mock_rsvps_table = Mock()
        
        # Patch the tables in the module
        lambda_volunteer_metrics.volunteers_table = self.mock_volunteers_table
        lambda_volunteer_metrics.rsvps_table = self.mock_rsvps_table
    
    def test_get_detailed_volunteer_metrics(self):
        """Test detailed volunteer metrics calculation"""
        # Mock volunteer data
        mock_volunteer = {
            'email': 'test@example.com',
            'full_name': 'Test User',
            'first_name': 'Test',
            'last_name': 'User',
            'created_at': '2024-01-01T00:00:00Z',
            'profile_complete': True
        }
        
        # Mock RSVP data
        mock_rsvps = [
            {
                'event_id': 'event-1',
                'status': 'attended',
                'created_at': '2024-01-15T10:00:00Z'
            },
            {
                'event_id': 'event-2',
                'status': 'cancelled',
                'created_at': '2024-01-20T10:00:00Z',
                'cancelled_at': '2024-01-19T10:00:00Z'
            },
            {
                'event_id': 'event-3',
                'status': 'no_show',
                'created_at': '2024-01-25T10:00:00Z'
            }
        ]
        
        self.mock_volunteers_table.get_item.return_value = {'Item': mock_volunteer}
        self.mock_rsvps_table.query.return_value = {'Items': mock_rsvps}
        
        result = lambda_volunteer_metrics.get_detailed_volunteer_metrics('test@example.com')
        
        self.assertIsNotNone(result)
        self.assertEqual(result['basic_info']['email'], 'test@example.com')
        self.assertEqual(result['rsvp_summary']['total_rsvps'], 3)
        self.assertEqual(result['rsvp_summary']['attended_rsvps'], 1)
        self.assertEqual(result['rsvp_summary']['cancelled_rsvps'], 1)
        self.assertEqual(result['rsvp_summary']['no_show_rsvps'], 1)
        
        # Attendance rate = 1 attended / (1 attended + 1 no_show) = 50%
        self.assertEqual(result['engagement_patterns']['attendance_rate'], 50.0)
        
        # Cancellation rate = 1 cancelled / 3 total = 33.33%
        self.assertAlmostEqual(result['engagement_patterns']['cancellation_rate'], 33.33, places=1)
    
    def test_get_volunteer_leaderboard(self):
        """Test volunteer leaderboard generation"""
        # Mock volunteer data
        mock_volunteers = [
            {
                'email': 'volunteer1@example.com',
                'full_name': 'Volunteer One',
                'created_at': '2024-01-01T00:00:00Z',
                'volunteer_metrics': {
                    'total_rsvps': 10,
                    'total_attended': 8,
                    'total_no_shows': 1,
                    'first_event_date': '2024-01-15T10:00:00Z',
                    'last_event_date': '2024-02-15T10:00:00Z'
                }
            },
            {
                'email': 'volunteer2@example.com',
                'full_name': 'Volunteer Two',
                'created_at': '2024-01-15T00:00:00Z',
                'volunteer_metrics': {
                    'total_rsvps': 5,
                    'total_attended': 4,
                    'total_no_shows': 1,
                    'first_event_date': '2024-02-01T10:00:00Z',
                    'last_event_date': '2024-02-20T10:00:00Z'
                }
            }
        ]
        
        self.mock_volunteers_table.scan.return_value = {
            'Items': mock_volunteers,
            'LastEvaluatedKey': None
        }
        
        result = lambda_volunteer_metrics.get_volunteer_leaderboard(10)
        
        self.assertIn('most_events', result)
        self.assertIn('highest_attendance_rate', result)
        
        # Check that volunteers are sorted by total RSVPs (most events)
        most_events = result['most_events']
        self.assertEqual(len(most_events), 2)
        self.assertEqual(most_events[0]['total_rsvps'], 10)  # Volunteer One should be first
        self.assertEqual(most_events[1]['total_rsvps'], 5)   # Volunteer Two should be second

def run_tests():
    """Run all tests"""
    # Create test suite
    test_suite = unittest.TestSuite()
    
    # Add test cases
    test_suite.addTest(unittest.makeSuite(TestEventsExport))
    test_suite.addTest(unittest.makeSuite(TestAnalytics))
    test_suite.addTest(unittest.makeSuite(TestVolunteerMetrics))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    return result.wasSuccessful()

if __name__ == '__main__':
    success = run_tests()
    exit(0 if success else 1)