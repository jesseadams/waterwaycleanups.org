import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from datetime import datetime
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
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

def handler(event, context):
    """
    Lambda function to get events with filtering and sorting
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Set default response headers for CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        'Access-Control-Max-Age': '86400'
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
        query_params = event.get('queryStringParameters') or {}
        path_params = event.get('pathParameters') or {}
        
        # If event_id is in path, get specific event
        if 'event_id' in path_params:
            event_id = path_params['event_id']
            try:
                response = events_table.get_item(Key={'event_id': event_id})
                if 'Item' in response:
                    return {
                        'statusCode': 200,
                        'headers': headers,
                        'body': json.dumps({
                            'event': convert_decimals(response['Item']),
                            'success': True
                        }, default=decimal_default)
                    }
                else:
                    return {
                        'statusCode': 404,
                        'headers': headers,
                        'body': json.dumps({'error': f'Event {event_id} not found'})
                    }
            except ClientError as e:
                print(f"Error getting event: {e.response['Error']['Message']}")
                return {
                    'statusCode': 500,
                    'headers': headers,
                    'body': json.dumps({'error': 'Failed to retrieve event'})
                }
        
        # List events with filtering
        status_filter = query_params.get('status')
        start_date = query_params.get('start_date')
        end_date = query_params.get('end_date')
        location_filter = query_params.get('location')
        limit = int(query_params.get('limit', 50))
        
        # Build query based on filters
        if status_filter:
            # Use GSI for status-based queries
            if start_date or end_date:
                # Query by status and date range
                key_condition = Key('status').eq(status_filter)
                if start_date:
                    key_condition = key_condition & Key('start_time').gte(start_date)
                if end_date:
                    key_condition = key_condition & Key('start_time').lte(end_date)
                
                response = events_table.query(
                    IndexName='status-start_time-index',
                    KeyConditionExpression=key_condition,
                    Limit=limit
                )
            else:
                # Query by status only
                response = events_table.query(
                    IndexName='status-start_time-index',
                    KeyConditionExpression=Key('status').eq(status_filter),
                    Limit=limit
                )
        elif start_date or end_date:
            # Use start_time index for date-based queries
            if start_date and end_date:
                response = events_table.query(
                    IndexName='start_time-index',
                    KeyConditionExpression=Key('start_time').between(start_date, end_date),
                    Limit=limit
                )
            elif start_date:
                response = events_table.query(
                    IndexName='start_time-index',
                    KeyConditionExpression=Key('start_time').gte(start_date),
                    Limit=limit
                )
            else:  # end_date only
                response = events_table.query(
                    IndexName='start_time-index',
                    KeyConditionExpression=Key('start_time').lte(end_date),
                    Limit=limit
                )
        else:
            # Scan all events (less efficient, but needed for no filters)
            response = events_table.scan(Limit=limit)
        
        events = response.get('Items', [])
        
        # Apply location filter if specified (post-query filtering)
        if location_filter:
            events = [
                event for event in events 
                if location_filter.lower() in event.get('location', {}).get('name', '').lower() or
                   location_filter.lower() in event.get('location', {}).get('address', '').lower()
            ]
        
        # Sort events by start_time (chronological order)
        events.sort(key=lambda x: x.get('start_time', ''))
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'events': convert_decimals(events),
                'count': len(events),
                'success': True
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }