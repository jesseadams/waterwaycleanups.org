import json
import os
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from datetime import datetime, date, timezone

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
minors_table_name = os.environ.get('MINORS_TABLE_NAME')
session_table_name = os.environ.get('SESSION_TABLE_NAME')
waivers_table_name = os.environ.get('WAIVERS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')

volunteers_table = dynamodb.Table(volunteers_table_name)
minors_table = dynamodb.Table(minors_table_name)
waivers_table = dynamodb.Table(waivers_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
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

def calculate_age_from_dob(date_of_birth_str):
    """Calculate current age from date of birth string (YYYY-MM-DD)"""
    try:
        dob = datetime.strptime(date_of_birth_str, '%Y-%m-%d').date()
        today = date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return age
    except:
        return None

def verify_admin_access(event):
    """Verify admin access from request context or headers"""
    # Try to get session token from Authorization header
    headers = event.get('headers', {})
    auth_header = headers.get('Authorization') or headers.get('authorization')
    
    print(f"Headers received: {headers}")
    print(f"Auth header: {auth_header}")
    
    if not auth_header:
        raise Exception('Unauthorized: No session token provided')
    
    # Extract token from "Bearer <token>" format
    session_token = auth_header.replace('Bearer ', '').strip()
    print(f"Session token: {session_token[:20]}..." if len(session_token) > 20 else session_token)
    
    # Validate session using DynamoDB resource API
    try:
        session_table = dynamodb.Table(session_table_name)
        response = session_table.get_item(
            Key={'session_token': session_token}
        )
        
        print(f"Session lookup response: {response}")
        
        if 'Item' not in response:
            raise Exception('Unauthorized: Invalid session token')
        
        session = response['Item']
        email = session.get('email', '')
        is_admin = session.get('isAdmin', 'false')
        
        print(f"Session found - Email: {email}, isAdmin: {is_admin}")
        
        if is_admin != 'true':
            raise Exception('Forbidden: Admin access required')
        
        return {'email': email, 'isAdmin': is_admin}
        
    except Exception as e:
        print(f"Session validation error: {str(e)}")
        if 'Forbidden' in str(e) or 'Unauthorized' in str(e):
            raise
        raise Exception(f'Unauthorized: Session validation failed - {str(e)}')

def load_all_events():
    """Load all events and build a lookup dict."""
    events = {}
    response = events_table.scan()
    for item in response.get('Items', []):
        events[item['event_id']] = item
    while 'LastEvaluatedKey' in response:
        response = events_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        for item in response.get('Items', []):
            events[item['event_id']] = item
    return events


def load_all_rsvps():
    """Load all RSVPs and group by email."""
    by_email = {}
    response = rsvps_table.scan()
    items = response.get('Items', [])
    while 'LastEvaluatedKey' in response:
        response = rsvps_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response.get('Items', []))
    for rsvp in items:
        email = rsvp.get('email', '').lower()
        if email:
            by_email.setdefault(email, []).append(rsvp)
    return by_email


def compute_engagement(rsvps, events_lookup):
    """Compute engagement metrics for a volunteer's RSVPs."""
    now = datetime.now(timezone.utc)
    attended = 0
    cancelled = 0
    no_shows = 0
    future_rsvps = 0

    # For streak calculation: collect attended public event dates
    attended_public_dates = []

    for rsvp in rsvps:
        status = rsvp.get('status', 'active')
        event_id = rsvp.get('event_id', '')
        event = events_lookup.get(event_id, {})
        is_private = event.get('private', False)

        if status == 'attended':
            attended += 1
            if not is_private:
                start_time = event.get('start_time')
                if start_time:
                    try:
                        dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                        attended_public_dates.append(dt)
                    except Exception:
                        pass
        elif status == 'cancelled':
            cancelled += 1
        elif status == 'no_show' or rsvp.get('no_show'):
            no_shows += 1
        elif status == 'active':
            # Check if event is in the future
            start_time = event.get('start_time')
            if start_time:
                try:
                    dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                    if dt > now:
                        future_rsvps += 1
                except Exception:
                    pass

    # Calculate longest consecutive attendance streak of public events
    # Sort by date, then find longest run of consecutive events
    streak = 0
    if attended_public_dates:
        # Get all public event dates sorted
        all_public_dates = []
        for eid, ev in events_lookup.items():
            if not ev.get('private', False) and ev.get('start_time'):
                try:
                    dt = datetime.fromisoformat(ev['start_time'].replace('Z', '+00:00'))
                    # Only consider past events
                    if dt <= now:
                        all_public_dates.append((dt, eid))
                except Exception:
                    pass
        all_public_dates.sort(key=lambda x: x[0])

        attended_set = set()
        for dt in attended_public_dates:
            # Match to nearest event
            for evt_dt, eid in all_public_dates:
                if abs((evt_dt - dt).total_seconds()) < 86400:  # within a day
                    attended_set.add(eid)
                    break

        # Walk through chronological public events and find longest streak
        current_streak = 0
        for _, eid in all_public_dates:
            if eid in attended_set:
                current_streak += 1
                streak = max(streak, current_streak)
            else:
                current_streak = 0

    # Compute engagement score (0-100)
    total_rsvps = attended + cancelled + no_shows
    if total_rsvps == 0:
        score = 10 if future_rsvps > 0 else 0
    else:
        attendance_rate = attended / total_rsvps
        reliability = 1.0 - (cancelled + no_shows) / total_rsvps
        score = int(
            (attendance_rate * 40) +          # 40% weight: attendance rate
            (min(streak, 10) / 10 * 25) +     # 25% weight: streak (capped at 10)
            (min(attended, 20) / 20 * 20) +   # 20% weight: total events (capped at 20)
            (reliability * 10) +               # 10% weight: reliability
            (min(future_rsvps, 3) / 3 * 5)    # 5% weight: future commitment
        )
        score = max(0, min(100, score))

    # Compute uncapped points — accumulate forever
    points = (
        (attended * 10) +          # 10 pts per event attended
        (streak * 5) +             # 5 pts per streak length
        (future_rsvps * 3) -       # 3 pts per upcoming RSVP
        (cancelled * 2) -          # -2 pts per cancellation
        (no_shows * 5)             # -5 pts per no-show
    )
    points = max(0, points)

    return {
        'events_attended': attended,
        'cancellations': cancelled,
        'no_shows': no_shows,
        'future_rsvps': future_rsvps,
        'streak': streak,
        'engagement_score': score,
        'points': points
    }


def get_volunteers_with_minors():
    """Get all volunteers with their associated minors and waiver status"""
    # Scan volunteers table
    volunteers_response = volunteers_table.scan()
    volunteers = volunteers_response.get('Items', [])
    
    # Handle pagination if needed
    while 'LastEvaluatedKey' in volunteers_response:
        volunteers_response = volunteers_table.scan(
            ExclusiveStartKey=volunteers_response['LastEvaluatedKey']
        )
        volunteers.extend(volunteers_response.get('Items', []))
    
    # For each volunteer, fetch their minors and waiver status
    volunteers_with_minors = []
    for volunteer in volunteers:
        email = volunteer.get('email')
        
        # Fetch waiver status
        try:
            waiver_response = waivers_table.query(
                KeyConditionExpression=Key('email').eq(email),
                Limit=1
            )
            items = waiver_response.get('Items', [])
            if items:
                waiver = items[0]
                volunteer['has_waiver'] = True
                volunteer['waiver_signed_at'] = waiver.get('signed_at', '')
            else:
                volunteer['has_waiver'] = False
                volunteer['waiver_signed_at'] = None
        except Exception as e:
            print(f"Error fetching waiver for {email}: {str(e)}")
            volunteer['has_waiver'] = False
            volunteer['waiver_signed_at'] = None
        
        # Fetch minors
        try:
            # Query minors by guardian_email (not parent_email)
            minors_response = minors_table.query(
                KeyConditionExpression=Key('guardian_email').eq(email)
            )
            minors = minors_response.get('Items', [])
            
            # Calculate current age for each minor if not present or outdated
            for minor in minors:
                if 'date_of_birth' in minor:
                    # Always recalculate age from date_of_birth for current age
                    current_age = calculate_age_from_dob(minor['date_of_birth'])
                    if current_age is not None:
                        minor['age'] = current_age
            
            volunteer['minors'] = convert_decimals(minors)
        except Exception as e:
            print(f"Error fetching minors for {email}: {str(e)}")
            volunteer['minors'] = []
        
        volunteers_with_minors.append(convert_decimals(volunteer))
    
    return volunteers_with_minors

def handler(event, context):
    """Lambda handler for admin volunteers endpoint"""
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS request for CORS
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    try:
        # Verify admin access
        verify_admin_access(event)
        
        # Only support GET method
        if event.get('httpMethod') != 'GET':
            return {
                'statusCode': 405,
                'headers': headers,
                'body': json.dumps({'error': 'Method not allowed'})
            }
        
        # Get volunteers with minors
        volunteers = get_volunteers_with_minors()

        # Load events and RSVPs for engagement metrics
        try:
            events_lookup = load_all_events()
            rsvps_by_email = load_all_rsvps()
            for vol in volunteers:
                email = vol.get('email', '').lower()
                vol_rsvps = rsvps_by_email.get(email, [])
                vol['engagement'] = compute_engagement(vol_rsvps, events_lookup)
        except Exception as e:
            print(f"Error computing engagement metrics: {e}")
            # Non-fatal — volunteers still returned without metrics
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'volunteers': volunteers,
                'total': len(volunteers)
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error in admin-volunteers: {str(e)}")
        
        error_message = str(e)
        status_code = 500
        
        if 'Unauthorized' in error_message:
            status_code = 401
        elif 'Forbidden' in error_message:
            status_code = 403
        
        return {
            'statusCode': status_code,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'error': error_message
            })
        }
