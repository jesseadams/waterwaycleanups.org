"""
Lambda function to list minors attached to a volunteer's account
"""
import json
import boto3
import os
from datetime import datetime, date

dynamodb = boto3.resource('dynamodb')
minors_table = dynamodb.Table(os.environ.get('MINORS_TABLE_NAME', 'minors'))
session_table = dynamodb.Table(os.environ.get('SESSION_TABLE_NAME', 'auth_sessions'))

def calculate_age(date_of_birth_str):
    """Calculate age from date of birth string (YYYY-MM-DD)"""
    dob = datetime.strptime(date_of_birth_str, '%Y-%m-%d').date()
    today = date.today()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return age

def validate_session(session_token):
    """Validate session token and return session data"""
    try:
        # Query directly using session_token as the primary key
        response = session_table.get_item(
            Key={'session_token': session_token}
        )
        
        session = response.get('Item')
        if not session:
            return None
        
        # Check if session has expired
        expires_at = datetime.fromisoformat(session['expires_at'].replace('Z', '+00:00'))
        if expires_at <= datetime.now(expires_at.tzinfo):
            return None
        
        return session
    except Exception as e:
        print(f"Error validating session: {e}")
        return None

def handler(event, context):
    """Lambda handler for listing minors"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS request for CORS
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
    if event.get('httpMethod') != 'POST':
        return {
            'statusCode': 405,
            'headers': headers,
            'body': json.dumps({'success': False, 'message': 'Method Not Allowed'})
        }
    
    try:
        body = json.loads(event.get('body', '{}'))
        
        # Validate session token
        session_token = body.get('session_token')
        if not session_token:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'success': False, 'message': 'Session token is required'})
            }
        
        # Validate session
        session = validate_session(session_token)
        if not session:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'success': False, 'message': 'Invalid or expired session'})
            }
        
        guardian_email = session['email']
        
        print(f"Fetching minors for guardian: {guardian_email}")
        
        # Query minors by guardian email
        response = minors_table.query(
            KeyConditionExpression='guardian_email = :email',
            ExpressionAttributeValues={':email': guardian_email}
        )
        
        minors = response.get('Items', [])
        
        # Update ages and format response
        formatted_minors = []
        for minor in minors:
            current_age = calculate_age(minor['date_of_birth'])
            
            formatted_minor = {
                'minor_id': minor['minor_id'],
                'first_name': minor['first_name'],
                'last_name': minor['last_name'],
                'date_of_birth': minor['date_of_birth'],
                'age': current_age,
                'email': minor.get('email'),
                'created_at': minor['created_at'],
                'updated_at': minor['updated_at']
            }
            formatted_minors.append(formatted_minor)
        
        # Sort by creation date (newest first)
        formatted_minors.sort(key=lambda x: x['created_at'], reverse=True)
        
        # Update session last accessed time (optional - session_token is the key)
        try:
            session_table.update_item(
                Key={'session_token': session_token},
                UpdateExpression='SET last_accessed = :last_accessed',
                ExpressionAttributeValues={
                    ':last_accessed': datetime.utcnow().isoformat() + 'Z'
                }
            )
        except:
            pass  # Non-critical if this fails
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'minors': formatted_minors,
                'count': len(formatted_minors)
            })
        }
        
    except Exception as e:
        print(f"Error listing minors: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'message': 'Internal server error'})
        }
