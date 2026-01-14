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
auth_table = dynamodb.Table(auth_table_name)
sessions_table = dynamodb.Table(sessions_table_name)

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
        
        # Store session in DynamoDB
        sessions_table.put_item(
            Item={
                'session_token': session_token,
                'email': email,
                'expires_at': session_expiry.isoformat(),
                'created_at': datetime.utcnow().isoformat()
            }
        )
        
        # Delete used validation code
        auth_table.delete_item(
            Key={'email': email}
        )
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': 'Authentication successful',
                'session_token': session_token,
                'expires_at': session_expiry.isoformat(),
                'email': email
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }