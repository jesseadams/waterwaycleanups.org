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
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')

# Initialize tables
events_table = dynamodb.Table(events_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)

def decimal_default(obj):
    """
    JSON serializer for objects not serializable by default json code
    """
    if isinstance(obj, Decimal):
        # Convert Decimal to int if it's a whole number, otherwise to float
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def convert_decimals(obj):
    """
    Recursively convert Decimal objects to int/float in nested structures
    """
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

def get_volunteer_details(email):
    """
    Get volunteer details from the volunteers table
    """
    try:
        response = volunteers_table.get_item(
            Key={'email': email}
        )
        
        if 'Item' in response:
            return response['Item']
        else:
            # Return basic volunteer info if not found in volunteers table
            return {
                'email': email,
                'first_name': '',
                'last_name': '',
                'full_name': email
            }
            
    except ClientError as e:
        print(f"Error fetching volunteer {email}: {e}")
        return {
            'email': email,
            'first_name': '',
            'last_name': '',
            'full_name': email
        }

def handler(event, context):
    """
    Lambda function to list RSVPs for an event with volunteer details
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
            
            event_data = event_response['Item']
            
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
        
        # Query RSVPs for this event
        try:
            rsvp_response = rsvps_table.query(
                KeyConditionExpression=Key('event_id').eq(event_id)
            )
            
            rsvps_with_volunteers = []
            
            if rsvp_response.get('Items'):
                for rsvp in rsvp_response['Items']:
                    # Get volunteer details
                    volunteer_data = get_volunteer_details(rsvp.get('email', ''))
                    
                    # Combine RSVP and volunteer data
                    combined_data = convert_decimals({
                        # RSVP data
                        'event_id': rsvp.get('event_id', ''),
                        'email': rsvp.get('email', ''),
                        'status': rsvp.get('status', 'active'),
                        'created_at': rsvp.get('created_at', ''),
                        'updated_at': rsvp.get('updated_at', ''),
                        'cancelled_at': rsvp.get('cancelled_at', ''),
                        'hours_before_event': rsvp.get('hours_before_event', 0),
                        'additional_comments': rsvp.get('additional_comments', ''),
                        'no_show': rsvp.get('no_show', False),
                        'no_show_marked_at': rsvp.get('no_show_marked_at', ''),
                        
                        # Volunteer data (joined)
                        'first_name': volunteer_data.get('first_name', ''),
                        'last_name': volunteer_data.get('last_name', ''),
                        'full_name': volunteer_data.get('full_name', ''),
                        'phone': volunteer_data.get('phone', ''),
                        'emergency_contact': volunteer_data.get('emergency_contact', ''),
                        'dietary_restrictions': volunteer_data.get('dietary_restrictions', ''),
                        'volunteer_experience': volunteer_data.get('volunteer_experience', ''),
                        'how_did_you_hear': volunteer_data.get('how_did_you_hear', ''),
                        'volunteer_metrics': volunteer_data.get('volunteer_metrics', {})
                    })
                    
                    rsvps_with_volunteers.append(combined_data)
            
            # Sort RSVPs by creation date (most recent first)
            rsvps_with_volunteers.sort(key=lambda x: x.get('created_at', ''), reverse=True)
            
            # Calculate summary statistics
            total_rsvps = len(rsvps_with_volunteers)
            active_rsvps = len([r for r in rsvps_with_volunteers if r.get('status') == 'active'])
            cancelled_rsvps = len([r for r in rsvps_with_volunteers if r.get('status') == 'cancelled'])
            no_shows = len([r for r in rsvps_with_volunteers if r.get('no_show') == True])
            
            # Return the response
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'event_id': event_id,
                    'event_title': event_data.get('title', 'Unknown Event'),
                    'event_start_time': event_data.get('start_time', ''),
                    'event_location': event_data.get('location', {}),
                    'event_attendance_cap': event_data.get('attendance_cap', 0),
                    'rsvps': rsvps_with_volunteers,
                    'summary': {
                        'total_rsvps': total_rsvps,
                        'active_rsvps': active_rsvps,
                        'cancelled_rsvps': cancelled_rsvps,
                        'no_shows': no_shows
                    },
                    'success': True
                }, default=decimal_default)
            }
            
        except ClientError as e:
            print(f"Error querying RSVPs: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'error': 'Failed to retrieve RSVPs',
                    'success': False
                })
            }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }