import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('RSVP_TABLE_NAME')
table = dynamodb.Table(table_name)

def handler(event, context):
    """
    Lambda function to check RSVP status for an event
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Set default response headers for CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        'Access-Control-Max-Age': '86400'  # 24 hours cache for preflight requests
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
        
        # Check if the request contains the required parameters
        if 'event_id' not in body:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameter: event_id'})
            }

        event_id = body['event_id']
        
        # Query DynamoDB to get count of RSVPs for this event
        response = table.query(
            KeyConditionExpression=Key('event_id').eq(event_id)
        )
        
        # Count the number of RSVPs for this event
        rsvp_count = len(response.get('Items', []))
        
        # Get the specific RSVP if email is provided
        user_registered = False
        if 'email' in body:
            email = body['email']
            try:
                item_response = table.get_item(
                    Key={
                        'event_id': event_id,
                        'email': email
                    }
                )
                user_registered = 'Item' in item_response
            except ClientError as e:
                print(f"Error checking specific RSVP: {e.response['Error']['Message']}")
                
        # Return the response
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'event_id': event_id,
                'rsvp_count': rsvp_count,
                'user_registered': user_registered,
                'success': True
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }
