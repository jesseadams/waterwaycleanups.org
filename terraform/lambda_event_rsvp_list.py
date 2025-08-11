import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from decimal import Decimal

# Custom JSON encoder to handle Decimal types from DynamoDB
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            if o % 1 == 0:
                return int(o)
            else:
                return float(o)
        return super(DecimalEncoder, self).default(o)

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('RSVP_TABLE_NAME')
table = dynamodb.Table(table_name)

def handler(event, context):
    """
    Lambda function to list all RSVPs for an event
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
            'body': json.dumps({'message': 'CORS preflight successful'}, cls=DecimalEncoder)
        }
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        
        # Check if the request contains the required parameters
        if 'event_id' not in body:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameter: event_id'}, cls=DecimalEncoder)
            }

        event_id = body['event_id']
        
        # Query DynamoDB to get all RSVPs for this event
        response = table.query(
            KeyConditionExpression=Key('event_id').eq(event_id)
        )
        
        # Get all RSVPs for this event
        rsvps = response.get('Items', [])
        
        # Process RSVPs to ensure consistent format
        processed_rsvps = []
        for rsvp in rsvps:
            processed_rsvp = {
                'email': rsvp.get('email', ''),
                'event_id': rsvp.get('event_id', event_id),
                'rsvp_date': rsvp.get('created_at', rsvp.get('submission_date', rsvp.get('rsvp_date', ''))),
                'first_name': rsvp.get('first_name', ''),
                'last_name': rsvp.get('last_name', '')
            }
            # Include any additional fields that might exist
            for key, value in rsvp.items():
                if key not in ['email', 'event_id', 'created_at', 'submission_date', 'rsvp_date']:
                    processed_rsvp[key] = value
            processed_rsvps.append(processed_rsvp)
        
        # Sort by email for consistent ordering
        processed_rsvps.sort(key=lambda x: x.get('email', ''))
                
        # Return the response
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'event_id': event_id,
                'rsvp_count': len(processed_rsvps),
                'rsvps': processed_rsvps,
                'success': True
            }, cls=DecimalEncoder)
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False}, cls=DecimalEncoder)
        }
