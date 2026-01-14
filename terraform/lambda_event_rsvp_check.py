import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

# Get table names from environment variables
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
event_rsvps_table_name = os.environ.get('EVENT_RSVPS_TABLE_NAME', rsvps_table_name)

# Initialize tables
events_table = dynamodb.Table(events_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
event_rsvps_table = dynamodb.Table(event_rsvps_table_name)

def convert_decimals(obj):
    """
    Recursively convert Decimal objects to int/float for JSON serialization
    """
    if isinstance(obj, list):
        return [convert_decimals(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_decimals(value) for key, value in obj.items()}
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    else:
        return obj

def format_rsvp_record(rsvp_item):
    """
    Format RSVP record with complete attendee information.
    Handles legacy records without attendee_type field.
    
    Subtask 3.3: Format RSVP response with complete attendee information
    Subtask 3.5: Handle legacy RSVP records without attendee_type
    """
    # Handle legacy records - default attendee_type to "volunteer" if missing
    attendee_type = rsvp_item.get('attendee_type', 'volunteer')
    
    # Handle legacy records - default attendee_id to email if missing
    attendee_id = rsvp_item.get('attendee_id', rsvp_item.get('email'))
    
    formatted_rsvp = {
        'attendee_id': attendee_id,
        'attendee_type': attendee_type,
        'first_name': rsvp_item.get('first_name', ''),
        'last_name': rsvp_item.get('last_name', ''),
        'created_at': rsvp_item.get('created_at', rsvp_item.get('submission_date', ''))
    }
    
    # Include age for minor attendees
    if attendee_type == 'minor' and 'age' in rsvp_item:
        formatted_rsvp['age'] = rsvp_item['age']
    
    return formatted_rsvp


def query_guardian_rsvps(event_id, email):
    """
    Query all RSVPs for a volunteer and their minors.
    
    Subtask 3.1: Update check-event-rsvp Lambda to query by guardian email
    - Query RSVPs where email matches (volunteer RSVPs)
    - Query RSVPs using guardian-email-index (minor RSVPs)
    - Combine and return all RSVPs for the volunteer and their minors
    """
    all_rsvps = []
    
    # Query 1: Get volunteer's own RSVPs (where attendee is the volunteer)
    # Use the event_rsvps table with composite key (event_id, attendee_id)
    try:
        # Query by event_id and filter by email (for volunteer RSVPs)
        volunteer_response = event_rsvps_table.query(
            KeyConditionExpression=Key('event_id').eq(event_id),
            FilterExpression='email = :email AND (attribute_not_exists(attendee_type) OR attendee_type = :volunteer_type)',
            ExpressionAttributeValues={
                ':email': email,
                ':volunteer_type': 'volunteer'
            }
        )
        
        volunteer_rsvps = volunteer_response.get('Items', [])
        print(f"Found {len(volunteer_rsvps)} volunteer RSVPs for {email}")
        all_rsvps.extend(volunteer_rsvps)
        
    except ClientError as e:
        print(f"Error querying volunteer RSVPs: {e.response['Error']['Message']}")
    
    # Query 2: Get minor RSVPs where this volunteer is the guardian
    # Use the guardian-email-index GSI
    try:
        minor_response = event_rsvps_table.query(
            IndexName='guardian-email-index',
            KeyConditionExpression=Key('guardian_email').eq(email) & Key('event_id').eq(event_id)
        )
        
        minor_rsvps = minor_response.get('Items', [])
        print(f"Found {len(minor_rsvps)} minor RSVPs for guardian {email}")
        all_rsvps.extend(minor_rsvps)
        
    except ClientError as e:
        # GSI might not exist yet (during migration), log but don't fail
        print(f"Error querying minor RSVPs (GSI may not exist): {e.response['Error']['Message']}")
    
    return all_rsvps


def handler(event, context):
    """
    Lambda function to check RSVP status for an event.
    Enhanced to support multi-person RSVPs with guardian queries.
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
        
        # Check if the request contains the required parameters
        if 'event_id' not in body:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameter: event_id'})
            }

        event_id = body['event_id']
        
        # First verify the event exists
        try:
            event_response = events_table.get_item(
                Key={'event_id': event_id}
            )
            
            if 'Item' not in event_response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({
                        'error': 'Event not found',
                        'success': False
                    })
                }
        except ClientError as e:
            print(f"Error checking event: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'error': 'Failed to verify event',
                    'success': False
                })
            }
        
        # Query DynamoDB to get count of active RSVPs for this event
        # Use event_rsvps_table for multi-person support
        response = event_rsvps_table.query(
            KeyConditionExpression=Key('event_id').eq(event_id)
        )
        
        # Count only active RSVPs (not cancelled)
        active_rsvps = [item for item in response.get('Items', []) if item.get('status', 'active') == 'active']
        rsvp_count = len(active_rsvps)
        
        # Get the specific RSVPs if email is provided
        user_registered = False
        user_rsvps = []
        
        if 'email' in body:
            email = body['email']
            
            # Query all RSVPs for this volunteer and their minors
            guardian_rsvps = query_guardian_rsvps(event_id, email)
            
            # Filter only active RSVPs
            active_guardian_rsvps = [
                rsvp for rsvp in guardian_rsvps 
                if rsvp.get('status', 'active') == 'active'
            ]
            
            # Format each RSVP with complete attendee information
            user_rsvps = [format_rsvp_record(rsvp) for rsvp in active_guardian_rsvps]
            
            # User is registered if they have any active RSVPs
            user_registered = len(user_rsvps) > 0
            
            print(f"User {email} has {len(user_rsvps)} active RSVPs for event {event_id}")
                
        # Return the response
        response_body = {
            'event_id': event_id,
            'rsvp_count': rsvp_count,
            'user_registered': user_registered,
            'success': True
        }
        
        # Include user_rsvps array if email was provided
        if 'email' in body:
            response_body['user_rsvps'] = user_rsvps
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(convert_decimals(response_body))
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }
