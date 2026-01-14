import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from datetime import datetime
from decimal import Decimal

# Initialize DynamoDB client with region
aws_region = os.environ.get('AWS_REGION', 'us-east-1')
dynamodb = boto3.resource('dynamodb', region_name=aws_region)

# Get table names from environment variables
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
event_rsvps_table_name = os.environ.get('EVENT_RSVPS_TABLE_NAME', 'event_rsvps')
sessions_table_name = os.environ.get('SESSIONS_TABLE_NAME', 'user_sessions')
minors_table_name = os.environ.get('MINORS_TABLE_NAME', 'minors')

# Initialize tables
events_table = dynamodb.Table(events_table_name)
event_rsvps_table = dynamodb.Table(event_rsvps_table_name)
sessions_table = dynamodb.Table(sessions_table_name)
minors_table = dynamodb.Table(minors_table_name)


def decimal_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def validate_session(session_token):
    """
    Validate session token and return email if valid.
    
    Returns:
        tuple: (is_valid, email, error_message)
    """
    try:
        response = sessions_table.get_item(
            Key={'session_token': session_token}
        )
        
        if 'Item' not in response:
            return False, None, 'Invalid session token'
        
        item = response['Item']
        
        # Check if session is expired
        expires_at = datetime.fromisoformat(item['expires_at'].replace('Z', '+00:00'))
        if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
            # Delete expired session
            sessions_table.delete_item(
                Key={'session_token': session_token}
            )
            return False, None, 'Session has expired'
        
        return True, item['email'], None
        
    except ClientError as e:
        print(f"Error validating session: {e}")
        return False, None, 'Failed to validate session'


def verify_rsvp_ownership(event_id, attendee_id, attendee_type, volunteer_email):
    """
    Verify that the RSVP belongs to the requesting volunteer or their minor.
    
    Requirements 6.1, 6.2, 6.3:
    - Volunteer can cancel their own RSVP
    - Volunteer can cancel their minor's RSVP
    - Volunteer cannot cancel another volunteer's RSVP
    
    Returns:
        tuple: (is_authorized, rsvp_item, error_message)
    """
    try:
        # Get the RSVP record
        response = event_rsvps_table.get_item(
            Key={
                'event_id': event_id,
                'attendee_id': attendee_id
            }
        )
        
        if 'Item' not in response:
            return False, None, 'RSVP not found'
        
        rsvp_item = response['Item']
        
        # Check authorization based on attendee type
        if attendee_type == 'volunteer':
            # For volunteer RSVPs, the attendee_id should match the volunteer's email
            if attendee_id != volunteer_email:
                return False, None, 'You can only cancel your own RSVP'
        elif attendee_type == 'minor':
            # For minor RSVPs, check if the volunteer is the guardian
            guardian_email = rsvp_item.get('guardian_email')
            if guardian_email != volunteer_email:
                return False, None, 'You can only cancel RSVPs for your own minors'
        else:
            return False, None, 'Invalid attendee type'
        
        return True, rsvp_item, None
        
    except ClientError as e:
        print(f"Error verifying RSVP ownership: {e}")
        return False, None, 'Failed to verify RSVP ownership'


def delete_rsvp_record(event_id, attendee_id):
    """
    Delete RSVP record from database.
    
    Requirement 6.1, 6.2: Remove the RSVP record
    
    Returns:
        tuple: (success, error_message)
    """
    try:
        event_rsvps_table.delete_item(
            Key={
                'event_id': event_id,
                'attendee_id': attendee_id
            }
        )
        return True, None
    except ClientError as e:
        print(f"Error deleting RSVP: {e}")
        return False, 'Failed to delete RSVP'


def calculate_hours_before_event(event_id):
    """
    Calculate hours before event if event time is available.
    
    Requirement 6.5: Calculate hours_before_event if event time available
    
    Returns:
        float or None: Hours before event, or None if event time not available
    """
    try:
        response = events_table.get_item(
            Key={'event_id': event_id}
        )
        
        if 'Item' not in response:
            return None
        
        event_item = response['Item']
        event_date = event_item.get('event_date')
        
        if not event_date:
            return None
        
        # Parse event date and calculate hours difference
        event_datetime = datetime.fromisoformat(event_date.replace('Z', '+00:00'))
        now = datetime.utcnow().replace(tzinfo=event_datetime.tzinfo)
        
        time_diff = event_datetime - now
        hours_before = time_diff.total_seconds() / 3600
        
        return round(hours_before, 1)
        
    except Exception as e:
        print(f"Error calculating hours before event: {e}")
        return None


def handler(event, context):
    """
    Lambda function to cancel an RSVP for an event.
    Supports cancellation of both volunteer and minor RSVPs.
    
    Implements Requirements 6.1, 6.2, 6.3, 6.4, 6.5
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Set default response headers for CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        'Access-Control-Max-Age': '86400'  # 24 hours cache for preflight requests
    }
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        
        # Validate required parameters
        required_params = ['session_token', 'event_id', 'attendee_id', 'attendee_type']
        missing_params = [p for p in required_params if p not in body]
        
        if missing_params:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': f'Missing required parameters: {", ".join(missing_params)}'
                })
            }
        
        session_token = body['session_token']
        event_id = body['event_id']
        attendee_id = body['attendee_id']
        attendee_type = body['attendee_type']
        
        # Validate attendee_type
        if attendee_type not in ['volunteer', 'minor']:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'attendee_type must be either "volunteer" or "minor"'
                })
            }
        
        # Validate session token (Requirement 6.1, 6.2, 6.3)
        is_valid, volunteer_email, error_msg = validate_session(session_token)
        if not is_valid:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': error_msg
                })
            }
        
        # Verify RSVP belongs to requesting volunteer or their minor (Requirement 6.3)
        is_authorized, rsvp_item, error_msg = verify_rsvp_ownership(
            event_id, attendee_id, attendee_type, volunteer_email
        )
        
        if not is_authorized:
            return {
                'statusCode': 403,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': error_msg
                })
            }
        
        # Delete RSVP record (Requirement 6.1, 6.2)
        success, error_msg = delete_rsvp_record(event_id, attendee_id)
        
        if not success:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': error_msg
                })
            }
        
        # Calculate hours before event (Requirement 6.5)
        hours_before_event = calculate_hours_before_event(event_id)
        
        # Build response (Requirement 6.5)
        response_data = {
            'success': True,
            'message': 'RSVP cancelled successfully',
            'attendee_id': attendee_id,
            'attendee_type': attendee_type
        }
        
        if hours_before_event is not None:
            response_data['hours_before_event'] = hours_before_event
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(response_data, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': 'Internal server error'
            })
        }
