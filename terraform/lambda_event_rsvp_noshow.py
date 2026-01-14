import json
import os
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

# Get table names from environment variables
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')

# Initialize tables
events_table = dynamodb.Table(events_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)

def handler(event, context):
    """
    Lambda function to mark RSVPs as no-shows (admin function)
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
        if 'event_id' not in body or 'email' not in body:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameters: event_id and email'})
            }

        event_id = body['event_id']
        email = body['email']
        no_show_status = body.get('no_show', True)  # Default to marking as no-show
        
        # TODO: Add admin authentication check here
        # For now, this is an admin-only function that should be protected
        
        # Check if the RSVP exists
        try:
            response = rsvps_table.get_item(
                Key={
                    'event_id': event_id,
                    'email': email
                }
            )
            
            if 'Item' not in response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': 'RSVP not found'})
                }
            
            existing_rsvp = response['Item']
            
            # Don't mark cancelled RSVPs as no-shows
            if existing_rsvp.get('status') == 'cancelled':
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'error': 'Cannot mark cancelled RSVP as no-show'})
                }
            
        except ClientError as e:
            print(f"Error checking existing RSVP: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to check existing RSVP'})
            }
        
        # Update the RSVP record with no-show information
        try:
            now = datetime.now(timezone.utc).isoformat()
            
            if no_show_status:
                # Mark as no-show
                update_expression = "SET no_show = :no_show, no_show_marked_at = :marked_at, updated_at = :updated_at"
                expression_attribute_values = {
                    ':no_show': True,
                    ':marked_at': now,
                    ':updated_at': now
                }
                
                # Update volunteer metrics
                try:
                    volunteers_table.update_item(
                        Key={'email': email},
                        UpdateExpression="ADD volunteer_metrics.total_no_shows :inc",
                        ExpressionAttributeValues={':inc': 1}
                    )
                except ClientError as e:
                    print(f"Error updating volunteer no-show metrics: {e.response['Error']['Message']}")
            else:
                # Remove no-show status (if correcting a mistake)
                update_expression = "SET no_show = :no_show, updated_at = :updated_at"
                expression_attribute_values = {
                    ':no_show': False,
                    ':updated_at': now
                }
            
            rsvps_table.update_item(
                Key={
                    'event_id': event_id,
                    'email': email
                },
                UpdateExpression=update_expression,
                ExpressionAttributeValues=expression_attribute_values
            )
            
            action = "marked as no-show" if no_show_status else "no-show status removed"
            print(f"Successfully {action} for {email} for event {event_id}")
            
            # Return success response
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'message': f'RSVP {action} successfully',
                    'event_id': event_id,
                    'email': email,
                    'no_show': no_show_status,
                    'updated_at': now
                })
            }
            
        except ClientError as e:
            print(f"Error updating RSVP: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to update no-show status'})
            }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }