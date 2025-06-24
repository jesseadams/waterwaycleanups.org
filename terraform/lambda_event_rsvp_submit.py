import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from datetime import datetime

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('RSVP_TABLE_NAME')
table = dynamodb.Table(table_name)

# Initialize SNS client
sns = boto3.client('sns')
sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')

# Default attendance cap
DEFAULT_ATTENDANCE_CAP = 15

def handler(event, context):
    """
    Lambda function to submit an RSVP for an event
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
        
        # Check if the request contains all required parameters
        required_fields = ['event_id', 'first_name', 'last_name', 'email']
        missing_fields = [field for field in required_fields if field not in body]
        
        if missing_fields:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': f'Missing required parameters: {", ".join(missing_fields)}',
                    'success': False
                })
            }

        event_id = body['event_id']
        first_name = body['first_name']
        last_name = body['last_name']
        email = body['email']
        attendance_cap = body.get('attendance_cap', DEFAULT_ATTENDANCE_CAP)
        
        # Check if user is already registered
        try:
            existing_rsvp = table.get_item(
                Key={
                    'event_id': event_id,
                    'email': email
                }
            )
            
            if 'Item' in existing_rsvp:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'error': 'You have already registered for this event',
                        'success': False
                    })
                }
        except ClientError as e:
            print(f"Error checking existing RSVP: {e.response['Error']['Message']}")
            
        # Check if event is at capacity
        response = table.query(
            KeyConditionExpression=Key('event_id').eq(event_id)
        )
        
        current_rsvp_count = len(response.get('Items', []))
        
        if current_rsvp_count >= attendance_cap:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': 'This event has reached its maximum capacity',
                    'rsvp_count': current_rsvp_count,
                    'attendance_cap': attendance_cap,
                    'success': False
                })
            }
        
        # Add the RSVP to DynamoDB
        timestamp = datetime.utcnow().isoformat()
        
        item = {
            'event_id': event_id,
            'email': email,
            'first_name': first_name,
            'last_name': last_name,
            'created_at': timestamp,
            'updated_at': timestamp
        }
        
        # Add any optional fields
        for key, value in body.items():
            if key not in ['event_id', 'email', 'first_name', 'last_name'] and value:
                item[key] = value
        
        table.put_item(Item=item)
        
        # Send SNS notification
        message = {
            'event_id': event_id,
            'first_name': first_name,
            'last_name': last_name,
            'email': email,
            'timestamp': timestamp,
            'rsvp_count': current_rsvp_count + 1,
            'attendance_cap': attendance_cap
        }
        
        sns.publish(
            TopicArn=sns_topic_arn,
            Subject=f"New RSVP for event: {event_id}",
            Message=json.dumps(message, indent=2)
        )
        
        # Return success response
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': 'RSVP submitted successfully',
                'event_id': event_id,
                'email': email,
                'rsvp_count': current_rsvp_count + 1,
                'attendance_cap': attendance_cap,
                'success': True
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': str(e),
                'success': False
            })
        }
