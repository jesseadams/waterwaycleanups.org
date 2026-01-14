import json
import os
import boto3
import csv
import io
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')

events_table = dynamodb.Table(events_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)

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

def get_event_rsvp_stats(event_id):
    """Get RSVP statistics for a specific event"""
    try:
        response = rsvps_table.query(
            KeyConditionExpression=Key('event_id').eq(event_id)
        )
        
        rsvps = response.get('Items', [])
        
        stats = {
            'total_rsvps': len(rsvps),
            'active_rsvps': 0,
            'cancelled_rsvps': 0,
            'no_show_rsvps': 0,
            'attended_rsvps': 0
        }
        
        for rsvp in rsvps:
            status = rsvp.get('status', 'active')
            if status == 'active':
                stats['active_rsvps'] += 1
            elif status == 'cancelled':
                stats['cancelled_rsvps'] += 1
            elif status == 'no_show':
                stats['no_show_rsvps'] += 1
            elif status == 'attended':
                stats['attended_rsvps'] += 1
        
        return stats
        
    except Exception as e:
        print(f"Error getting RSVP stats for event {event_id}: {e}")
        return {
            'total_rsvps': 0,
            'active_rsvps': 0,
            'cancelled_rsvps': 0,
            'no_show_rsvps': 0,
            'attended_rsvps': 0
        }

def flatten_event_data(event):
    """Flatten event data for CSV export"""
    flattened = {
        'event_id': event.get('event_id', ''),
        'title': event.get('title', ''),
        'description': event.get('description', ''),
        'start_time': event.get('start_time', ''),
        'end_time': event.get('end_time', ''),
        'status': event.get('status', ''),
        'attendance_cap': event.get('attendance_cap', 0),
        'created_at': event.get('created_at', ''),
        'updated_at': event.get('updated_at', ''),
    }
    
    # Location information
    location = event.get('location', {})
    flattened['location_name'] = location.get('name', '')
    flattened['location_address'] = location.get('address', '')
    
    # Coordinates if available
    coordinates = location.get('coordinates', {})
    flattened['location_lat'] = coordinates.get('lat', '')
    flattened['location_lng'] = coordinates.get('lng', '')
    
    # Hugo configuration
    hugo_config = event.get('hugo_config', {})
    flattened['hugo_image'] = hugo_config.get('image', '')
    flattened['hugo_tags'] = ', '.join(hugo_config.get('tags', []))
    flattened['hugo_preheader_is_light'] = hugo_config.get('preheader_is_light', False)
    
    # RSVP statistics
    rsvp_stats = event.get('rsvp_stats', {})
    flattened['total_rsvps'] = rsvp_stats.get('total_rsvps', 0)
    flattened['active_rsvps'] = rsvp_stats.get('active_rsvps', 0)
    flattened['cancelled_rsvps'] = rsvp_stats.get('cancelled_rsvps', 0)
    flattened['no_show_rsvps'] = rsvp_stats.get('no_show_rsvps', 0)
    flattened['attended_rsvps'] = rsvp_stats.get('attended_rsvps', 0)
    
    return flattened

def generate_csv(events):
    """Generate CSV content from events list"""
    if not events:
        return ""
    
    # Flatten all event data
    flattened_events = [flatten_event_data(e) for e in events]
    
    # Get all possible field names
    all_fields = set()
    for event in flattened_events:
        all_fields.update(event.keys())
    
    # Sort fields for consistent output
    fieldnames = sorted(all_fields)
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(flattened_events)
    
    return output.getvalue()

def handler(event, context):
    """
    Lambda function to export event data in CSV or JSON format
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
        export_format = query_parameters.get('format', 'json').lower()
        include_rsvp_stats = query_parameters.get('include_rsvp_stats', 'true').lower() == 'true'
        
        # Validate format
        if export_format not in ['json', 'csv']:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid format. Supported formats: json, csv'})
            }
        
        # Build scan parameters for filtering
        scan_kwargs = {}
        filter_expressions = []
        expression_values = {}
        
        # Filter by status
        if query_parameters.get('status'):
            filter_expressions.append('#status = :status')
            expression_values[':status'] = query_parameters['status']
            scan_kwargs['ExpressionAttributeNames'] = {'#status': 'status'}
        
        # Filter by date range
        if query_parameters.get('start_date'):
            filter_expressions.append('start_time >= :start_date')
            expression_values[':start_date'] = query_parameters['start_date']
        
        if query_parameters.get('end_date'):
            filter_expressions.append('start_time <= :end_date')
            expression_values[':end_date'] = query_parameters['end_date']
        
        # Add filter expression if any filters are specified
        if filter_expressions:
            scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)
            scan_kwargs['ExpressionAttributeValues'] = expression_values
        
        # Get all events (paginated scan)
        events = []
        last_evaluated_key = None
        
        try:
            while True:
                if last_evaluated_key:
                    scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
                
                response = events_table.scan(**scan_kwargs)
                events.extend(response.get('Items', []))
                
                last_evaluated_key = response.get('LastEvaluatedKey')
                if not last_evaluated_key:
                    break
                
                # Safety limit to prevent infinite loops
                if len(events) > 5000:
                    print("Warning: Export limited to 5,000 events")
                    break
            
            # Get RSVP statistics for each event if requested
            if include_rsvp_stats:
                for event_item in events:
                    event_id = event_item.get('event_id')
                    if event_id:
                        event_item['rsvp_stats'] = get_event_rsvp_stats(event_id)
            
            # Sort events by start_time (chronological order)
            events.sort(key=lambda x: x.get('start_time', ''))
            
            # Convert decimals
            events = convert_decimals(events)
            
            # Generate response based on format
            if export_format == 'csv':
                csv_content = generate_csv(events)
                
                # Set CSV headers
                csv_headers = {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'text/csv',
                    'Content-Disposition': f'attachment; filename="events_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'
                }
                
                return {
                    'statusCode': 200,
                    'headers': csv_headers,
                    'body': csv_content
                }
            
            else:  # JSON format
                result = {
                    'success': True,
                    'events': events,
                    'count': len(events),
                    'exported_at': datetime.now(timezone.utc).isoformat(),
                    'include_rsvp_stats': include_rsvp_stats
                }
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps(result, default=decimal_default)
                }
                
        except ClientError as e:
            print(f"Error scanning events table: {e}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to retrieve events data'})
            }
    
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal server error'})
        }