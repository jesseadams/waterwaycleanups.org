import json
import os
import boto3
import random
import string
from datetime import datetime, timedelta
from botocore.exceptions import ClientError

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
ses_client = boto3.client('ses')

# Environment variables
table_name = os.environ.get('AUTH_TABLE_NAME')
table = dynamodb.Table(table_name)

def send_validation_email(email, validation_code):
    """
    Send validation code email using AWS SES
    """
    # Email configuration
    sender_email = "noreply@waterwaycleanups.org"  # Must be verified in SES
    subject = "Your Waterway Cleanups Verification Code"
    
    # HTML email body
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Verification Code</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; }}
            .content {{ background-color: #f8f9fa; padding: 30px; }}
            .code {{ font-size: 32px; font-weight: bold; color: #2563eb; text-align: center; 
                     background-color: white; padding: 20px; border-radius: 8px; 
                     border: 2px dashed #2563eb; margin: 20px 0; }}
            .footer {{ background-color: #6b7280; color: white; padding: 15px; text-align: center; font-size: 12px; }}
            .warning {{ color: #dc2626; font-weight: bold; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Waterway Cleanups</h1>
                <p>Verification Code</p>
            </div>
            <div class="content">
                <h2>Hello!</h2>
                <p>You requested access to your volunteer dashboard. Please use the verification code below to complete your login:</p>
                
                <div class="code">{validation_code}</div>
                
                <p><strong>This code will expire in 15 minutes.</strong></p>
                
                <p>If you didn't request this code, you can safely ignore this email.</p>
                
                <p class="warning">Never share this code with anyone. Waterway Cleanups will never ask for your verification code.</p>
            </div>
            <div class="footer">
                <p>© 2026 Waterway Cleanups | Making our waterways cleaner, one cleanup at a time</p>
                <p>This is an automated message, please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    # Plain text version for email clients that don't support HTML
    text_body = f"""
    Waterway Cleanups - Verification Code
    
    Hello!
    
    You requested access to your volunteer dashboard. Please use the verification code below to complete your login:
    
    Verification Code: {validation_code}
    
    This code will expire in 15 minutes.
    
    If you didn't request this code, you can safely ignore this email.
    
    Never share this code with anyone. Waterway Cleanups will never ask for your verification code.
    
    © 2026 Waterway Cleanups
    This is an automated message, please do not reply to this email.
    """
    
    try:
        # Send email using SES
        response = ses_client.send_email(
            Source=sender_email,
            Destination={
                'ToAddresses': [email]
            },
            Message={
                'Subject': {
                    'Data': subject,
                    'Charset': 'UTF-8'
                },
                'Body': {
                    'Text': {
                        'Data': text_body,
                        'Charset': 'UTF-8'
                    },
                    'Html': {
                        'Data': html_body,
                        'Charset': 'UTF-8'
                    }
                }
            }
        )
        
        print(f"Email sent successfully. Message ID: {response['MessageId']}")
        return response
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        if error_code == 'MessageRejected':
            raise Exception(f"Email rejected: {error_message}")
        elif error_code == 'MailFromDomainNotVerifiedException':
            raise Exception("Sender email domain not verified in SES")
        elif error_code == 'ConfigurationSetDoesNotExistException':
            raise Exception("SES configuration set does not exist")
        else:
            raise Exception(f"SES error ({error_code}): {error_message}")

def handler(event, context):
    """
    Lambda function to send authentication validation code
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
        
        if 'email' not in body:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameter: email'})
            }

        email = body['email'].lower().strip()
        
        # Generate 6-digit validation code
        validation_code = ''.join(random.choices(string.digits, k=6))
        
        # Set expiration time (15 minutes from now)
        expiration_time = datetime.utcnow() + timedelta(minutes=15)
        
        # Store validation code in DynamoDB
        table.put_item(
            Item={
                'email': email,
                'validation_code': validation_code,
                'expiration_time': expiration_time.isoformat(),
                'created_at': datetime.utcnow().isoformat(),
                'attempts': 0,
                'ttl': int(expiration_time.timestamp())  # DynamoDB TTL
            }
        )
        
        # Send email with validation code using SES
        try:
            send_validation_email(email, validation_code)
            print(f"Validation code sent successfully to {email}")
        except Exception as email_error:
            print(f"Failed to send email to {email}: {str(email_error)}")
            # Don't fail the request if email sending fails, but log it
            # The code is still stored in DynamoDB for manual verification if needed
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': 'Validation code sent successfully',
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