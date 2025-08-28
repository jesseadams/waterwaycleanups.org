import json
import os
import boto3
from datetime import datetime, timedelta, timezone
import pytz
import logging
from decimal import Decimal
import uuid

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
sesv2_client = boto3.client('sesv2')

# Environment variables
TABLE_NAME = os.environ['DYNAMODB_TABLE_NAME']
SOURCE_EMAIL = os.environ.get('SOURCE_EMAIL', 'Waterway Cleanups <info@waterwaycleanups.org>')
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
    Lambda handler to process scheduled newsletters.
    Runs hourly between 9 AM and 4 PM ET.
    """
    try:
        # Get current time in Eastern Time
        now_et = datetime.now(ET)
        now_utc = datetime.now(timezone.utc)
        
        logger.info(f"Processing scheduled newsletters at {now_et.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        
        # Check if we're within operating hours (9 AM - 4 PM ET)
        if now_et.hour < 9 or now_et.hour >= 16:
            logger.info(f"Outside operating hours (current hour: {now_et.hour}). Skipping processing.")
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Outside operating hours'})
            }
        
        # Calculate time window (5 minutes buffer before and after current time)
        window_start = now_utc - timedelta(minutes=5)
        window_end = now_utc + timedelta(minutes=5)
        
        # Query for pending newsletters within the time window
        response = table.query(
            IndexName='scheduledTime-index',
            KeyConditionExpression='#status = :status AND scheduledTime BETWEEN :start AND :end',
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': 'pending',
                ':start': window_start.isoformat(),
                ':end': window_end.isoformat()
            }
        )
        
        newsletters = response.get('Items', [])
        logger.info(f"Found {len(newsletters)} newsletters to process")
        
        processed_count = 0
        error_count = 0
        
        for newsletter in newsletters:
            try:
                # Process individual newsletter
                result = process_newsletter(newsletter)
                
                if result['success']:
                    processed_count += 1
                    # Update status to sent
                    table.update_item(
                        Key={'id': newsletter['id']},
                        UpdateExpression='SET #status = :status, sentAt = :sentAt, recipientCount = :count',
                        ExpressionAttributeNames={
                            '#status': 'status'
                        },
                        ExpressionAttributeValues={
                            ':status': 'sent',
                            ':sentAt': now_utc.isoformat(),
                            ':count': result.get('recipientCount', 0)
                        }
                    )
                else:
                    error_count += 1
                    # Update status to failed
                    table.update_item(
                        Key={'id': newsletter['id']},
                        UpdateExpression='SET #status = :status, #error = :error, failedAt = :failedAt',
                        ExpressionAttributeNames={
                            '#status': 'status',
                            '#error': 'error'
                        },
                        ExpressionAttributeValues={
                            ':status': 'failed',
                            ':error': result.get('error', 'Unknown error'),
                            ':failedAt': now_utc.isoformat()
                        }
                    )
                    
            except Exception as e:
                logger.error(f"Error processing newsletter {newsletter.get('id')}: {str(e)}")
                error_count += 1
                
                # Update status to failed
                try:
                    table.update_item(
                        Key={'id': newsletter['id']},
                        UpdateExpression='SET #status = :status, #error = :error, failedAt = :failedAt',
                        ExpressionAttributeNames={
                            '#status': 'status',
                            '#error': 'error'
                        },
                        ExpressionAttributeValues={
                            ':status': 'failed',
                            ':error': str(e),
                            ':failedAt': now_utc.isoformat()
                        }
                    )
                except Exception as update_error:
                    logger.error(f"Failed to update error status: {str(update_error)}")
        
        logger.info(f"Processing complete. Processed: {processed_count}, Failed: {error_count}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Processing complete',
                'processed': processed_count,
                'failed': error_count
            }, cls=DecimalEncoder)
        }
        
    except Exception as e:
        logger.error(f"Error in handler: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def process_newsletter(newsletter):
    """
    Process a single newsletter - send emails to all recipients.
    """
    try:
        template_name = newsletter.get('templateName')
        contact_list = newsletter.get('contactList')
        topic = newsletter.get('topic')
        from_email = newsletter.get('fromEmail', SOURCE_EMAIL)
        template_data = newsletter.get('templateData', {})
        
        # If template_data is a string, parse it
        if isinstance(template_data, str):
            try:
                template_data = json.loads(template_data)
            except:
                template_data = {}
        
        logger.info(f"Processing newsletter {newsletter['id']} with template {template_name}")
        
        # Get contacts from the contact list
        recipients = get_filtered_contacts(contact_list, topic)
        
        if not recipients:
            return {
                'success': False,
                'error': 'No recipients found for the specified criteria'
            }
        
        logger.info(f"Sending to {len(recipients)} recipients")
        
        # Send emails in batches (SES has limits)
        batch_size = 50  # SES v2 allows up to 50 destinations per SendEmail call
        sent_count = 0
        
        for i in range(0, len(recipients), batch_size):
            batch = recipients[i:i + batch_size]
            
            for recipient in batch:
                try:
                    # Get contact attributes
                    contact_attributes = get_contact_attributes(contact_list, recipient)
                    
                    # Merge template data with contact attributes
                    merged_data = {**template_data, **contact_attributes}
                    
                    # Send individual email with merged data
                    sesv2_client.send_email(
                        FromEmailAddress=from_email,
                        Destination={
                            'ToAddresses': [recipient]
                        },
                        Content={
                            'Template': {
                                'TemplateName': template_name,
                                'TemplateData': json.dumps(merged_data)
                            }
                        },
                        ListManagementOptions={
                            'ContactListName': contact_list,
                            'TopicName': topic
                        } if topic else None
                    )
                    
                    sent_count += 1
                    
                except Exception as e:
                    logger.error(f"Failed to send to {recipient}: {str(e)}")
        
        return {
            'success': True,
            'recipientCount': sent_count
        }
        
    except Exception as e:
        logger.error(f"Error processing newsletter: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

def get_filtered_contacts(contact_list, topic=None):
    """
    Get contacts from a contact list, optionally filtered by topic.
    """
    contacts = []
    next_token = None
    
    try:
        while True:
            # List contacts
            params = {
                'ContactListName': contact_list,
                'PageSize': 100
            }
            
            if next_token:
                params['NextToken'] = next_token
            
            response = sesv2_client.list_contacts(**params)
            
            # Filter by topic if specified
            if topic:
                for contact in response.get('Contacts', []):
                    # Check if contact is opted into the topic
                    topic_preferences = contact.get('TopicPreferences', [])
                    for pref in topic_preferences:
                        if pref.get('TopicName') == topic and pref.get('SubscriptionStatus') == 'OPT_IN':
                            contacts.append(contact['EmailAddress'])
                            break
            else:
                # No topic filter, include all contacts
                contacts.extend([c['EmailAddress'] for c in response.get('Contacts', [])])
            
            # Check if there are more contacts
            next_token = response.get('NextToken')
            if not next_token:
                break
                
        return contacts
        
    except Exception as e:
        logger.error(f"Error getting contacts: {str(e)}")
        return []

def get_contact_attributes(contact_list, email_address):
    """
    Get attributes for a specific contact.
    """
    try:
        response = sesv2_client.get_contact(
            ContactListName=contact_list,
            EmailAddress=email_address
        )
        
        # Parse attributes data
        attributes_data = response.get('AttributesData', '{}')
        if attributes_data:
            try:
                attributes = json.loads(attributes_data)
                return convert_snake_case_to_camel_case(attributes)
            except:
                return {}
        
        return {}
        
    except Exception as e:
        logger.error(f"Error getting contact attributes for {email_address}: {str(e)}")
        return {}

def convert_snake_case_to_camel_case(obj):
    """
    Convert snake_case keys to camelCase.
    """
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            camel_key = ''.join(word.capitalize() if i else word for i, word in enumerate(key.split('_')))
            camel_key = camel_key[0].lower() + camel_key[1:] if camel_key else ''
            
            if isinstance(value, dict):
                result[camel_key] = convert_snake_case_to_camel_case(value)
            else:
                result[camel_key] = value
            
            # Also keep the original snake_case key
            if camel_key != key:
                result[key] = value
                
        return result
    
    return obj
