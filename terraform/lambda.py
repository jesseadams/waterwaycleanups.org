import json
import os
import boto3
import re
import traceback

# Get environment variables
CONTACT_LIST_NAME = os.environ.get('CONTACT_LIST_NAME', 'WaterwayCleanups')
TOPIC_NAME = os.environ.get('TOPIC_NAME', 'volunteer')
REGION_NAME = os.environ.get('REGION_NAME', 'us-east-1')
SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN', '')

# Initialize SESv2 and SNS clients with explicit region
ses = boto3.client('sesv2', region_name=REGION_NAME)
sns = boto3.client('sns', region_name=REGION_NAME)

def validate_email(email):
    """Validate email format using regex"""
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(email_regex, email) is not None

def create_cors_response(status_code, body):
    """Create a response with CORS headers"""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'OPTIONS,POST',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body)
    }

def send_sns_notification(ip_address, form_data, result_message):
    """Send SNS notification with form submission details"""
    if not SNS_TOPIC_ARN:
        print("SNS_TOPIC_ARN environment variable not set. Skipping SNS notification.")
        return False
    
    try:
        # Create message with all relevant information
        subject = f"New Volunteer Form Submission from {form_data.get('first_name', '')} {form_data.get('last_name', '')}"
        
        message = f"""
New Volunteer Form Submission

IP Address: {ip_address}

Form Fields:
- First Name: {form_data.get('first_name', '')}
- Last Name: {form_data.get('last_name', '')}
- Email: {form_data.get('email', '')}

Result Message: {result_message}
        """
        
        response = sns.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=subject,
            Message=message
        )
        print(f"SNS notification sent: {response['MessageId']}")
        return True
    except Exception as e:
        print(f"Error sending SNS notification: {str(e)}")
        return False

def handler(event, context):
    """Lambda handler function"""
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        return create_cors_response(200, {'message': 'CORS preflight successful'})
    
    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event.get('body', '{}'))
        else:
            body = event.get('body', {})
        
        # Extract IP address from request context
        ip_address = "Unknown"
        if event.get('requestContext') and event['requestContext'].get('identity'):
            ip_address = event['requestContext']['identity'].get('sourceIp', 'Unknown')
        
        # Extract fields
        first_name = body.get('first_name', '').strip()
        last_name = body.get('last_name', '').strip()
        email = body.get('email', '').strip().lower()
        
        # Validate required fields
        if not first_name:
            error_message = 'First name is required'
            send_sns_notification(ip_address, body, f"Error: {error_message}")
            return create_cors_response(400, {
                'error': 'Missing required field',
                'message': error_message
            })
        
        if not last_name:
            error_message = 'Last name is required'
            send_sns_notification(ip_address, body, f"Error: {error_message}")
            return create_cors_response(400, {
                'error': 'Missing required field',
                'message': error_message
            })
        
        if not email:
            error_message = 'Email is required'
            send_sns_notification(ip_address, body, f"Error: {error_message}")
            return create_cors_response(400, {
                'error': 'Missing required field',
                'message': error_message
            })
        
        # Validate email format
        if not validate_email(email):
            error_message = 'Please provide a valid email address'
            send_sns_notification(ip_address, body, f"Error: {error_message}")
            return create_cors_response(400, {
                'error': 'Invalid email format',
                'message': error_message
            })
        
        # Add contact to SES list
        try:
            contact_data = {
                'EmailAddress': email,
                'TopicPreferences': [
                    {
                        'TopicName': TOPIC_NAME,
                        'SubscriptionStatus': 'OPT_IN'
                    }
                ],
                'AttributesData': json.dumps({
                    'firstName': first_name,
                    'lastName': last_name
                })
            }
            
            # Create contact list if it doesn't exist already
            try:
                ses.create_contact_list(
                    ContactListName=CONTACT_LIST_NAME,
                    Topics=[
                        {
                            'TopicName': TOPIC_NAME,
                            'DisplayName': 'Volunteer Opportunities',
                            'Description': 'Volunteer opportunities and updates',
                            'DefaultSubscriptionStatus': 'OPT_OUT'
                        }
                    ]
                )
                print(f"Contact list {CONTACT_LIST_NAME} created")
            except ses.exceptions.BadRequestException as e:
                # Contact list already exists, we can proceed
                if "A maximum of 1 Lists allowed per account" in str(e):
                    print(f"Contact list {CONTACT_LIST_NAME} already exists")
                    pass
                else:
                    raise
            
            try:
                # Create or update contact with SESv2 API
                ses.create_contact(
                    ContactListName=CONTACT_LIST_NAME,
                    EmailAddress=email,
                    TopicPreferences=contact_data['TopicPreferences'],
                    AttributesData=contact_data['AttributesData']
                )
                print(f"Contact {email} added to list {CONTACT_LIST_NAME}")
                message = "You are now on our list of volunteers. We will be in touch soon."
            except ses.exceptions.AlreadyExistsException:
                message = "You are already subscribed to our volunteer list. "
            
            # Send SNS notification for successful form submission
            send_sns_notification(ip_address, body, message)
            
            return create_cors_response(200, {
                'success': True,
                'message': message,
                'data': {
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': email
                }
            })
            
        except Exception as e:
            error_trace = traceback.format_exc()
            error_message = f"Error adding contact to SES: {str(e)}"
            print(error_message)
            print(f"Error trace: {error_trace}")
            print(f"SES Region: {REGION_NAME}")
            print(f"Contact List: {CONTACT_LIST_NAME}")
            print(f"Topic: {TOPIC_NAME}")
            
            # Send SNS notification for SES error
            send_sns_notification(ip_address, body, f"Service Error: {str(e)}")
            
            return create_cors_response(500, {
                'error': 'Service Error',
                'message': 'Unable to process your request. Please try again later.'
            })
            
    except Exception as e:
        error_trace = traceback.format_exc()
        error_message = f"Error processing request: {str(e)}"
        print(error_message)
        print(f"Error trace: {error_trace}")
        print(f"Event: {json.dumps(event)}")
        
        # Send SNS notification for server error
        try:
            error_body = {}
            if isinstance(event.get('body'), str):
                try:
                    error_body = json.loads(event.get('body', '{}'))
                except:
                    error_body = {"raw_body": event.get('body', '')}
            
            ip_address = "Unknown"
            if event.get('requestContext') and event['requestContext'].get('identity'):
                ip_address = event['requestContext']['identity'].get('sourceIp', 'Unknown')
                
            send_sns_notification(ip_address, error_body, f"Server Error: {str(e)}")
        except:
            print("Failed to send error notification")
        
        return create_cors_response(500, {
            'error': 'Server Error',
            'message': 'An error occurred while processing your request'
        })
