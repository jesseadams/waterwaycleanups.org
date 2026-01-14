import json
import os
import boto3
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

def handler(event, context):
    """
    Lambda function to delete an event and its associated RSVPs
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Set default response headers for CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'OPTIONS,DELETE',
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
        # Get event_id from path parameters
        path_params = event.get('pathParameters') or {}
        if 'event_id' not in path_params:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing event_id in path'})
            }
        
        event_id = path_params['event_id']
        
        # Check if event exists
        try:
            existing_response = events_table.get_item(Key={'event_id': event_id})
            if 'Item' not in existing_response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': f'Event {event_id} not found'})
                }
            
            existing_event = existing_response['Item']
        except ClientError as e:
            print(f"Error checking existing event: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to check existing event'})
            }
        
        # Get all RSVPs for this event to delete them
        try:
            rsvps_response = rsvps_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('event_id').eq(event_id)
            )
            rsvps_to_delete = rsvps_response.get('Items', [])
            
            # Delete all RSVPs for this event
            for rsvp in rsvps_to_delete:
                rsvps_table.delete_item(
                    Key={
                        'event_id': rsvp['event_id'],
                        'email': rsvp['email']
                    }
                )
            
            print(f"Deleted {len(rsvps_to_delete)} RSVPs for event {event_id}")
            
        except ClientError as e:
            print(f"Error deleting RSVPs: {e.response['Error']['Message']}")
            # Continue with event deletion even if RSVP deletion fails
        
        # Delete the event
        try:
            events_table.delete_item(Key={'event_id': event_id})
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'message': f'Event {event_id} and {len(rsvps_to_delete)} associated RSVPs deleted successfully',
                    'deleted_event': convert_decimals(existing_event),
                    'deleted_rsvps_count': len(rsvps_to_delete),
                    'success': True
                })
            }
            
        except ClientError as e:
            print(f"Error deleting event: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to delete event'})
            }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }