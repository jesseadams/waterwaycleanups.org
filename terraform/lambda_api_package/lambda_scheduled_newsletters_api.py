import json
import os
import boto3
from datetime import datetime, timezone
import uuid
from decimal import Decimal
import pytz

# Set up logging
import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')

# Environment variables
TABLE_NAME = os.environ['DYNAMODB_TABLE_NAME']
REGION = os.environ['REGION']

# DynamoDB table
table = dynamodb.Table(TABLE_NAME)

# Eastern timezone
ET = pytz.timezone('US/Eastern')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def handler(event, context):
    """
    API Gateway Lambda handler for scheduled newsletters CRUD operations.
    """
    try:
        # Extract HTTP method and path
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        
        # Parse body if present
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({'error': 'Invalid JSON in request body'})
                }
        
        # Route based on method
        if http_method == 'POST':
            return create_scheduled_newsletter(body)
        elif http_method == 'GET':
            # Check if we're getting a specific newsletter or listing all
            if 'pathParameters' in event and event['pathParameters'] and 'id' in event['pathParameters']:
                return get_scheduled_newsletter(event['pathParameters']['id'])
            else:
                return list_scheduled_newsletters()
        elif http_method == 'PUT':
            if 'pathParameters' in event and event['pathParameters'] and 'id' in event['pathParameters']:
                return update_scheduled_newsletter(event['pathParameters']['id'], body)
            else:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({'error': 'Newsletter ID required for update'})
                }
        elif http_method == 'DELETE':
            if 'pathParameters' in event and event['pathParameters'] and 'id' in event['pathParameters']:
                return delete_scheduled_newsletter(event['pathParameters']['id'])
            else:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({'error': 'Newsletter ID required for deletion'})
                }
        elif http_method == 'OPTIONS':
            # Handle CORS preflight
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
                },
                'body': ''
            }
        else:
            return {
                'statusCode': 405,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Method not allowed'})
            }
            
    except Exception as e:
        logger.error(f"Error in handler: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }

def get_recipient_count(contact_list, topic=None):
    """
    Get the count of recipients for a contact list and optional topic.
    """
    try:
        sesv2 = boto3.client('sesv2', region_name=REGION)
        
        # Get contacts from the list
        next_token = None
        total_count = 0
        
        while True:
            params = {
                'ContactListName': contact_list,
                'PageSize': 100
            }
            
            if next_token:
                params['NextToken'] = next_token
            
            response = sesv2.list_contacts(**params)
            
            # Count contacts based on topic subscription
            for contact in response.get('Contacts', []):
                if topic:
                    # Check if contact is subscribed to the specific topic
                    topic_preferences = contact.get('TopicPreferences', [])
                    for pref in topic_preferences:
                        if pref.get('TopicName') == topic and pref.get('SubscriptionStatus') == 'OPT_IN':
                            total_count += 1
                            break
                else:
                    # No topic specified, count all contacts
                    total_count += 1
            
            # Check if there are more contacts
            next_token = response.get('NextToken')
            if not next_token:
                break
        
        return total_count
    except Exception as e:
        logger.error(f"Error getting recipient count: {str(e)}")
        return 0

def create_scheduled_newsletter(data):
    """
    Create a new scheduled newsletter.
    """
    try:
        # Validate required fields
        required_fields = ['templateName', 'contactList', 'scheduledTime']
        for field in required_fields:
            if field not in data:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({'error': f'Missing required field: {field}'})
                }
        
        # Parse and validate scheduled time
        try:
            # Expect ISO format in UTC
            scheduled_time = datetime.fromisoformat(data['scheduledTime'].replace('Z', '+00:00'))
            
            # Convert to ET to check if it's within allowed hours
            scheduled_et = scheduled_time.astimezone(ET)
            
            # Check if scheduled hour is between 9 AM and 4 PM ET
            if scheduled_et.hour < 9 or scheduled_et.hour > 16:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Scheduled time must be between 9 AM and 4 PM Eastern Time',
                        'scheduled_hour_et': scheduled_et.hour
                    })
                }
            
            # Check if scheduled time is in the future
            if scheduled_time <= datetime.now(timezone.utc):
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({'error': 'Scheduled time must be in the future'})
                }
                
        except Exception as e:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': f'Invalid scheduled time format: {str(e)}'})
            }
        
        # Generate unique ID
        newsletter_id = str(uuid.uuid4())
        
        # Get recipient count
        recipient_count = get_recipient_count(
            data['contactList'], 
            data.get('topic')
        )
        
        # Create item
        item = {
            'id': newsletter_id,
            'templateName': data['templateName'],
            'contactList': data['contactList'],
            'scheduledTime': scheduled_time.isoformat(),
            'status': 'pending',
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'createdBy': data.get('createdBy', 'unknown'),
            'fromEmail': data.get('fromEmail', 'Waterway Cleanups <info@waterwaycleanups.org>'),
            'templateData': data.get('templateData', {}),
            'topic': data.get('topic'),
            'recipientCount': recipient_count
        }
        
        # Store in DynamoDB
        table.put_item(Item=item)
        
        logger.info(f"Created scheduled newsletter: {newsletter_id}")
        
        return {
            'statusCode': 201,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(item, cls=DecimalEncoder)
        }
        
    except Exception as e:
        logger.error(f"Error creating scheduled newsletter: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }

def get_scheduled_newsletter(newsletter_id):
    """
    Get a specific scheduled newsletter by ID.
    """
    try:
        response = table.get_item(Key={'id': newsletter_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Newsletter not found'})
            }
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response['Item'], cls=DecimalEncoder)
        }
        
    except Exception as e:
        logger.error(f"Error getting scheduled newsletter: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }

def list_scheduled_newsletters():
    """
    List all scheduled newsletters.
    """
    try:
        # Scan the table (in production, you might want to add pagination)
        response = table.scan()
        items = response.get('Items', [])
        
        # Sort by scheduled time
        items.sort(key=lambda x: x.get('scheduledTime', ''), reverse=True)
        
        # Convert scheduled times to ET for display and ensure recipient count
        for item in items:
            if 'scheduledTime' in item:
                scheduled_utc = datetime.fromisoformat(item['scheduledTime'])
                scheduled_et = scheduled_utc.astimezone(ET)
                item['scheduledTimeET'] = scheduled_et.strftime('%Y-%m-%d %I:%M %p %Z')
            
            # If recipientCount is missing (for old items), calculate it
            if 'recipientCount' not in item and item.get('status') == 'pending':
                item['recipientCount'] = get_recipient_count(
                    item.get('contactList', ''),
                    item.get('topic')
                )
                # Update the item in DynamoDB with the count
                try:
                    table.update_item(
                        Key={'id': item['id']},
                        UpdateExpression='SET recipientCount = :count',
                        ExpressionAttributeValues={':count': item['recipientCount']}
                    )
                except:
                    pass  # Don't fail the list operation if update fails
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'newsletters': items,
                'count': len(items)
            }, cls=DecimalEncoder)
        }
        
    except Exception as e:
        logger.error(f"Error listing scheduled newsletters: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }

def update_scheduled_newsletter(newsletter_id, data):
    """
    Update a scheduled newsletter (only if status is 'pending').
    """
    try:
        # First, get the current item to check status
        response = table.get_item(Key={'id': newsletter_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Newsletter not found'})
            }
        
        current_item = response['Item']
        
        # Only allow updates if status is pending
        if current_item.get('status') != 'pending':
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Can only update newsletters with pending status'})
            }
        
        # Build update expression
        update_expression = ['SET updatedAt = :updatedAt']
        expression_values = {':updatedAt': datetime.now(timezone.utc).isoformat()}
        
        # Update allowed fields
        allowed_fields = ['scheduledTime', 'templateName', 'contactList', 'topic', 'fromEmail', 'templateData']
        
        for field in allowed_fields:
            if field in data:
                if field == 'scheduledTime':
                    # Validate scheduled time
                    try:
                        scheduled_time = datetime.fromisoformat(data[field].replace('Z', '+00:00'))
                        scheduled_et = scheduled_time.astimezone(ET)
                        
                        if scheduled_et.hour < 9 or scheduled_et.hour > 16:
                            return {
                                'statusCode': 400,
                                'headers': {
                                    'Content-Type': 'application/json',
                                    'Access-Control-Allow-Origin': '*'
                                },
                                'body': json.dumps({
                                    'error': 'Scheduled time must be between 9 AM and 4 PM Eastern Time'
                                })
                            }
                        
                        if scheduled_time <= datetime.now(timezone.utc):
                            return {
                                'statusCode': 400,
                                'headers': {
                                    'Content-Type': 'application/json',
                                    'Access-Control-Allow-Origin': '*'
                                },
                                'body': json.dumps({'error': 'Scheduled time must be in the future'})
                            }
                        
                        data[field] = scheduled_time.isoformat()
                    except:
                        return {
                            'statusCode': 400,
                            'headers': {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*'
                            },
                            'body': json.dumps({'error': 'Invalid scheduled time format'})
                        }
                
                update_expression.append(f'{field} = :{field}')
                expression_values[f':{field}'] = data[field]
        
        # Perform update
        table.update_item(
            Key={'id': newsletter_id},
            UpdateExpression=', '.join(update_expression),
            ExpressionAttributeValues=expression_values
        )
        
        # Get and return updated item
        response = table.get_item(Key={'id': newsletter_id})
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response['Item'], cls=DecimalEncoder)
        }
        
    except Exception as e:
        logger.error(f"Error updating scheduled newsletter: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }

def delete_scheduled_newsletter(newsletter_id):
    """
    Delete a scheduled newsletter (only if status is 'pending').
    """
    try:
        # First, get the current item to check status
        response = table.get_item(Key={'id': newsletter_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Newsletter not found'})
            }
        
        current_item = response['Item']
        
        # Only allow deletion if status is pending
        if current_item.get('status') != 'pending':
            # Instead of deleting, update status to cancelled
            table.update_item(
                Key={'id': newsletter_id},
                UpdateExpression='SET #status = :status, cancelledAt = :cancelledAt',
                ExpressionAttributeNames={
                    '#status': 'status'
                },
                ExpressionAttributeValues={
                    ':status': 'cancelled',
                    ':cancelledAt': datetime.now(timezone.utc).isoformat()
                }
            )
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'message': 'Newsletter cancelled', 'id': newsletter_id})
            }
        
        # Delete the item
        table.delete_item(Key={'id': newsletter_id})
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'message': 'Newsletter deleted', 'id': newsletter_id})
        }
        
    except Exception as e:
        logger.error(f"Error deleting scheduled newsletter: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }
