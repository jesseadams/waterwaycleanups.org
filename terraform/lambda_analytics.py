import json
import os
import boto3
from datetime import datetime, timezone, timedelta
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from decimal import Decimal
from collections import defaultdict

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')

events_table = dynamodb.Table(events_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)

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

def calculate_attendance_rates(start_date=None, end_date=None):
    """Calculate attendance rates for events within date range"""
    try:
        # Get events within date range
        scan_kwargs = {}
        filter_expressions = []
        expression_values = {}
        
        if start_date:
            filter_expressions.append('start_time >= :start_date')
            expression_values[':start_date'] = start_date
        
        if end_date:
            filter_expressions.append('start_time <= :end_date')
            expression_values[':end_date'] = end_date
        
        # Only include completed events for attendance analysis
        filter_expressions.append('#status = :status')
        expression_values[':status'] = 'completed'
        scan_kwargs['ExpressionAttributeNames'] = {'#status': 'status'}
        
        if filter_expressions:
            scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)
            scan_kwargs['ExpressionAttributeValues'] = expression_values
        
        # Get events
        events = []
        last_evaluated_key = None
        
        while True:
            if last_evaluated_key:
                scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            response = events_table.scan(**scan_kwargs)
            events.extend(response.get('Items', []))
            
            last_evaluated_key = response.get('LastEvaluatedKey')
            if not last_evaluated_key:
                break
        
        # Calculate attendance statistics for each event
        event_stats = []
        total_rsvps = 0
        total_attended = 0
        total_no_shows = 0
        
        for event in events:
            event_id = event.get('event_id')
            
            # Get RSVPs for this event
            rsvp_response = rsvps_table.query(
                KeyConditionExpression=Key('event_id').eq(event_id)
            )
            rsvps = rsvp_response.get('Items', [])
            
            # Calculate stats for this event
            event_rsvp_count = len(rsvps)
            event_attended = len([r for r in rsvps if r.get('status') == 'attended'])
            event_no_shows = len([r for r in rsvps if r.get('status') == 'no_show'])
            event_active = len([r for r in rsvps if r.get('status') == 'active'])
            
            # Calculate attendance rate (attended / (attended + no_shows))
            # Active RSVPs are not counted in attendance rate for completed events
            total_completed_rsvps = event_attended + event_no_shows
            attendance_rate = (event_attended / total_completed_rsvps * 100) if total_completed_rsvps > 0 else 0
            
            event_stat = {
                'event_id': event_id,
                'event_title': event.get('title', ''),
                'event_date': event.get('start_time', ''),
                'total_rsvps': event_rsvp_count,
                'attended': event_attended,
                'no_shows': event_no_shows,
                'active_rsvps': event_active,
                'attendance_rate': round(attendance_rate, 2)
            }
            
            event_stats.append(event_stat)
            total_rsvps += event_rsvp_count
            total_attended += event_attended
            total_no_shows += event_no_shows
        
        # Calculate overall attendance rate
        total_completed_rsvps = total_attended + total_no_shows
        overall_attendance_rate = (total_attended / total_completed_rsvps * 100) if total_completed_rsvps > 0 else 0
        
        return {
            'overall_stats': {
                'total_events': len(events),
                'total_rsvps': total_rsvps,
                'total_attended': total_attended,
                'total_no_shows': total_no_shows,
                'overall_attendance_rate': round(overall_attendance_rate, 2)
            },
            'event_stats': event_stats
        }
        
    except Exception as e:
        print(f"Error calculating attendance rates: {e}")
        return {
            'overall_stats': {
                'total_events': 0,
                'total_rsvps': 0,
                'total_attended': 0,
                'total_no_shows': 0,
                'overall_attendance_rate': 0
            },
            'event_stats': []
        }

def calculate_cancellation_rates(start_date=None, end_date=None):
    """Calculate cancellation rates and patterns"""
    try:
        # Get all RSVPs within date range by scanning RSVPs table
        scan_kwargs = {}
        filter_expressions = []
        expression_values = {}
        
        if start_date:
            filter_expressions.append('created_at >= :start_date')
            expression_values[':start_date'] = start_date
        
        if end_date:
            filter_expressions.append('created_at <= :end_date')
            expression_values[':end_date'] = end_date
        
        if filter_expressions:
            scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)
            scan_kwargs['ExpressionAttributeValues'] = expression_values
        
        # Get RSVPs
        rsvps = []
        last_evaluated_key = None
        
        while True:
            if last_evaluated_key:
                scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            response = rsvps_table.scan(**scan_kwargs)
            rsvps.extend(response.get('Items', []))
            
            last_evaluated_key = response.get('LastEvaluatedKey')
            if not last_evaluated_key:
                break
        
        # Analyze cancellation patterns
        total_rsvps = len(rsvps)
        cancelled_rsvps = [r for r in rsvps if r.get('status') == 'cancelled']
        total_cancelled = len(cancelled_rsvps)
        
        # Calculate overall cancellation rate
        cancellation_rate = (total_cancelled / total_rsvps * 100) if total_rsvps > 0 else 0
        
        # Analyze cancellation timing patterns
        timing_patterns = {
            'same_day': 0,
            'within_24_hours': 0,
            'within_48_hours': 0,
            'within_week': 0,
            'more_than_week': 0,
            'unknown': 0
        }
        
        for rsvp in cancelled_rsvps:
            hours_before = rsvp.get('hours_before_event')
            if hours_before is not None:
                hours_before = float(hours_before)
                if hours_before <= 24:
                    if hours_before <= 1:
                        timing_patterns['same_day'] += 1
                    else:
                        timing_patterns['within_24_hours'] += 1
                elif hours_before <= 48:
                    timing_patterns['within_48_hours'] += 1
                elif hours_before <= 168:  # 7 days
                    timing_patterns['within_week'] += 1
                else:
                    timing_patterns['more_than_week'] += 1
            else:
                timing_patterns['unknown'] += 1
        
        # Calculate cancellation rates by event
        event_cancellation_stats = defaultdict(lambda: {'total': 0, 'cancelled': 0})
        
        for rsvp in rsvps:
            event_id = rsvp.get('event_id')
            event_cancellation_stats[event_id]['total'] += 1
            if rsvp.get('status') == 'cancelled':
                event_cancellation_stats[event_id]['cancelled'] += 1
        
        # Convert to list with rates
        event_stats = []
        for event_id, stats in event_cancellation_stats.items():
            rate = (stats['cancelled'] / stats['total'] * 100) if stats['total'] > 0 else 0
            event_stats.append({
                'event_id': event_id,
                'total_rsvps': stats['total'],
                'cancelled_rsvps': stats['cancelled'],
                'cancellation_rate': round(rate, 2)
            })
        
        # Sort by cancellation rate descending
        event_stats.sort(key=lambda x: x['cancellation_rate'], reverse=True)
        
        return {
            'overall_stats': {
                'total_rsvps': total_rsvps,
                'total_cancelled': total_cancelled,
                'cancellation_rate': round(cancellation_rate, 2)
            },
            'timing_patterns': timing_patterns,
            'event_stats': event_stats[:20]  # Top 20 events with highest cancellation rates
        }
        
    except Exception as e:
        print(f"Error calculating cancellation rates: {e}")
        return {
            'overall_stats': {
                'total_rsvps': 0,
                'total_cancelled': 0,
                'cancellation_rate': 0
            },
            'timing_patterns': {
                'same_day': 0,
                'within_24_hours': 0,
                'within_48_hours': 0,
                'within_week': 0,
                'more_than_week': 0,
                'unknown': 0
            },
            'event_stats': []
        }

def calculate_volunteer_metrics():
    """Calculate comprehensive volunteer metrics"""
    try:
        # Get all volunteers
        volunteers = []
        last_evaluated_key = None
        
        while True:
            scan_kwargs = {}
            if last_evaluated_key:
                scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            response = volunteers_table.scan(**scan_kwargs)
            volunteers.extend(response.get('Items', []))
            
            last_evaluated_key = response.get('LastEvaluatedKey')
            if not last_evaluated_key:
                break
        
        # Calculate metrics
        total_volunteers = len(volunteers)
        active_volunteers = 0  # Volunteers with at least one RSVP in last 6 months
        repeat_volunteers = 0  # Volunteers with more than one event
        
        # Volunteer engagement metrics
        engagement_stats = {
            'one_time': 0,
            'occasional': 0,  # 2-5 events
            'regular': 0,     # 6-10 events
            'frequent': 0     # 11+ events
        }
        
        retention_stats = {
            'new_volunteers_last_30_days': 0,
            'new_volunteers_last_90_days': 0,
            'active_last_30_days': 0,
            'active_last_90_days': 0
        }
        
        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)
        ninety_days_ago = now - timedelta(days=90)
        six_months_ago = now - timedelta(days=180)
        
        for volunteer in volunteers:
            metrics = volunteer.get('volunteer_metrics', {})
            total_rsvps = metrics.get('total_rsvps', 0)
            last_event_date = metrics.get('last_event_date')
            created_at = volunteer.get('created_at')
            
            # Check if volunteer is active (has RSVPs in last 6 months)
            if last_event_date:
                try:
                    last_event = datetime.fromisoformat(last_event_date.replace('Z', '+00:00'))
                    if last_event >= six_months_ago:
                        active_volunteers += 1
                    
                    if last_event >= thirty_days_ago:
                        retention_stats['active_last_30_days'] += 1
                    elif last_event >= ninety_days_ago:
                        retention_stats['active_last_90_days'] += 1
                        
                except:
                    pass
            
            # Check if volunteer is new
            if created_at:
                try:
                    created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    if created >= thirty_days_ago:
                        retention_stats['new_volunteers_last_30_days'] += 1
                    elif created >= ninety_days_ago:
                        retention_stats['new_volunteers_last_90_days'] += 1
                except:
                    pass
            
            # Categorize by engagement level
            if total_rsvps == 1:
                engagement_stats['one_time'] += 1
            elif total_rsvps <= 5:
                engagement_stats['occasional'] += 1
                repeat_volunteers += 1
            elif total_rsvps <= 10:
                engagement_stats['regular'] += 1
                repeat_volunteers += 1
            else:
                engagement_stats['frequent'] += 1
                repeat_volunteers += 1
        
        # Calculate retention rate
        retention_rate = (repeat_volunteers / total_volunteers * 100) if total_volunteers > 0 else 0
        
        return {
            'total_volunteers': total_volunteers,
            'active_volunteers': active_volunteers,
            'repeat_volunteers': repeat_volunteers,
            'retention_rate': round(retention_rate, 2),
            'engagement_distribution': engagement_stats,
            'retention_stats': retention_stats
        }
        
    except Exception as e:
        print(f"Error calculating volunteer metrics: {e}")
        return {
            'total_volunteers': 0,
            'active_volunteers': 0,
            'repeat_volunteers': 0,
            'retention_rate': 0,
            'engagement_distribution': {
                'one_time': 0,
                'occasional': 0,
                'regular': 0,
                'frequent': 0
            },
            'retention_stats': {
                'new_volunteers_last_30_days': 0,
                'new_volunteers_last_90_days': 0,
                'active_last_30_days': 0,
                'active_last_90_days': 0
            }
        }

def handler(event, context):
    """
    Lambda function to calculate and return analytics for events and volunteers
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    }
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
    try:
        # Get query parameters
        query_parameters = event.get('queryStringParameters') or {}
        analytics_type = query_parameters.get('type', 'all')
        start_date = query_parameters.get('start_date')
        end_date = query_parameters.get('end_date')
        
        result = {
            'success': True,
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'date_range': {
                'start_date': start_date,
                'end_date': end_date
            }
        }
        
        # Calculate requested analytics
        if analytics_type in ['all', 'attendance']:
            result['attendance_analytics'] = calculate_attendance_rates(start_date, end_date)
        
        if analytics_type in ['all', 'cancellation']:
            result['cancellation_analytics'] = calculate_cancellation_rates(start_date, end_date)
        
        if analytics_type in ['all', 'volunteers']:
            result['volunteer_analytics'] = calculate_volunteer_metrics()
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(convert_decimals(result), default=decimal_default)
        }
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal server error'})
        }