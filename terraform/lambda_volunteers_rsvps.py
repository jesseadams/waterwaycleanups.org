import json
import os
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from decimal import Decimal

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

def handler(event, context):
    """
    Lambda function to get volunteer's RSVP history with event details
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
        # Get email from path parameters
        path_parameters = event.get('pathParameters') or {}
        email = path_parameters.get('email')
        
        if not email:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Email parameter is required'})
            }
        
        # Check if volunteer exists
        try:
            volunteer_response = volunteers_table.get_item(Key={'email': email})
            if 'Item' not in volunteer_response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': 'Volunteer not found'})
                }
        except ClientError as e:
            print(f"Error checking volunteer: {e}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to verify volunteer'})
            }
        
        # Get query parameters for filtering
        query_parameters = event.get('queryStringParameters') or {}
        status_filter = query_parameters.get('status')  # active, cancelled, no_show, attended
        limit = int(query_parameters.get('limit', 50))
        
        # Get RSVPs for this volunteer
        try:
            rsvp_response = rsvps_table.query(
                IndexName='email-created_at-index',
                KeyConditionExpression=Key('email').eq(email),
                Limit=min(limit, 100)  # Cap at 100
            )
            
            rsvps = rsvp_response.get('Items', [])
            
            # Filter by status if specified
            if status_filter:
                rsvps = [rsvp for rsvp in rsvps if rsvp.get('status') == status_filter]
            
            # Enrich RSVPs with event details
            enriched_rsvps = []
            
            for rsvp in rsvps:
                event_id = rsvp.get('event_id')
                
                # Get event details
                event_details = None
                if event_id:
                    try:
                        event_response = events_table.get_item(Key={'event_id': event_id})
                        event_details = event_response.get('Item')
                    except ClientError as e:
                        print(f"Warning: Could not fetch event details for {event_id}: {e}")
                
                # Extract event date for sorting
                event_date = None
                event_display_date = "Date TBD"
                
                if event_details:
                    # Try to get date from event record first
                    if 'start_time' in event_details:
                        try:
                            event_date = datetime.fromisoformat(event_details['start_time'].replace('Z', '+00:00'))
                            event_display_date = event_date.strftime("%B %d, %Y at %I:%M %p")
                        except:
                            pass
                
                # Fallback to extracting from event_id
                if not event_date:
                    event_date = extract_event_date_from_id(event_id)
                    if event_date:
                        event_display_date = event_date.strftime("%B %Y")
                
                # Build enriched RSVP
                enriched_rsvp = {
                    # RSVP data
                    'event_id': event_id,
                    'email': rsvp.get('email'),
                    'status': rsvp.get('status', 'active'),
                    'created_at': rsvp.get('created_at'),
                    'updated_at': rsvp.get('updated_at'),
                    'cancelled_at': rsvp.get('cancelled_at'),
                    'hours_before_event': rsvp.get('hours_before_event'),
                    'additional_comments': rsvp.get('additional_comments'),
                    
                    # Event data (if available)
                    'event_title': event_details.get('title', 'Unknown Event') if event_details else 'Unknown Event',
                    'event_description': event_details.get('description', '') if event_details else '',
                    'event_start_time': event_details.get('start_time') if event_details else None,
                    'event_end_time': event_details.get('end_time') if event_details else None,
                    'event_location': event_details.get('location', {}) if event_details else {},
                    'event_status': event_details.get('status', 'unknown') if event_details else 'unknown',
                    'event_attendance_cap': event_details.get('attendance_cap') if event_details else None,
                    
                    # Computed fields
                    'event_date': event_date.isoformat() if event_date else None,
                    'event_display_date': event_display_date,
                    'event_sort_timestamp': event_date.timestamp() if event_date else 0
                }
                
                enriched_rsvps.append(enriched_rsvp)
            
            # Sort RSVPs by event date (most recent events first)
            try:
                enriched_rsvps.sort(key=lambda x: -x.get('event_sort_timestamp', 0))
            except Exception as sort_error:
                print(f"Error sorting RSVPs: {sort_error}")
            
            # Calculate summary statistics
            summary = {
                'total_rsvps': len([r for r in enriched_rsvps if r.get('status') == 'active']),
                'total_cancellations': len([r for r in enriched_rsvps if r.get('status') == 'cancelled']),
                'total_no_shows': len([r for r in enriched_rsvps if r.get('status') == 'no_show']),
                'total_attended': len([r for r in enriched_rsvps if r.get('status') == 'attended']),
                'total_all_rsvps': len(enriched_rsvps)
            }
            
            result = {
                'success': True,
                'email': email,
                'rsvps': convert_decimals(enriched_rsvps),
                'summary': summary,
                'count': len(enriched_rsvps)
            }
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(result, default=decimal_default)
            }
            
        except ClientError as e:
            print(f"Error getting RSVPs for {email}: {e}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to retrieve RSVP history'})
            }
    
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal server error'})
        }