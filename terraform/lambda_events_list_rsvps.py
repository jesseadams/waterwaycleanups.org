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
waivers_table_name = os.environ.get('WAIVERS_TABLE_NAME')
minors_table_name = os.environ.get('MINORS_TABLE_NAME')
events_table = dynamodb.Table(events_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)
waivers_table = dynamodb.Table(waivers_table_name)
minors_table = dynamodb.Table(minors_table_name) if minors_table_name else None

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
                        
                        # Check waiver status
                        has_waiver = False
                        if rsvp['email']:
                            try:
                                waiver_resp = waivers_table.query(
                                    KeyConditionExpression=Key('email').eq(rsvp['email']),
                                    Limit=1
                                )
                                has_waiver = len(waiver_resp.get('Items', [])) > 0
                            except ClientError as e:
                                print(f"Error checking waiver for {rsvp['email']}: {e}")
                        
                        enriched_rsvp = {
                            # RSVP data
                            'event_id': rsvp['event_id'],
                            'attendee_id': rsvp.get('attendee_id'),
                            'email': rsvp['email'],
                            'status': rsvp.get('status', 'active'),
                            'no_show': rsvp.get('no_show', False),
                            'walk_in': rsvp.get('walk_in', False),
                            'has_waiver': has_waiver,
                            'no_show_marked_at': rsvp.get('no_show_marked_at'),
                            'attendee_type': rsvp.get('attendee_type', 'volunteer'),
                            'guardian_email': rsvp.get('guardian_email'),
                            'date_of_birth': rsvp.get('date_of_birth'),
                            'created_at': rsvp.get('created_at'),
                            'updated_at': rsvp.get('updated_at'),
                            'cancelled_at': rsvp.get('cancelled_at'),
                            'hours_before_event': rsvp.get('hours_before_event'),
                            'additional_comments': rsvp.get('additional_comments'),
                            # Volunteer data — prefer RSVP names, fall back to volunteer table
                            'first_name': rsvp.get('first_name') or volunteer.get('first_name'),
                            'last_name': rsvp.get('last_name') or volunteer.get('last_name'),
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
                        has_waiver = False
                        if rsvp.get('email'):
                            try:
                                waiver_resp = waivers_table.query(
                                    KeyConditionExpression=Key('email').eq(rsvp['email']),
                                    Limit=1
                                )
                                has_waiver = len(waiver_resp.get('Items', [])) > 0
                            except ClientError as e:
                                print(f"Error checking waiver for {rsvp['email']}: {e}")
                        
                        enriched_rsvp = {
                            'event_id': rsvp['event_id'],
                            'attendee_id': rsvp.get('attendee_id'),
                            'email': rsvp['email'],
                            'status': rsvp.get('status', 'active'),
                            'no_show': rsvp.get('no_show', False),
                            'walk_in': rsvp.get('walk_in', False),
                            'has_waiver': has_waiver,
                            'no_show_marked_at': rsvp.get('no_show_marked_at'),
                            'attendee_type': rsvp.get('attendee_type', 'volunteer'),
                            'guardian_email': rsvp.get('guardian_email'),
                            'date_of_birth': rsvp.get('date_of_birth'),
                            'created_at': rsvp.get('created_at'),
                            'updated_at': rsvp.get('updated_at'),
                            'cancelled_at': rsvp.get('cancelled_at'),
                            'hours_before_event': rsvp.get('hours_before_event'),
                            'additional_comments': rsvp.get('additional_comments'),
                            'first_name': rsvp.get('first_name'),
                            'last_name': rsvp.get('last_name'),
                            'volunteer_name': rsvp['email'],
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
            
            # Fetch account-registered minors for each guardian
            account_minors_by_guardian = {}
            if minors_table:
                # Collect unique guardian emails (non-minor attendees with emails)
                guardian_emails = set()
                for rsvp in enriched_rsvps:
                    if rsvp.get('attendee_type') != 'minor' and rsvp.get('email'):
                        guardian_emails.add(rsvp['email'])
                
                # Collect emails of minors already RSVP'd to this event
                rsvpd_minor_ids = set()
                for rsvp in enriched_rsvps:
                    if rsvp.get('attendee_type') == 'minor':
                        # Use guardian_email + first_name + last_name as a rough dedup key
                        ge = (rsvp.get('guardian_email') or '').lower()
                        fn = (rsvp.get('first_name') or '').lower().strip()
                        ln = (rsvp.get('last_name') or '').lower().strip()
                        rsvpd_minor_ids.add(f"{ge}|{fn}|{ln}")
                
                for guardian_email in guardian_emails:
                    try:
                        minors_response = minors_table.query(
                            KeyConditionExpression=Key('guardian_email').eq(guardian_email)
                        )
                        minors_list = minors_response.get('Items', [])
                        if minors_list:
                            # Filter out minors already RSVP'd to this event
                            filtered = []
                            for m in minors_list:
                                dedup_key = f"{guardian_email.lower()}|{(m.get('first_name') or '').lower().strip()}|{(m.get('last_name') or '').lower().strip()}"
                                if dedup_key not in rsvpd_minor_ids:
                                    filtered.append({
                                        'minor_id': m.get('minor_id'),
                                        'first_name': m.get('first_name'),
                                        'last_name': m.get('last_name'),
                                        'date_of_birth': m.get('date_of_birth'),
                                        'email': m.get('email'),
                                        'guardian_email': guardian_email
                                    })
                            if filtered:
                                account_minors_by_guardian[guardian_email] = filtered
                    except ClientError as e:
                        print(f"Error fetching minors for {guardian_email}: {e}")
            
            # Calculate statistics
            total_rsvps = len(enriched_rsvps)
            active_rsvps = len([r for r in enriched_rsvps if r.get('status') == 'active'])
            cancelled_rsvps = len([r for r in enriched_rsvps if r.get('status') == 'cancelled'])
            no_show_rsvps = len([r for r in enriched_rsvps if r.get('no_show') == True])
            attended_rsvps = len([r for r in enriched_rsvps if r.get('status') == 'attended'])
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'event': event_data,
                    'rsvps': enriched_rsvps,
                    'account_minors': account_minors_by_guardian,
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