import json
import os
import boto3
import csv
import io
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
        response = rsvps_table.query(
            IndexName='email-created_at-index',
            KeyConditionExpression=Key('email').eq(email)
        )
        
        rsvps = response.get('Items', [])
        
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
            
            if status == 'active':
                metrics['total_rsvps'] += 1
            elif status == 'cancelled':
                metrics['total_cancellations'] += 1
            elif status == 'no_show':
                metrics['total_no_shows'] += 1
            elif status == 'attended':
                metrics['total_attended'] += 1
        
        if event_dates:
            event_dates.sort()
            metrics['first_event_date'] = event_dates[0].isoformat()
            metrics['last_event_date'] = event_dates[-1].isoformat()
        
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

def flatten_volunteer_data(volunteer):
    """Flatten volunteer data for CSV export"""
    flattened = {
        'email': volunteer.get('email', ''),
        'first_name': volunteer.get('first_name', ''),
        'last_name': volunteer.get('last_name', ''),
        'full_name': volunteer.get('full_name', ''),
        'phone': volunteer.get('phone', ''),
        'emergency_contact': volunteer.get('emergency_contact', ''),
        'dietary_restrictions': volunteer.get('dietary_restrictions', ''),
        'volunteer_experience': volunteer.get('volunteer_experience', ''),
        'how_did_you_hear': volunteer.get('how_did_you_hear', ''),
        'created_at': volunteer.get('created_at', ''),
        'updated_at': volunteer.get('updated_at', ''),
        'profile_complete': volunteer.get('profile_complete', False),
    }
    
    # Communication preferences
    comm_prefs = volunteer.get('communication_preferences', {})
    flattened['email_notifications'] = comm_prefs.get('email_notifications', False)
    flattened['sms_notifications'] = comm_prefs.get('sms_notifications', False)
    
    # Volunteer metrics
    metrics = volunteer.get('volunteer_metrics', {})
    flattened['total_rsvps'] = metrics.get('total_rsvps', 0)
    flattened['total_cancellations'] = metrics.get('total_cancellations', 0)
    flattened['total_no_shows'] = metrics.get('total_no_shows', 0)
    flattened['total_attended'] = metrics.get('total_attended', 0)
    flattened['first_event_date'] = metrics.get('first_event_date', '')
    flattened['last_event_date'] = metrics.get('last_event_date', '')
    
    return flattened

def generate_csv(volunteers):
    """Generate CSV content from volunteers list"""
    if not volunteers:
        return ""
    
    # Flatten all volunteer data
    flattened_volunteers = [flatten_volunteer_data(v) for v in volunteers]
    
    # Get all possible field names
    all_fields = set()
    for volunteer in flattened_volunteers:
        all_fields.update(volunteer.keys())
    
    # Sort fields for consistent output
    fieldnames = sorted(all_fields)
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(flattened_volunteers)
    
    return output.getvalue()

def handler(event, context):
    """
    Lambda function to export volunteer data in CSV or JSON format
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
        # Get query parameters
        query_parameters = event.get('queryStringParameters') or {}
        export_format = query_parameters.get('format', 'json').lower()
        include_metrics = query_parameters.get('include_metrics', 'true').lower() == 'true'
        
        # Validate format
        if export_format not in ['json', 'csv']:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid format. Supported formats: json, csv'})
            }
        
        # Build scan parameters
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
        
        # Get all volunteers (paginated scan)
        volunteers = []
        last_evaluated_key = None
        
        try:
            while True:
                if last_evaluated_key:
                    scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
                
                response = volunteers_table.scan(**scan_kwargs)
                volunteers.extend(response.get('Items', []))
                
                last_evaluated_key = response.get('LastEvaluatedKey')
                if not last_evaluated_key:
                    break
                
                # Safety limit to prevent infinite loops
                if len(volunteers) > 10000:
                    print("Warning: Export limited to 10,000 volunteers")
                    break
            
            # Calculate metrics for each volunteer if requested
            if include_metrics:
                for volunteer in volunteers:
                    email = volunteer.get('email')
                    if email:
                        volunteer['volunteer_metrics'] = calculate_volunteer_metrics(email)
            
            # Convert decimals
            volunteers = convert_decimals(volunteers)
            
            # Generate response based on format
            if export_format == 'csv':
                csv_content = generate_csv(volunteers)
                
                # Set CSV headers
                csv_headers = {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'text/csv',
                    'Content-Disposition': f'attachment; filename="volunteers_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'
                }
                
                return {
                    'statusCode': 200,
                    'headers': csv_headers,
                    'body': csv_content
                }
            
            else:  # JSON format
                result = {
                    'success': True,
                    'volunteers': volunteers,
                    'count': len(volunteers),
                    'exported_at': datetime.now(timezone.utc).isoformat(),
                    'include_metrics': include_metrics
                }
                
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps(result, default=decimal_default)
                }
                
        except ClientError as e:
            print(f"Error scanning volunteers table: {e}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to retrieve volunteers data'})
            }
    
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal server error'})
        }