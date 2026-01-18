import json
import os
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from datetime import datetime, date

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
minors_table_name = os.environ.get('MINORS_TABLE_NAME')
session_table_name = os.environ.get('SESSION_TABLE_NAME')
waivers_table_name = os.environ.get('WAIVERS_TABLE_NAME')

volunteers_table = dynamodb.Table(volunteers_table_name)
minors_table = dynamodb.Table(minors_table_name)
waivers_table = dynamodb.Table(waivers_table_name)

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
