#!/usr/bin/env python3
"""
Integration tests for export and analytics API endpoints
"""

import json
import os
from unittest.mock import Mock, patch

# Mock AWS services before importing Lambda functions
with patch('boto3.resource'):
    import lambda_events_export
    import lambda_analytics
    import lambda_volunteer_metrics

def test_events_export_api():
    """Test events export API endpoint"""
    print("Testing Events Export API...")
    
    # Mock the DynamoDB tables
    mock_events_table = Mock()
    mock_rsvps_table = Mock()
    
    # Mock event data
    mock_events = [
        {
            'event_id': 'test-event-1',
            'title': 'Test Cleanup Event',
            'description': 'A test cleanup event',
            'start_time': '2024-02-15T10:00:00Z',
            'end_time': '2024-02-15T12:00:00Z',
            'status': 'active',
            'attendance_cap': 50,
            'location': {
                'name': 'Test Park',
                'address': '123 Test Street, Test City'
            },
            'hugo_config': {
                'tags': ['cleanup', 'park'],
                'preheader_is_light': True
            }
        }
    ]
    
    mock_events_table.scan.return_value = {
        'Items': mock_events,
        'LastEvaluatedKey': None
    }
    
    # Mock RSVP stats
    mock_rsvps_table.query.return_value = {
        'Items': [
            {'event_id': 'test-event-1', 'status': 'active'},
            {'event_id': 'test-event-1', 'status': 'active'},
            {'event_id': 'test-event-1', 'status': 'cancelled'}
        ]
    }
    
    # Patch the tables
    lambda_events_export.events_table = mock_events_table
    lambda_events_export.rsvps_table = mock_rsvps_table
    
    # Test JSON export
    json_event = {
        'httpMethod': 'GET',
        'queryStringParameters': {
            'format': 'json',
            'include_rsvp_stats': 'true'
        }
    }
    
    result = lambda_events_export.handler(json_event, {})
    
    assert result['statusCode'] == 200
    response_body = json.loads(result['body'])
    assert response_body['success'] == True
    assert len(response_body['events']) == 1
    assert response_body['events'][0]['event_id'] == 'test-event-1'
    assert 'rsvp_stats' in response_body['events'][0]
    
    print("✓ JSON export test passed")
    
    # Test CSV export
    csv_event = {
        'httpMethod': 'GET',
        'queryStringParameters': {
            'format': 'csv',
            'include_rsvp_stats': 'true'
        }
    }
    
    result = lambda_events_export.handler(csv_event, {})
    
    assert result['statusCode'] == 200
    assert result['headers']['Content-Type'] == 'text/csv'
    assert 'test-event-1' in result['body']
    
    print("✓ CSV export test passed")

def test_analytics_api():
    """Test analytics API endpoint"""
    print("Testing Analytics API...")
    
    # Mock the DynamoDB tables
    mock_events_table = Mock()
    mock_rsvps_table = Mock()
    mock_volunteers_table = Mock()
    
    # Mock completed events
    mock_events = [
        {
            'event_id': 'completed-event-1',
            'title': 'Completed Event',
            'start_time': '2024-01-15T10:00:00Z',
            'status': 'completed'
        }
    ]
    
    # Mock RSVPs
    mock_rsvps = [
        {'event_id': 'completed-event-1', 'status': 'attended', 'created_at': '2024-01-10T10:00:00Z'},
        {'event_id': 'completed-event-1', 'status': 'attended', 'created_at': '2024-01-11T10:00:00Z'},
        {'event_id': 'completed-event-1', 'status': 'no_show', 'created_at': '2024-01-12T10:00:00Z'},
        {'event_id': 'completed-event-1', 'status': 'cancelled', 'created_at': '2024-01-13T10:00:00Z', 'hours_before_event': 12}
    ]
    
    # Mock volunteers
    mock_volunteers = [
        {
            'email': 'volunteer1@example.com',
            'full_name': 'Test Volunteer',
            'created_at': '2024-01-01T00:00:00Z',
            'volunteer_metrics': {
                'total_rsvps': 5,
                'total_attended': 4,
                'total_no_shows': 1
            }
        }
    ]
    
    mock_events_table.scan.return_value = {'Items': mock_events, 'LastEvaluatedKey': None}
    mock_rsvps_table.scan.return_value = {'Items': mock_rsvps, 'LastEvaluatedKey': None}
    mock_rsvps_table.query.return_value = {'Items': mock_rsvps[:3]}  # Only RSVPs for the event
    mock_volunteers_table.scan.return_value = {'Items': mock_volunteers, 'LastEvaluatedKey': None}
    
    # Patch the tables
    lambda_analytics.events_table = mock_events_table
    lambda_analytics.rsvps_table = mock_rsvps_table
    lambda_analytics.volunteers_table = mock_volunteers_table
    
    # Test all analytics
    analytics_event = {
        'httpMethod': 'GET',
        'queryStringParameters': {
            'type': 'all'
        }
    }
    
    result = lambda_analytics.handler(analytics_event, {})
    
    assert result['statusCode'] == 200
    response_body = json.loads(result['body'])
    assert response_body['success'] == True
    assert 'attendance_analytics' in response_body
    assert 'cancellation_analytics' in response_body
    assert 'volunteer_analytics' in response_body
    
    # Check attendance analytics
    attendance = response_body['attendance_analytics']
    assert attendance['overall_stats']['total_attended'] == 2
    assert attendance['overall_stats']['total_no_shows'] == 1
    
    # Check cancellation analytics
    cancellation = response_body['cancellation_analytics']
    assert cancellation['overall_stats']['total_cancelled'] == 1
    assert cancellation['overall_stats']['total_rsvps'] == 4
    
    print("✓ Analytics API test passed")

def test_volunteer_metrics_api():
    """Test volunteer metrics API endpoint"""
    print("Testing Volunteer Metrics API...")
    
    # Mock the DynamoDB tables
    mock_volunteers_table = Mock()
    mock_rsvps_table = Mock()
    
    # Mock volunteer data
    mock_volunteer = {
        'email': 'test@example.com',
        'full_name': 'Test Volunteer',
        'first_name': 'Test',
        'last_name': 'Volunteer',
        'created_at': '2024-01-01T00:00:00Z',
        'profile_complete': True,
        'volunteer_metrics': {
            'total_rsvps': 5,
            'total_attended': 4,
            'total_no_shows': 1
        }
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
        }
    ]
    
    mock_volunteers_table.get_item.return_value = {'Item': mock_volunteer}
    mock_volunteers_table.scan.return_value = {'Items': [mock_volunteer], 'LastEvaluatedKey': None}
    mock_rsvps_table.query.return_value = {'Items': mock_rsvps}
    
    # Patch the tables
    lambda_volunteer_metrics.volunteers_table = mock_volunteers_table
    lambda_volunteer_metrics.rsvps_table = mock_rsvps_table
    
    # Test detailed volunteer metrics
    detailed_event = {
        'httpMethod': 'GET',
        'pathParameters': {
            'email': 'test@example.com'
        },
        'queryStringParameters': {}
    }
    
    result = lambda_volunteer_metrics.handler(detailed_event, {})
    
    assert result['statusCode'] == 200
    response_body = json.loads(result['body'])
    assert response_body['success'] == True
    assert 'volunteer_metrics' in response_body
    
    metrics = response_body['volunteer_metrics']
    assert metrics['basic_info']['email'] == 'test@example.com'
    assert metrics['rsvp_summary']['total_rsvps'] == 2
    
    print("✓ Detailed volunteer metrics test passed")
    
    # Test leaderboard
    leaderboard_event = {
        'httpMethod': 'GET',
        'pathParameters': {},
        'queryStringParameters': {
            'type': 'leaderboard',
            'limit': '10'
        }
    }
    
    result = lambda_volunteer_metrics.handler(leaderboard_event, {})
    
    assert result['statusCode'] == 200
    response_body = json.loads(result['body'])
    assert response_body['success'] == True
    assert 'leaderboards' in response_body
    
    leaderboards = response_body['leaderboards']
    assert 'most_events' in leaderboards
    assert 'highest_attendance_rate' in leaderboards
    
    print("✓ Volunteer leaderboard test passed")

def test_error_handling():
    """Test error handling in API endpoints"""
    print("Testing Error Handling...")
    
    # Test invalid format in events export
    invalid_format_event = {
        'httpMethod': 'GET',
        'queryStringParameters': {
            'format': 'invalid_format'
        }
    }
    
    result = lambda_events_export.handler(invalid_format_event, {})
    assert result['statusCode'] == 400
    response_body = json.loads(result['body'])
    assert 'error' in response_body
    
    print("✓ Error handling test passed")

def run_integration_tests():
    """Run all integration tests"""
    print("Running Export and Analytics Integration Tests...")
    print("=" * 50)
    
    try:
        test_events_export_api()
        test_analytics_api()
        test_volunteer_metrics_api()
        test_error_handling()
        
        print("=" * 50)
        print("✅ All integration tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = run_integration_tests()
    exit(0 if success else 1)