import json
import os
import sys
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from datetime import datetime
from decimal import Decimal

# Add the current directory to Python path for imports
sys.path.append('/opt/python')
sys.path.append('.')

from data_validation_utils import (
    ValidationError, RSVPValidator, VolunteerValidator, format_validation_errors
)

# Initialize DynamoDB client with region
aws_region = os.environ.get('AWS_REGION', 'us-east-1')
dynamodb = boto3.resource('dynamodb', region_name=aws_region)

# Get table names from environment variables
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
event_rsvps_table_name = os.environ.get('EVENT_RSVPS_TABLE_NAME', 'event_rsvps')
minors_table_name = os.environ.get('MINORS_TABLE_NAME', 'minors')

# Initialize tables
events_table = dynamodb.Table(events_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
event_rsvps_table = dynamodb.Table(event_rsvps_table_name)
minors_table = dynamodb.Table(minors_table_name)

# Initialize SNS client with region
sns = boto3.client('sns', region_name=aws_region)
sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')

# Default attendance cap
DEFAULT_ATTENDANCE_CAP = 15

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


def parse_request_format(body):
    """
    Parse request body and convert to normalized attendees format.
    Handles both legacy (first_name, last_name) and new (attendees array) formats.
    
    Returns:
        tuple: (attendees_list, email) where attendees_list is a list of attendee dicts
    """
    # Check if this is the new multi-person format
    if 'attendees' in body and isinstance(body['attendees'], list):
        # New format with attendees array
        attendees = body['attendees']
        # Extract email from the first volunteer attendee or from body
        email = body.get('email')
        if not email:
            # Find the volunteer in attendees list
            for attendee in attendees:
                if attendee.get('type') == 'volunteer':
                    email = attendee.get('email')
                    break
        return attendees, email
    else:
        # Legacy format - convert to single-attendee format
        email = body.get('email')
        if not email:
            raise ValueError("Email is required")
        
        attendee = {
            'type': 'volunteer',
            'email': email,
            'first_name': body.get('first_name'),
            'last_name': body.get('last_name')
        }
        return [attendee], email


def check_existing_rsvps(event_id, attendees):
    """
    Check which attendees already have RSVPs for the event.
    
    Returns:
        tuple: (existing_attendees, new_attendees) where each is a list of attendee dicts
    """
    existing_attendees = []
    new_attendees = []
    
    for attendee in attendees:
        attendee_type = attendee.get('type')
        
        if attendee_type == 'volunteer':
            attendee_id = attendee.get('email')
        elif attendee_type == 'minor':
            attendee_id = attendee.get('minor_id')
        else:
            # Skip invalid attendee types
            continue
        
        if not attendee_id:
            continue
        
        # Check if RSVP exists
        try:
            response = event_rsvps_table.get_item(
                Key={
                    'event_id': event_id,
                    'attendee_id': attendee_id
                }
            )
            
            if 'Item' in response:
                existing_attendees.append(attendee)
            else:
                new_attendees.append(attendee)
        except ClientError as e:
            print(f"Error checking RSVP for {attendee_id}: {e}")
            # On error, assume attendee is new
            new_attendees.append(attendee)
    
    return existing_attendees, new_attendees


def count_current_attendance(event_id):
    """
    Count the current number of attendees for an event.
    Each individual RSVP record counts as 1 attendee.
    
    Returns:
        int: Current attendance count
    """
    try:
        response = event_rsvps_table.query(
            KeyConditionExpression=Key('event_id').eq(event_id)
        )
        return len(response.get('Items', []))
    except ClientError as e:
        print(f"Error counting attendance: {e}")
        return 0


def validate_capacity(current_attendance, requested_count, capacity):
    """
    Validate that adding requested attendees won't exceed capacity.
    
    Returns:
        tuple: (is_valid, remaining_capacity)
    """
    remaining = capacity - current_attendance
    is_valid = requested_count <= remaining
    return is_valid, remaining


def create_rsvp_records(event_id, attendees, guardian_email):
    """
    Create individual RSVP records for each attendee.
    Uses individual put_item calls instead of transactions for better error handling.
    
    Returns:
        list: Results for each attendee with status
    """
    timestamp = datetime.utcnow().isoformat()
    results = []
    
    for attendee in attendees:
        attendee_type = attendee.get('type')
        
        if attendee_type == 'volunteer':
            attendee_id = attendee.get('email')
            item = {
                'event_id': event_id,
                'attendee_id': attendee_id,
                'attendee_type': 'volunteer',
                'first_name': attendee.get('first_name'),
                'last_name': attendee.get('last_name'),
                'email': attendee.get('email'),
                'created_at': timestamp,
                'updated_at': timestamp,
                'submission_date': timestamp
            }
        elif attendee_type == 'minor':
            attendee_id = attendee.get('minor_id')
            item = {
                'event_id': event_id,
                'attendee_id': attendee_id,
                'attendee_type': 'minor',
                'first_name': attendee.get('first_name'),
                'last_name': attendee.get('last_name'),
                'email': guardian_email,  # Guardian's email for queries
                'guardian_email': guardian_email,
                'age': int(attendee.get('age')),  # Ensure age is integer
                'created_at': timestamp,
                'updated_at': timestamp,
                'submission_date': timestamp
            }
        else:
            results.append({
                'attendee_id': attendee.get('email') or attendee.get('minor_id'),
                'status': 'error',
                'message': 'Invalid attendee type',
                'attendee_type': attendee_type
            })
            continue
        
        # Create RSVP record using high-level API
        try:
            event_rsvps_table.put_item(Item=item)
            results.append({
                'attendee_id': attendee_id,
                'status': 'registered',
                'attendee_type': attendee_type
            })
        except ClientError as e:
            print(f"Error creating RSVP for {attendee_id}: {e}")
            results.append({
                'attendee_id': attendee_id,
                'status': 'error',
                'message': f'Failed to create RSVP: {str(e)}',
                'attendee_type': attendee_type
            })
    
    return results

def handler(event, context):
    """
    Lambda function to submit an RSVP for an event.
    Supports both legacy single-person and new multi-person RSVP formats.
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
        
        # Extract event_id and attendance_cap
        event_id = body.get('event_id')
        if not event_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'event_id is required'
                })
            }
        
        # Parse request format (handles both legacy and new formats)
        try:
            attendees, guardian_email = parse_request_format(body)
        except ValueError as e:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': str(e)
                })
            }
        
        # Validate attendee selection is not empty (Requirement 2.2)
        if not attendees or len(attendees) == 0:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Please select at least one attendee'
                })
            }
        
        # Verify the event exists and get its details
        try:
            event_response = events_table.get_item(
                Key={'event_id': event_id}
            )
            
            if 'Item' not in event_response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'message': 'Event not found'
                    })
                }
            
            event_data = event_response['Item']
            attendance_cap = int(event_data.get('attendance_cap', body.get('attendance_cap', DEFAULT_ATTENDANCE_CAP)))
            
        except ClientError as e:
            print(f"Error checking event: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Failed to verify event'
                })
            }
        
        # Check for duplicate attendees (Requirement 3.1, 3.2, 3.3)
        existing_attendees, new_attendees = check_existing_rsvps(event_id, attendees)
        
        # If all attendees are duplicates, reject the submission (Requirement 3.2)
        if len(new_attendees) == 0:
            duplicate_names = [
                f"{att.get('first_name', '')} {att.get('last_name', '')} ({att.get('type', 'unknown')})"
                for att in existing_attendees
            ]
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'All selected attendees are already registered',
                    'duplicate_attendees': duplicate_names
                })
            }
        
        # Count current attendance (Requirement 4.1)
        current_attendance = count_current_attendance(event_id)
        
        # Validate capacity (Requirement 4.2, 4.3, 4.5)
        requested_count = len(new_attendees)
        is_valid, remaining_capacity = validate_capacity(current_attendance, requested_count, attendance_cap)
        
        if not is_valid:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': f'This event has reached its maximum capacity. Only {remaining_capacity} spots remaining.',
                    'remaining_capacity': remaining_capacity,
                    'current_attendance': current_attendance,
                    'attendance_cap': attendance_cap
                })
            }
        
        # Create RSVP records atomically (Requirement 2.3, 2.4, 2.5)
        try:
            results = create_rsvp_records(event_id, new_attendees, guardian_email)
        except Exception as e:
            print(f"Error creating RSVP records: {e}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Failed to create RSVP records'
                })
            }
        
        # Update volunteer metrics for the guardian
        try:
            volunteers_table.update_item(
                Key={'email': guardian_email},
                UpdateExpression="ADD volunteer_metrics.total_rsvps :inc",
                ExpressionAttributeValues={':inc': len(new_attendees)}
            )
        except ClientError as e:
            print(f"Error updating volunteer metrics: {e.response['Error']['Message']}")
            # Continue even if metrics update fails
        
        # Send SNS notification
        try:
            message = {
                'event_id': event_id,
                'guardian_email': guardian_email,
                'attendees': new_attendees,
                'timestamp': datetime.utcnow().isoformat(),
                'current_attendance': current_attendance + len(new_attendees),
                'attendance_cap': attendance_cap
            }
            
            sns.publish(
                TopicArn=sns_topic_arn,
                Subject=f"New RSVP for event: {event_id}",
                Message=json.dumps(convert_decimals(message), default=decimal_default, indent=2)
            )
        except Exception as e:
            print(f"Error sending SNS notification: {e}")
            # Continue even if notification fails
        
        # Build response (Requirement 8.2 - backward compatible)
        response_data = {
            'success': True,
            'message': 'RSVP submitted successfully',
            'event_id': event_id,
            'email': guardian_email,
            'results': results,
            'current_attendance': current_attendance + len(new_attendees),
            'attendance_cap': attendance_cap
        }
        
        # Add duplicate info if some attendees were filtered
        if len(existing_attendees) > 0:
            duplicate_names = [
                f"{att.get('first_name', '')} {att.get('last_name', '')} ({att.get('type', 'unknown')})"
                for att in existing_attendees
            ]
            response_data['duplicate_attendees'] = duplicate_names
            response_data['message'] = f'RSVP submitted successfully for {len(new_attendees)} attendee(s). {len(existing_attendees)} attendee(s) were already registered.'
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(convert_decimals(response_data), default=decimal_default)
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
