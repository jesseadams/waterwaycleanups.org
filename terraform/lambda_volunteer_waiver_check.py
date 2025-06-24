import json
import boto3
from datetime import datetime, timedelta, timezone
import os
from botocore.exceptions import ClientError
import traceback

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
    Handler function for checking if a volunteer has already signed a waiver within the last year.
    
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
        # Log the incoming request (with email redacted for privacy)
        logger.info("Processing waiver check request")
        
        # Parse request body
        body = json.loads(event['body'])
        
        # Validate input
        if 'email' not in body or not body['email']:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'message': 'Email is required'
                })
            }
        
        email = body['email'].lower()  # Normalize email to lowercase
        
        # Query DynamoDB for this email
        logger.info(f"Querying DynamoDB for email (redacted)")
        
        response = table.query(
            KeyConditionExpression="email = :email",
            ExpressionAttributeValues={
                ":email": email
            }
        )
        
        logger.info(f"Found {len(response.get('Items', []))} waiver records")
        
        items = response.get('Items', [])
        
        # If no items, user has not signed a waiver
        if not items:
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'hasWaiver': False,
                    'message': 'No waiver found for this email'
                })
            }
        try:
            # Get the most recent waiver
            items.sort(key=lambda x: x.get('submission_date', ''), reverse=True)
            latest_waiver = items[0]
            
            # Check if submission_date exists
            if 'submission_date' not in latest_waiver:
                logger.error(f"Error: submission_date missing in waiver record for {email}")
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({
                        'success': True,
                        'hasWaiver': False,
                        'message': 'No valid waiver found for this email'
                    })
                }
            
            # Handle different date formats
            submission_date_str = latest_waiver['submission_date']
            
            # Handle ISO format with Z suffix
            if 'Z' in submission_date_str:
                submission_date_str = submission_date_str.replace('Z', '+00:00')
                
            # Try to parse the date
            try:
                submission_date = datetime.fromisoformat(submission_date_str)
                # Convert to naive datetime to avoid timezone comparison issues
                if hasattr(submission_date, 'tzinfo') and submission_date.tzinfo is not None:
                    # Convert to UTC and then remove timezone info
                    submission_date = submission_date.astimezone(timezone.utc).replace(tzinfo=None)
            except ValueError:
                # If fromisoformat fails, try a different approach
                try:
                    submission_date = datetime.strptime(submission_date_str, "%Y-%m-%dT%H:%M:%S.%f")
                except ValueError:
                    try:
                        submission_date = datetime.strptime(submission_date_str, "%Y-%m-%d")
                    except ValueError:
                        logger.error(f"Error parsing date: {submission_date_str}")
                        return {
                            'statusCode': 200,
                            'headers': headers,
                            'body': json.dumps({
                                'success': True,
                                'hasWaiver': False,
                                'message': 'Date format error. No valid waiver found.'
                            })
                        }
            
            # Use naive datetimes for comparison to avoid timezone issues
            today = datetime.utcnow()
            one_year_ago = today - timedelta(days=365)
        except Exception as e:
            logger.error(f"Error processing waiver data: {str(e)}")
            logger.error(traceback.format_exc())
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'hasWaiver': False,
                    'message': 'Error processing waiver data'
                })
            }
        
        if submission_date > one_year_ago:
            # Waiver is valid
            expiration_date = (submission_date + timedelta(days=365)).strftime('%Y-%m-%d')
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'hasWaiver': True,
                    'message': f'User has a valid waiver until {expiration_date}',
                    'expirationDate': expiration_date,
                    'submissionDate': latest_waiver['submission_date']
                })
            }
        else:
            # Waiver has expired
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'hasWaiver': False,
                    'message': 'Previous waiver has expired, a new one is required',
                    'previousWaiverDate': latest_waiver['submission_date']
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
                'message': 'Internal server error'
            })
        }
