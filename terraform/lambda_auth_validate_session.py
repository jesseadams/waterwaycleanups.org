import json
import os
import boto3
from datetime import datetime
from botocore.exceptions import ClientError

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
sessions_table_name = os.environ.get('SESSIONS_TABLE_NAME')
sessions_table = dynamodb.Table(sessions_table_name)

def handler(event, context):
    """
    Lambda function to validate session token
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
        
        # Get session from DynamoDB
        response = sessions_table.get_item(
            Key={'session_token': session_token}
        )
        
        if 'Item' not in response:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid session token', 'valid': False})
            }
        
        item = response['Item']
        
        # Check if session is expired
        expires_at = datetime.fromisoformat(item['expires_at'].replace('Z', '+00:00'))
        if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
            # Delete expired session
            sessions_table.delete_item(
                Key={'session_token': session_token}
            )
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'error': 'Session has expired', 'valid': False})
            }
        
        # Check if user is admin
        email = item['email']
        admin_emails = [
            'admin@waterwaycleanups.org',
            'contact@waterwaycleanups.org',
            'jesse@techno-geeks.org',
            'jesse@waterwaycleanups.org',
        ]
        is_admin = email.lower() in [admin_email.lower() for admin_email in admin_emails]
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'valid': True,
                'email': email,
                'expires_at': item['expires_at'],
                'isAdmin': is_admin
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'valid': False})
        }