"""
Lambda function to add a minor to a volunteer's account
"""
import json
import boto3
import os
from datetime import datetime, date
from uuid import uuid4
from decimal import Decimal

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
    """Lambda handler for adding a minor"""
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
        
        # Validate required fields
        required_fields = ['first_name', 'last_name', 'date_of_birth']
        missing_fields = [field for field in required_fields if not body.get(field)]
        
        if missing_fields:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': f"Missing required fields: {', '.join(missing_fields)}"
                })
            }
        
        # Validate date of birth format
        date_of_birth = body['date_of_birth']
        try:
            datetime.strptime(date_of_birth, '%Y-%m-%d')
        except ValueError:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Invalid date of birth format. Please use YYYY-MM-DD format.'
                })
            }
        
        # Calculate age and verify they are a minor
        age = calculate_age(date_of_birth)
        if age >= 18:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Only minors (under 18 years old) can be added to your account.'
                })
            }
        
        # Validate email format if provided
        email = body.get('email', '').strip()
        if email:
            if '@' not in email or '.' not in email.split('@')[1]:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'message': 'Invalid email format'
                    })
                }
            email = email.lower()
        
        print(f"Adding minor for guardian: {guardian_email}")
        
        # Create minor record
        minor_id = str(uuid4())
        created_at = datetime.utcnow().isoformat() + 'Z'
        
        item = {
            'guardian_email': guardian_email,
            'minor_id': minor_id,
            'first_name': body['first_name'],
            'last_name': body['last_name'],
            'date_of_birth': date_of_birth,
            'age': age,
            'created_at': created_at,
            'updated_at': created_at
        }
        
        if email:
            item['email'] = email
        
        # Save to DynamoDB
        minors_table.put_item(Item=item)
        print(f"Minor record saved successfully: {minor_id}")
        
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
        
        # Return success response
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': 'Minor added successfully',
                'minor': {
                    'minor_id': minor_id,
                    'first_name': item['first_name'],
                    'last_name': item['last_name'],
                    'date_of_birth': item['date_of_birth'],
                    'age': age,
                    'email': email if email else None
                }
            })
        }
        
    except Exception as e:
        print(f"Error adding minor: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'message': 'Internal server error'})
        }
