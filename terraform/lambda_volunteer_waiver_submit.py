import json
import boto3
from datetime import datetime, timedelta, timezone
import os
from botocore.exceptions import ClientError
import uuid

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('WAIVER_TABLE_NAME', 'volunteer_waivers')
table = dynamodb.Table(table_name)

# Set up logging
import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Handler function for submitting volunteer waiver forms to DynamoDB.
    
    Args:
        event: API Gateway event object
        context: Lambda context
    
    Returns:
        API Gateway response object
    """
    # Set up CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        'Content-Type': 'application/json'
    }
    
    # Handle preflight OPTIONS request
    if event['httpMethod'] == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
    try:
        # Log the incoming request
        logger.info("Processing waiver submission request")
        
        # Parse request body
        body = json.loads(event['body'])
        
        # Validate required fields
        required_fields = ['email', 'full_legal_name', 'phone_number', 'date_of_birth', 'waiver_acknowledgement']
        
        missing_fields = [field for field in required_fields if field not in body or not body[field]]
        
        if missing_fields:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': f'Missing required fields: {", ".join(missing_fields)}'
                })
            }
        
        # Determine if adult or minor based on date of birth
        try:
            date_of_birth = datetime.strptime(body['date_of_birth'], '%Y-%m-%d')
            today = datetime.utcnow()
            age = today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))
            logger.info(f"Calculated age: {age}")
        except ValueError as e:
            logger.error(f"Error parsing date of birth: {body['date_of_birth']} - {str(e)}")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': f'Invalid date of birth format. Please use YYYY-MM-DD format.'
                })
            }
        is_adult = age >= 18
        
        # Validate additional required fields based on age
        if is_adult:
            additional_fields = ['adult_signature', 'adult_todays_date']
            missing_adult_fields = [field for field in additional_fields if field not in body or not body[field]]
            
            if missing_adult_fields:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'message': f'Missing required adult fields: {", ".join(missing_adult_fields)}'
                    })
                }
        else:
            # For minors, validate guardian information
            additional_fields = ['guardian_name', 'guardian_email', 'relationship_type', 'guardian_consent', 'minor_todays_date']
            missing_minor_fields = [field for field in additional_fields if field not in body or not body[field]]
            
            if missing_minor_fields:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'message': f'Missing required guardian fields: {", ".join(missing_minor_fields)}'
                    })
                }
        
        # Prepare item for DynamoDB
        # Use email as partition key and a UUID as sort key to allow multiple waivers per email
        waiver_id = str(uuid.uuid4())
        submission_date = datetime.utcnow().isoformat() + 'Z'
        logger.info(f"Created waiver ID: {waiver_id} for email (redacted)")
        
        # Create item with all the form fields
        item = {
            'email': body['email'].lower(),  # Normalize email to lowercase
            'waiver_id': waiver_id,
            'submission_date': submission_date,
            'full_legal_name': body['full_legal_name'],
            'phone_number': body['phone_number'],
            'date_of_birth': body['date_of_birth'],
            'is_adult': is_adult,
            'waiver_acknowledged': True if body['waiver_acknowledgement'] == 'on' else body['waiver_acknowledgement']
        }
        
        # Add adult-specific fields
        if is_adult:
            item.update({
                'adult_signature': body['adult_signature'],
                'signature_date': body['adult_todays_date']
            })
        # Add minor-specific fields
        else:
            item.update({
                'guardian_name': body['guardian_name'],
                'guardian_email': body['guardian_email'].lower(),  # Normalize email to lowercase
                'guardian_relationship': body['relationship_type'],
                'guardian_consent': True if body['guardian_consent'] == 'on' else body['guardian_consent'],
                'consent_date': body['minor_todays_date']
            })
        
        # Write to DynamoDB
        logger.info(f"Saving waiver record to DynamoDB table: {table_name}")
        table.put_item(Item=item)
        logger.info("Waiver record saved successfully")
        
        # Calculate expiration date
        try:
            # Parse the submission date, handling timezone issues
            expiry_date = datetime.fromisoformat(submission_date.replace('Z', '+00:00'))
            # Convert to naive datetime in UTC
            if hasattr(expiry_date, 'tzinfo') and expiry_date.tzinfo is not None:
                expiry_date = expiry_date.astimezone(timezone.utc).replace(tzinfo=None)
            # Add one year
            expiry_date = expiry_date + timedelta(days=365)
            # Format as string
            expiry_date_str = expiry_date.strftime('%Y-%m-%d')
            
            logger.info(f"Waiver expiration date calculated: {expiry_date_str}")
            
            # Return success response
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'message': 'Waiver submitted successfully',
                    'waiver_id': waiver_id,
                    'expiration_date': expiry_date_str
                })
            }
        except Exception as e:
            logger.error(f"Error calculating expiration date: {str(e)}")
            # Still return success but with a default expiration
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'message': 'Waiver submitted successfully',
                    'waiver_id': waiver_id
                })
            }
            
    except ClientError as e:
        logger.error(f"DynamoDB error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': 'Database error occurred'
            })
        }
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'message': f'Internal server error: {str(e)}'
            })
        }
