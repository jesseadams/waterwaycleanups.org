import json
import os
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
events_table = dynamodb.Table(events_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)

def handler(event, context):
    """
    Lambda function to get RSVPs for a specific event with volunteer details
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Set default response headers for CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
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
            event_response = events_table.get_item(Key={'event_id': event_id})
            if 'Item' not in event_response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': f'Event {event_id} not found'})
                }
            
            event_data = event_response['Item']
        except ClientError as e:
            print(f"Error checking event: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to check event'})
            }
        
        # Get all RSVPs for this event
        try:
            rsvps_response = rsvps_table.query(
                KeyConditionExpression=Key('event_id').eq(event_id)
            )
            rsvps = rsvps_response.get('Items', [])
            
            # Enrich RSVPs with volunteer information
            enriched_rsvps = []
            for rsvp in rsvps:
                try:
                    # Get volunteer details
                    volunteer_response = volunteers_table.get_item(
                        Key={'email': rsvp['email']}
                    )
                    
                    if 'Item' in volunteer_response:
                        volunteer = volunteer_response['Item']
                        enriched_rsvp = {
                            # RSVP data
                            'event_id': rsvp['event_id'],
                            'email': rsvp['email'],
                            'status': rsvp.get('status', 'active'),
                            'created_at': rsvp.get('created_at'),
                            'updated_at': rsvp.get('updated_at'),
                            'cancelled_at': rsvp.get('cancelled_at'),
                            'hours_before_event': rsvp.get('hours_before_event'),
                            'additional_comments': rsvp.get('additional_comments'),
                            # Volunteer data
                            'volunteer_name': volunteer.get('full_name', f"{volunteer.get('first_name', '')} {volunteer.get('last_name', '')}").strip(),
                            'volunteer_first_name': volunteer.get('first_name'),
                            'volunteer_last_name': volunteer.get('last_name'),
                            'volunteer_phone': volunteer.get('phone'),
                            'volunteer_emergency_contact': volunteer.get('emergency_contact'),
                            'volunteer_dietary_restrictions': volunteer.get('dietary_restrictions'),
                            'volunteer_experience': volunteer.get('volunteer_experience')
                        }
                    else:
                        # Volunteer not found, use RSVP data only
                        enriched_rsvp = {
                            'event_id': rsvp['event_id'],
                            'email': rsvp['email'],
                            'status': rsvp.get('status', 'active'),
                            'created_at': rsvp.get('created_at'),
                            'updated_at': rsvp.get('updated_at'),
                            'cancelled_at': rsvp.get('cancelled_at'),
                            'hours_before_event': rsvp.get('hours_before_event'),
                            'additional_comments': rsvp.get('additional_comments'),
                            'volunteer_name': rsvp['email'],  # Fallback to email
                            'volunteer_first_name': None,
                            'volunteer_last_name': None,
                            'volunteer_phone': None,
                            'volunteer_emergency_contact': None,
                            'volunteer_dietary_restrictions': None,
                            'volunteer_experience': None
                        }
                    
                    enriched_rsvps.append(enriched_rsvp)
                    
                except ClientError as e:
                    print(f"Error getting volunteer {rsvp['email']}: {e.response['Error']['Message']}")
                    # Continue with other RSVPs
                    continue
            
            # Sort RSVPs by creation date
            enriched_rsvps.sort(key=lambda x: x.get('created_at', ''))
            
            # Calculate statistics
            total_rsvps = len(enriched_rsvps)
            active_rsvps = len([r for r in enriched_rsvps if r.get('status') == 'active'])
            cancelled_rsvps = len([r for r in enriched_rsvps if r.get('status') == 'cancelled'])
            no_show_rsvps = len([r for r in enriched_rsvps if r.get('status') == 'no_show'])
            attended_rsvps = len([r for r in enriched_rsvps if r.get('status') == 'attended'])
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'event': event_data,
                    'rsvps': enriched_rsvps,
                    'statistics': {
                        'total_rsvps': total_rsvps,
                        'active_rsvps': active_rsvps,
                        'cancelled_rsvps': cancelled_rsvps,
                        'no_show_rsvps': no_show_rsvps,
                        'attended_rsvps': attended_rsvps,
                        'attendance_cap': event_data.get('attendance_cap', 50)
                    },
                    'success': True
                }, cls=DecimalEncoder)
            }
            
        except ClientError as e:
            print(f"Error getting RSVPs: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to retrieve RSVPs'})
            }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }