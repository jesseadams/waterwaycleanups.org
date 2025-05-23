import json
import os
import boto3
import re
import traceback

# Get environment variables
CONTACT_LIST_NAME = os.environ.get('CONTACT_LIST_NAME', 'WaterwayCleanups')
TOPIC_NAME = os.environ.get('TOPIC_NAME', 'volunteer')
REGION_NAME = os.environ.get('REGION_NAME', 'us-east-1')

# Initialize SESv2 client with explicit region
ses = boto3.client('sesv2', region_name=REGION_NAME)

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
        
        # Extract fields
        first_name = body.get('first_name', '').strip()
        last_name = body.get('last_name', '').strip()
        email = body.get('email', '').strip().lower()
        
        # Validate required fields
        if not first_name:
            return create_cors_response(400, {
                'error': 'Missing required field',
                'message': 'First name is required'
            })
        
        if not last_name:
            return create_cors_response(400, {
                'error': 'Missing required field',
                'message': 'Last name is required'
            })
        
        if not email:
            return create_cors_response(400, {
                'error': 'Missing required field',
                'message': 'Email is required'
            })
        
        # Validate email format
        if not validate_email(email):
            return create_cors_response(400, {
                'error': 'Invalid email format',
                'message': 'Please provide a valid email address'
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
                    'FirstName': first_name,
                    'LastName': last_name
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
            print("FOOBAR")
            print(f"Error adding contact to SES: {str(e)}")
            print(f"Error trace: {error_trace}")
            print(f"SES Region: {REGION_NAME}")
            print(f"Contact List: {CONTACT_LIST_NAME}")
            print(f"Topic: {TOPIC_NAME}")
            return create_cors_response(500, {
                'error': 'Service Error',
                'message': 'Unable to process your request. Please try again later.'
            })
            
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Error processing request: {str(e)}")
        print(f"Error trace: {error_trace}")
        print(f"Event: {json.dumps(event)}")
        return create_cors_response(500, {
            'error': 'Server Error',
            'message': 'An error occurred while processing your request'
        })
