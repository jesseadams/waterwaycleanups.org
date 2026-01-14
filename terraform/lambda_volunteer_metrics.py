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
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')

volunteers_table = dynamodb.Table(volunteers_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
events_table = dynamodb.Table(events_table_name)

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

def get_detailed_volunteer_metrics(email):
    """Get detailed metrics for a specific volunteer"""
    try:
        # Get volunteer profile
        volunteer_response = volunteers_table.get_item(Key={'email': email})
        if 'Item' not in volunteer_response:
            return None
        
        volunteer = volunteer_response['Item']
        
        # Get all RSVPs for this volunteer
        rsvp_response = rsvps_table.query(
            IndexName='email-created_at-index',
            KeyConditionExpression=Key('email').eq(email)
        )
        rsvps = rsvp_response.get('Items', [])
        
        # Calculate detailed metrics
        metrics = {
            'basic_info': {
                'email': volunteer.get('email'),
                'full_name': volunteer.get('full_name'),
                'first_name': volunteer.get('first_name'),
                'last_name': volunteer.get('last_name'),
                'phone': volunteer.get('phone'),
                'created_at': volunteer.get('created_at'),
                'profile_complete': volunteer.get('profile_complete', False)
            },
            'rsvp_summary': {
                'total_rsvps': 0,
                'active_rsvps': 0,
                'cancelled_rsvps': 0,
                'no_show_rsvps': 0,
                'attended_rsvps': 0
            },
            'engagement_patterns': {
                'first_event_date': None,
                'last_event_date': None,
                'most_recent_rsvp': None,
                'average_days_between_events': 0,
                'longest_gap_days': 0,
                'cancellation_rate': 0,
                'no_show_rate': 0,
                'attendance_rate': 0
            },
            'recent_activity': {
                'rsvps_last_30_days': 0,
                'rsvps_last_90_days': 0,
                'rsvps_last_year': 0,
                'last_cancellation_date': None,
                'cancellations_last_90_days': 0
            }
        }
        
        if not rsvps:
            return metrics
        
        # Process RSVPs
        event_dates = []
        cancellation_dates = []
        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)
        ninety_days_ago = now - timedelta(days=90)
        one_year_ago = now - timedelta(days=365)
        
        for rsvp in rsvps:
            status = rsvp.get('status', 'active')
            created_at = rsvp.get('created_at')
            cancelled_at = rsvp.get('cancelled_at')
            
            # Count by status
            if status == 'active':
                metrics['rsvp_summary']['active_rsvps'] += 1
            elif status == 'cancelled':
                metrics['rsvp_summary']['cancelled_rsvps'] += 1
                if cancelled_at:
                    cancellation_dates.append(cancelled_at)
            elif status == 'no_show':
                metrics['rsvp_summary']['no_show_rsvps'] += 1
            elif status == 'attended':
                metrics['rsvp_summary']['attended_rsvps'] += 1
            
            # Track dates for engagement analysis
            if created_at:
                try:
                    rsvp_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    event_dates.append(rsvp_date)
                    
                    # Count recent activity
                    if rsvp_date >= thirty_days_ago:
                        metrics['recent_activity']['rsvps_last_30_days'] += 1
                    if rsvp_date >= ninety_days_ago:
                        metrics['recent_activity']['rsvps_last_90_days'] += 1
                    if rsvp_date >= one_year_ago:
                        metrics['recent_activity']['rsvps_last_year'] += 1
                        
                except:
                    pass
        
        metrics['rsvp_summary']['total_rsvps'] = len(rsvps)
        
        # Calculate engagement patterns
        if event_dates:
            event_dates.sort()
            metrics['engagement_patterns']['first_event_date'] = event_dates[0].isoformat()
            metrics['engagement_patterns']['last_event_date'] = event_dates[-1].isoformat()
            metrics['engagement_patterns']['most_recent_rsvp'] = event_dates[-1].isoformat()
            
            # Calculate average days between events
            if len(event_dates) > 1:
                total_days = (event_dates[-1] - event_dates[0]).days
                metrics['engagement_patterns']['average_days_between_events'] = round(
                    total_days / (len(event_dates) - 1), 1
                )
                
                # Find longest gap between events
                max_gap = 0
                for i in range(1, len(event_dates)):
                    gap = (event_dates[i] - event_dates[i-1]).days
                    max_gap = max(max_gap, gap)
                metrics['engagement_patterns']['longest_gap_days'] = max_gap
        
        # Calculate rates
        total_rsvps = metrics['rsvp_summary']['total_rsvps']
        if total_rsvps > 0:
            metrics['engagement_patterns']['cancellation_rate'] = round(
                (metrics['rsvp_summary']['cancelled_rsvps'] / total_rsvps) * 100, 2
            )
            metrics['engagement_patterns']['no_show_rate'] = round(
                (metrics['rsvp_summary']['no_show_rsvps'] / total_rsvps) * 100, 2
            )
            
            # Attendance rate = attended / (attended + no_shows) for completed events
            completed_events = metrics['rsvp_summary']['attended_rsvps'] + metrics['rsvp_summary']['no_show_rsvps']
            if completed_events > 0:
                metrics['engagement_patterns']['attendance_rate'] = round(
                    (metrics['rsvp_summary']['attended_rsvps'] / completed_events) * 100, 2
                )
        
        # Recent cancellation activity
        if cancellation_dates:
            cancellation_dates.sort(reverse=True)
            metrics['recent_activity']['last_cancellation_date'] = cancellation_dates[0]
            
            # Count recent cancellations
            for cancel_date in cancellation_dates:
                try:
                    cancel_dt = datetime.fromisoformat(cancel_date.replace('Z', '+00:00'))
                    if cancel_dt >= ninety_days_ago:
                        metrics['recent_activity']['cancellations_last_90_days'] += 1
                except:
                    pass
        
        return metrics
        
    except Exception as e:
        print(f"Error getting detailed metrics for volunteer {email}: {e}")
        return None

def get_volunteer_leaderboard(limit=20):
    """Get top volunteers by various metrics"""
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
        
        # Create leaderboards
        leaderboards = {
            'most_events': [],
            'highest_attendance_rate': [],
            'most_recent_activity': [],
            'longest_tenure': []
        }
        
        for volunteer in volunteers:
            email = volunteer.get('email')
            metrics = volunteer.get('volunteer_metrics', {})
            
            volunteer_summary = {
                'email': email,
                'full_name': volunteer.get('full_name', ''),
                'total_rsvps': metrics.get('total_rsvps', 0),
                'total_attended': metrics.get('total_attended', 0),
                'total_no_shows': metrics.get('total_no_shows', 0),
                'first_event_date': metrics.get('first_event_date'),
                'last_event_date': metrics.get('last_event_date'),
                'created_at': volunteer.get('created_at')
            }
            
            # Calculate attendance rate
            completed_events = volunteer_summary['total_attended'] + volunteer_summary['total_no_shows']
            if completed_events > 0:
                volunteer_summary['attendance_rate'] = round(
                    (volunteer_summary['total_attended'] / completed_events) * 100, 2
                )
            else:
                volunteer_summary['attendance_rate'] = 0
            
            # Calculate tenure in days
            if volunteer_summary['created_at']:
                try:
                    created = datetime.fromisoformat(volunteer_summary['created_at'].replace('Z', '+00:00'))
                    tenure_days = (datetime.now(timezone.utc) - created).days
                    volunteer_summary['tenure_days'] = tenure_days
                except:
                    volunteer_summary['tenure_days'] = 0
            else:
                volunteer_summary['tenure_days'] = 0
            
            # Add to appropriate leaderboards
            leaderboards['most_events'].append(volunteer_summary)
            
            # Only include volunteers with completed events for attendance rate
            if completed_events >= 3:  # Minimum 3 completed events for meaningful rate
                leaderboards['highest_attendance_rate'].append(volunteer_summary)
            
            leaderboards['most_recent_activity'].append(volunteer_summary)
            leaderboards['longest_tenure'].append(volunteer_summary)
        
        # Sort leaderboards
        leaderboards['most_events'].sort(key=lambda x: x['total_rsvps'], reverse=True)
        leaderboards['highest_attendance_rate'].sort(key=lambda x: x['attendance_rate'], reverse=True)
        leaderboards['most_recent_activity'].sort(
            key=lambda x: x['last_event_date'] or '1900-01-01', reverse=True
        )
        leaderboards['longest_tenure'].sort(key=lambda x: x['tenure_days'], reverse=True)
        
        # Limit results
        for category in leaderboards:
            leaderboards[category] = leaderboards[category][:limit]
        
        return leaderboards
        
    except Exception as e:
        print(f"Error generating volunteer leaderboard: {e}")
        return {
            'most_events': [],
            'highest_attendance_rate': [],
            'most_recent_activity': [],
            'longest_tenure': []
        }

def handler(event, context):
    """
    Lambda function to provide detailed volunteer metrics and reporting
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
        # Get path and query parameters
        path_params = event.get('pathParameters') or {}
        query_parameters = event.get('queryStringParameters') or {}
        
        # Check if requesting specific volunteer metrics
        if 'email' in path_params:
            email = path_params['email']
            detailed_metrics = get_detailed_volunteer_metrics(email)
            
            if detailed_metrics is None:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': f'Volunteer {email} not found'})
                }
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'volunteer_metrics': convert_decimals(detailed_metrics)
                }, default=decimal_default)
            }
        
        # Get report type
        report_type = query_parameters.get('type', 'leaderboard')
        limit = int(query_parameters.get('limit', 20))
        
        result = {
            'success': True,
            'generated_at': datetime.now(timezone.utc).isoformat()
        }
        
        if report_type == 'leaderboard':
            result['leaderboards'] = get_volunteer_leaderboard(limit)
        else:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid report type. Supported types: leaderboard'})
            }
        
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