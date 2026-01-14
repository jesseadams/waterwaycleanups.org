import json
import os
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')

volunteers_table = dynamodb.Table(volunteers_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)

def decimal_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def convert_decimals(obj):
    """Recursively convert Decimal objects to int/float in nested structures"""
    if isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals(v) for v in obj]
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    else:
        return obj

def calculate_volunteer_metrics(email):
    """Calculate volunteer metrics from RSVP history"""
    try:
        # Query RSVPs for this volunteer
        response = rsvps_table.query(
            IndexName='email-created_at-index',
            KeyConditionExpression=Key('email').eq(email)
        )
        
        rsvps = response.get('Items', [])
        
        # Initialize metrics
        metrics = {
            'total_rsvps': 0,
            'total_cancellations': 0,
            'total_no_shows': 0,
            'total_attended': 0,
            'first_event_date': None,
            'last_event_date': None
        }
        
        event_dates = []
        
        for rsvp in rsvps:
            status = rsvp.get('status', 'active')
            created_at = rsvp.get('created_at')
            
            if created_at:
                try:
                    event_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    event_dates.append(event_date)
                except:
                    pass
            
            # Count by status
            if status == 'active':
                metrics['total_rsvps'] += 1
            elif status == 'cancelled':
                metrics['total_cancellations'] += 1
            elif status == 'no_show':
                metrics['total_no_shows'] += 1
            elif status == 'attended':
                metrics['total_attended'] += 1
        
        # Calculate date range
        if event_dates:
            event_dates.sort()
            metrics['first_event_date'] = event_dates[0].isoformat()
            metrics['last_event_date'] = event_dates[-1].isoformat()
        
        # Total RSVPs includes all statuses
        metrics['total_rsvps'] = len(rsvps)
        
        return metrics
        
    except Exception as e:
        print(f"Error calculating metrics for {email}: {e}")
        return {
            'total_rsvps': 0,
            'total_cancellations': 0,
            'total_no_shows': 0,
            'total_attended': 0,
            'first_event_date': None,
            'last_event_date': None
        }

def handler(event, context):
    """
    Lambda function to get volunteer profile(s)
    Supports both single volunteer lookup and list all volunteers
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    }
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
    try:
        # Get email from path parameters if present (single volunteer lookup)
        path_parameters = event.get('pathParameters') or {}
        email = path_parameters.get('email')
        
        # Get query parameters for filtering and pagination
        query_parameters = event.get('queryStringParameters') or {}
        
        if email:
            # Get specific volunteer profile
            try:
                response = volunteers_table.get_item(Key={'email': email})
                
                if 'Item' not in response:
                    return {
                        'statusCode': 404,
                        'headers': headers,
                        'body': json.dumps({'error': 'Volunteer not found'})
                    }
                
                volunteer = response['Item']
                
                # Calculate and update metrics
                metrics = calculate_volunteer_metrics(email)
                volunteer['volunteer_metrics'] = metrics
                
                # Update the volunteer record with latest metrics
                try:
                    volunteers_table.update_item(
                        Key={'email': email},
                        UpdateExpression='SET volunteer_metrics = :metrics, updated_at = :updated_at',
                        ExpressionAttributeValues={
                            ':metrics': metrics,
                            ':updated_at': datetime.now(timezone.utc).isoformat()
                        }
                    )
                except Exception as update_error:
                    print(f"Warning: Could not update metrics for {email}: {update_error}")
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps(convert_decimals(volunteer), default=decimal_default)
                }
                
            except ClientError as e:
                print(f"Error getting volunteer {email}: {e}")
                return {
                    'statusCode': 500,
                    'headers': headers,
                    'body': json.dumps({'error': 'Failed to retrieve volunteer profile'})
                }
        
        else:
            # List all volunteers with optional filtering
            try:
                scan_kwargs = {}
                
                # Add filters if provided
                filter_expressions = []
                expression_values = {}
                
                # Filter by profile completeness
                if query_parameters.get('profile_complete'):
                    profile_complete = query_parameters['profile_complete'].lower() == 'true'
                    filter_expressions.append('profile_complete = :profile_complete')
                    expression_values[':profile_complete'] = profile_complete
                
                # Filter by communication preferences
                if query_parameters.get('email_notifications'):
                    email_notifications = query_parameters['email_notifications'].lower() == 'true'
                    filter_expressions.append('communication_preferences.email_notifications = :email_notifications')
                    expression_values[':email_notifications'] = email_notifications
                
                # Add filter expression if any filters are specified
                if filter_expressions:
                    scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)
                    scan_kwargs['ExpressionAttributeValues'] = expression_values
                
                # Pagination
                limit = int(query_parameters.get('limit', 50))
                scan_kwargs['Limit'] = min(limit, 100)  # Cap at 100
                
                if query_parameters.get('last_key'):
                    try:
                        last_key = json.loads(query_parameters['last_key'])
                        scan_kwargs['ExclusiveStartKey'] = last_key
                    except:
                        pass  # Invalid last_key, ignore
                
                response = volunteers_table.scan(**scan_kwargs)
                volunteers = response.get('Items', [])
                
                # Calculate metrics for each volunteer if requested
                include_metrics = query_parameters.get('include_metrics', 'false').lower() == 'true'
                if include_metrics:
                    for volunteer in volunteers:
                        email = volunteer.get('email')
                        if email:
                            volunteer['volunteer_metrics'] = calculate_volunteer_metrics(email)
                
                result = {
                    'volunteers': convert_decimals(volunteers),
                    'count': len(volunteers)
                }
                
                # Include pagination info
                if 'LastEvaluatedKey' in response:
                    result['last_key'] = response['LastEvaluatedKey']
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps(result, default=decimal_default)
                }
                
            except ClientError as e:
                print(f"Error listing volunteers: {e}")
                return {
                    'statusCode': 500,
                    'headers': headers,
                    'body': json.dumps({'error': 'Failed to retrieve volunteers list'})
                }
    
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal server error'})
        }