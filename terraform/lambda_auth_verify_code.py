import json
import os
import boto3
import uuid
from datetime import datetime, timedelta
from botocore.exceptions import ClientError

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
auth_table_name = os.environ.get('AUTH_TABLE_NAME')
sessions_table_name = os.environ.get('SESSIONS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
auth_table = dynamodb.Table(auth_table_name)
sessions_table = dynamodb.Table(sessions_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name) if volunteers_table_name else None


def get_profile_status(email):
    """
    Return (profile_complete, first_name, last_name) for the given email by
    looking up the volunteers table. A profile is considered complete only when
    a non-empty first_name is on record. This lets the frontend prompt new
    users for their name before they continue (e.g. to RSVP).
    """
    if not volunteers_table:
        return True, '', ''  # Fail open: don't block login if table not configured
    try:
        resp = volunteers_table.get_item(Key={'email': email})
        item = resp.get('Item')
        if not item:
            return False, '', ''
        first_name = (item.get('first_name') or '').strip()
        last_name = (item.get('last_name') or '').strip()
        return bool(first_name), first_name, last_name
    except Exception as e:
        print(f"Error checking volunteer profile for {email}: {e}")
        # Fail open so a lookup error never blocks authentication
        return True, '', ''

def handler(event, context):
    """
    Lambda function to verify validation code and create session
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
        
        if 'email' not in body or 'validation_code' not in body:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameters: email, validation_code'})
            }

        email = body['email'].lower().strip()
        validation_code = body['validation_code']
        
        # Get validation code from DynamoDB
        response = auth_table.get_item(
            Key={'email': email}
        )
        
        if 'Item' not in response:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid or expired validation code'})
            }
        
        item = response['Item']
        
        # Check if code matches
        if item['validation_code'] != validation_code:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid validation code'})
            }
        
        # Check if code is expired
        expiration_time = datetime.fromisoformat(item['expiration_time'].replace('Z', '+00:00'))
        if datetime.utcnow().replace(tzinfo=expiration_time.tzinfo) > expiration_time:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Validation code has expired'})
            }
        
        # Create session
        session_token = str(uuid.uuid4())
        session_expiry = datetime.utcnow() + timedelta(hours=24)
        
        # Check if user is admin
        admin_emails = [
            'jesse@techno-geeks.org',
            'admin@waterwaycleanups.org'
        ]
        is_admin = 'true' if email in admin_emails else 'false'
        
        # Store session in DynamoDB
        sessions_table.put_item(
            Item={
                'session_token': session_token,
                'email': email,
                'expires_at': session_expiry.isoformat(),
                'created_at': datetime.utcnow().isoformat(),
                'isAdmin': is_admin
            }
        )
        
        # Delete used validation code
        auth_table.delete_item(
            Key={'email': email}
        )

        # Determine whether this user already has a name on file. If not, the
        # frontend will prompt for it before continuing (e.g. before RSVP) so
        # we never create a nameless SES contact / volunteer record.
        profile_complete, first_name, last_name = get_profile_status(email)

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': 'Authentication successful',
                'session_token': session_token,
                'expires_at': session_expiry.isoformat(),
                'email': email,
                'isAdmin': is_admin,
                'profile_complete': profile_complete,
                'first_name': first_name,
                'last_name': last_name
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }