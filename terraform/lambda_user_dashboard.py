import json
import os
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

# Get table names from environment variables
sessions_table_name = os.environ.get('SESSIONS_TABLE_NAME')
waivers_table_name = os.environ.get('WAIVER_TABLE_NAME')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')

# Initialize tables
sessions_table = dynamodb.Table(sessions_table_name)
waivers_table = dynamodb.Table(waivers_table_name)
events_table = dynamodb.Table(events_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)

def extract_event_date_from_event_data(event_data):
    """
    Extract event date from event data structure with improved parsing
    """
    try:
        if not event_data or 'start_time' not in event_data:
            print(f"Event data missing start_time: {event_data}")
            return None
            
        start_time = event_data['start_time']
        print(f"Processing start_time: '{start_time}'")
        
        # Parse ISO 8601 datetime string
        try:
            # Handle different ISO formats
            if start_time.endswith('Z'):
                start_time = start_time.replace('Z', '+00:00')
            elif '+' not in start_time and '-' not in start_time.split('T')[-1] and 'T' in start_time:
                # Add UTC timezone if missing (but don't double-add if timezone already exists)
                start_time = start_time + '+00:00'
            
            result_date = datetime.fromisoformat(start_time)
            print(f"Parsed date: {result_date}")
            return result_date
        except ValueError as e:
            print(f"Error parsing start_time '{start_time}': {e}")
            return None
            
    except Exception as e:
        print(f"Error extracting date from event data: {e}")
        return None

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

def format_event_display_date(event_data, extracted_date):
    """
    Format event date for display in dashboard
    """
    if not extracted_date:
        return "Date TBD"
    
    # For display, show formatted date and time
    return extracted_date.strftime("%B %d, %Y at %I:%M %p")

def get_event_details(event_id):
    """
    Get event details from the events table
    """
    try:
        response = events_table.get_item(
            Key={'event_id': event_id}
        )
        
        if 'Item' in response:
            return response['Item']
        else:
            print(f"Event {event_id} not found in events table")
            return None
            
    except ClientError as e:
        print(f"Error fetching event {event_id}: {e}")
        return None

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

def handler(event, context):
    """
    Lambda function to get user dashboard data
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
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        
        if 'session_token' not in body:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameter: session_token'})
            }

        session_token = body['session_token']
        
        # Validate session
        session_response = sessions_table.get_item(
            Key={'session_token': session_token}
        )
        
        if 'Item' not in session_response:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid session token'})
            }
        
        session = session_response['Item']
        
        # Check if session is expired
        expires_at = datetime.fromisoformat(session['expires_at'].replace('Z', '+00:00'))
        if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'error': 'Session has expired'})
            }
        
        email = session['email']
        
        # Get waiver status
        waiver_data = {'hasWaiver': False}
        try:
            # Query for all waivers for this email (since waiver_id is the range key)
            waiver_response = waivers_table.query(
                KeyConditionExpression=Key('email').eq(email)
            )
            
            if waiver_response.get('Items'):
                # Find the most recent valid waiver
                valid_waivers = []
                for waiver in waiver_response['Items']:
                    # Check if waiver is still valid (1 year from submission)
                    submission_date = datetime.fromisoformat(waiver['submission_date'].replace('Z', '+00:00'))
                    expiration_date = submission_date.replace(year=submission_date.year + 1)
                    
                    if datetime.utcnow().replace(tzinfo=expiration_date.tzinfo) < expiration_date:
                        valid_waivers.append({
                            'waiver_id': waiver['waiver_id'],
                            'submission_date': waiver['submission_date'],
                            'expiration_date': expiration_date.isoformat(),
                            'full_legal_name': waiver.get('full_legal_name', ''),
                            'submission_timestamp': submission_date.timestamp()
                        })
                
                if valid_waivers:
                    # Sort by submission date and get the most recent
                    most_recent_waiver = max(valid_waivers, key=lambda x: x['submission_timestamp'])
                    waiver_data = {
                        'hasWaiver': True,
                        'waiver_id': most_recent_waiver['waiver_id'],
                        'submissionDate': most_recent_waiver['submission_date'],
                        'expirationDate': most_recent_waiver['expiration_date'],
                        'fullLegalName': most_recent_waiver['full_legal_name'],
                        'totalWaivers': len(valid_waivers)
                    }
                    print(f"Found {len(valid_waivers)} valid waiver(s) for {email}")
                else:
                    print(f"No valid waivers found for {email} (found {len(waiver_response['Items'])} expired waivers)")
            else:
                print(f"No waivers found for {email}")
        except ClientError as e:
            print(f"Error fetching waiver: {e}")
            # Log the error details for debugging
            print(f"Error code: {e.response.get('Error', {}).get('Code', 'Unknown')}")
            print(f"Error message: {e.response.get('Error', {}).get('Message', 'Unknown')}")
        
        # Get RSVP history with proper joins to events table
        rsvps = []
        try:
            # Query RSVPs using the email index (new event_rsvps table schema)
            rsvp_response = rsvps_table.query(
                IndexName='email-index',
                KeyConditionExpression=Key('email').eq(email)
            )
            
            if rsvp_response.get('Items'):
                # Process and sort RSVPs by event date, filtering out cancelled ones
                for rsvp in rsvp_response['Items']:
                    try:
                        # Skip cancelled RSVPs for dashboard display
                        rsvp_status = rsvp.get('status', 'active')
                        if rsvp_status == 'cancelled':
                            continue
                        
                        # Get event details from events table
                        event_data = get_event_details(rsvp.get('event_id', ''))
                        
                        if not event_data:
                            print(f"Skipping RSVP for missing event: {rsvp.get('event_id', '')}")
                            continue
                        
                        # Extract event date for sorting and display
                        event_date = extract_event_date_from_event_data(event_data)
                        event_display_date = format_event_display_date(event_data, event_date)
                        
                        # Create attendee information
                        attendee_info = {
                            'attendee_id': rsvp.get('attendee_id', ''),
                            'attendee_type': rsvp.get('attendee_type', 'volunteer'),
                            'first_name': rsvp.get('first_name', ''),
                            'last_name': rsvp.get('last_name', ''),
                            'age': rsvp.get('age'),
                            'created_at': rsvp.get('created_at', '')
                        }
                        
                        # Create joined RSVP data with event information
                        processed_rsvp = convert_decimals({
                            # RSVP data
                            'event_id': rsvp.get('event_id', ''),
                            'email': rsvp.get('email', ''),
                            'status': rsvp_status,
                            'created_at': rsvp.get('created_at', ''),
                            'updated_at': rsvp.get('updated_at', ''),
                            'additional_comments': rsvp.get('additional_comments', ''),
                            'cancelled_at': rsvp.get('cancelled_at'),
                            'hours_before_event': rsvp.get('hours_before_event'),
                            
                            # Attendee information
                            'attendee': attendee_info,
                            
                            # Event data (joined)
                            'event_title': event_data.get('title', 'Unknown Event'),
                            'event_description': event_data.get('description', ''),
                            'event_start_time': event_data.get('start_time', ''),
                            'event_end_time': event_data.get('end_time', ''),
                            'event_location': event_data.get('location', {}),
                            'event_status': event_data.get('status', 'active'),
                            'event_attendance_cap': event_data.get('attendance_cap', 0),
                            
                            # Computed fields for sorting and display
                            'event_date': event_date.isoformat() if event_date else None,
                            'event_display_date': event_display_date,
                            'event_sort_timestamp': event_date.timestamp() if event_date else 0,
                            
                            # Legacy compatibility fields
                            'no_show': rsvp.get('status') == 'no_show',
                            'submission_date': rsvp.get('created_at', '')  # For backward compatibility
                        })
                        rsvps.append(processed_rsvp)
                        
                    except Exception as rsvp_error:
                        print(f"Error processing individual RSVP: {rsvp_error}")
                        # Continue processing other RSVPs even if one fails
                        continue
                
                # Group RSVPs by event_id
                grouped_rsvps = {}
                for rsvp in rsvps:
                    event_id = rsvp['event_id']
                    if event_id not in grouped_rsvps:
                        # First RSVP for this event - create the event entry
                        grouped_rsvps[event_id] = {
                            'event_id': event_id,
                            'event_title': rsvp['event_title'],
                            'event_description': rsvp['event_description'],
                            'event_start_time': rsvp['event_start_time'],
                            'event_end_time': rsvp['event_end_time'],
                            'event_location': rsvp['event_location'],
                            'event_status': rsvp['event_status'],
                            'event_attendance_cap': rsvp['event_attendance_cap'],
                            'event_date': rsvp['event_date'],
                            'event_display_date': rsvp['event_display_date'],
                            'event_sort_timestamp': rsvp['event_sort_timestamp'],
                            'status': rsvp['status'],
                            'created_at': rsvp['created_at'],
                            'attendees': []
                        }
                    # Add attendee to the event
                    grouped_rsvps[event_id]['attendees'].append(rsvp['attendee'])
                
                # Convert grouped dict to list and sort
                rsvps = list(grouped_rsvps.values())
                
                # Sort RSVPs chronologically by event start time (upcoming events first, then past events)
                try:
                    current_time = datetime.utcnow().timestamp()
                    
                    # Separate upcoming and past events
                    upcoming_events = []
                    past_events = []
                    
                    for rsvp in rsvps:
                        event_timestamp = rsvp.get('event_sort_timestamp', 0)
                        if event_timestamp >= current_time:
                            upcoming_events.append(rsvp)
                        else:
                            past_events.append(rsvp)
                    
                    # Sort upcoming events by start time (earliest first)
                    upcoming_events.sort(key=lambda x: x.get('event_sort_timestamp', 0))
                    
                    # Sort past events by start time (most recent first)
                    past_events.sort(key=lambda x: x.get('event_sort_timestamp', 0), reverse=True)
                    
                    # Combine: upcoming events first, then past events
                    rsvps = upcoming_events + past_events
                    
                except Exception as sort_error:
                    print(f"Error sorting RSVPs: {sort_error}")
                    # If sorting fails, just use the unsorted list
                
                total_attendees = sum(len(rsvp.get('attendees', [])) for rsvp in rsvps)
                print(f"Found {len(rsvps)} event(s) with {total_attendees} total attendee(s) for {email}")
            else:
                print(f"No RSVPs found for {email}")
                
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', 'Unknown')
            print(f"Error fetching RSVPs: {e}")
            print(f"Error code: {error_code}")
            print(f"Error message: {error_message}")
            
            # If the GSI doesn't exist or there's a validation error, try a scan as fallback
            if error_code in ['ValidationException', 'ResourceNotFoundException']:
                print("GSI might not exist, trying scan as fallback...")
                try:
                    scan_response = rsvps_table.scan(
                        FilterExpression=Key('email').eq(email)
                    )
                    print(f"Scan fallback found {len(scan_response.get('Items', []))} items")
                    
                    # Process scan results the same way
                    if scan_response.get('Items'):
                        for rsvp in scan_response['Items']:
                            try:
                                rsvp_status = rsvp.get('status', 'active')
                                if rsvp_status == 'cancelled':
                                    continue
                                
                                # Get event details from events table
                                event_data = get_event_details(rsvp.get('event_id', ''))
                                
                                if not event_data:
                                    continue
                                
                                event_date = extract_event_date_from_event_data(event_data)
                                event_display_date = format_event_display_date(event_data, event_date)
                                
                                processed_rsvp = convert_decimals({
                                    'event_id': rsvp.get('event_id', ''),
                                    'email': rsvp.get('email', ''),
                                    'status': rsvp_status,
                                    'created_at': rsvp.get('created_at', ''),
                                    'updated_at': rsvp.get('updated_at', ''),
                                    'event_title': event_data.get('title', 'Unknown Event'),
                                    'event_start_time': event_data.get('start_time', ''),
                                    'event_location': event_data.get('location', {}),
                                    'event_date': event_date.isoformat() if event_date else None,
                                    'event_display_date': event_display_date,
                                    'event_sort_timestamp': event_date.timestamp() if event_date else 0,
                                    'submission_date': rsvp.get('created_at', '')
                                })
                                rsvps.append(processed_rsvp)
                            except Exception:
                                continue
                        
                        # Apply the same sorting logic for fallback
                        try:
                            current_time = datetime.utcnow().timestamp()
                            upcoming_events = [r for r in rsvps if r.get('event_sort_timestamp', 0) >= current_time]
                            past_events = [r for r in rsvps if r.get('event_sort_timestamp', 0) < current_time]
                            
                            upcoming_events.sort(key=lambda x: x.get('event_sort_timestamp', 0))
                            past_events.sort(key=lambda x: x.get('event_sort_timestamp', 0), reverse=True)
                            
                            rsvps = upcoming_events + past_events
                        except Exception:
                            pass
                            
                except Exception as scan_error:
                    print(f"Scan fallback also failed: {scan_error}")
                    rsvps = []
            else:
                rsvps = []
        except Exception as e:
            print(f"Unexpected error fetching RSVPs: {e}")
            # Return empty RSVPs on any unexpected error
            rsvps = []
        
        response_data = {
            'success': True,
            'waiver': waiver_data,
            'rsvps': rsvps,
            'email': email
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(convert_decimals(response_data), default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }