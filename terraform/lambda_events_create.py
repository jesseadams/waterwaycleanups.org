import json
import os
import boto3
from datetime import datetime
import uuid
from botocore.exceptions import ClientError

# Import shared utilities
import sys
sys.path.append('/opt/python')
from events_api_utils import (
    create_response, create_error_response, get_user_context, check_admin_permission,
    log_api_call, handle_cors_preflight, ValidationError, AuthorizationError,
    validate_required_fields, validate_iso_datetime
)
from data_validation_utils import EventValidator, format_validation_errors

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
events_table = dynamodb.Table(events_table_name)

def handler(event, context):
    """
    Lambda function to create a new event
    Requires admin authentication
    """
    try:
        # Handle CORS preflight
        cors_response = handle_cors_preflight(event)
        if cors_response:
            return cors_response
        
        # Log API call
        log_api_call(event, context, "create_event")
        
        # Get user context from authorizer
        user_context = get_user_context(event)
        
        # Check admin permission
        check_admin_permission(user_context, "create event")
        
        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return create_error_response(400, "Invalid JSON in request body", "INVALID_JSON")
        
        # Validate event data using comprehensive validator
        validation_errors = EventValidator.validate_event_data(body, is_update=False)
        if validation_errors:
            return create_response(400, format_validation_errors(validation_errors))
        location = body['location']
        if not isinstance(location, dict):
            return create_error_response(400, "Location must be an object", "INVALID_LOCATION")
        
        location_required = ['name', 'address']
        location_missing = validate_required_fields(location, location_required)
        if location_missing:
            return create_error_response(400, f"Location missing fields: {', '.join(location_missing)}", "INVALID_LOCATION")
        
        # Validate datetime formats
        if not validate_iso_datetime(body['start_time']):
            return create_error_response(400, "Invalid start_time format. Use ISO 8601", "INVALID_DATETIME")
        
        if not validate_iso_datetime(body['end_time']):
            return create_error_response(400, "Invalid end_time format. Use ISO 8601", "INVALID_DATETIME")
        
        # Validate that end_time is after start_time
        start_dt = datetime.fromisoformat(body['start_time'].replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(body['end_time'].replace('Z', '+00:00'))
        if end_dt <= start_dt:
            return create_error_response(400, "End time must be after start time", "INVALID_TIME_RANGE")
        
        # Generate event_id from title if not provided
        event_id = body.get('event_id')
        if not event_id:
            # Create slug from title and start_time
            title_slug = body['title'].lower().replace(' ', '-').replace('&', 'and')
            # Remove special characters except hyphens
            title_slug = ''.join(c for c in title_slug if c.isalnum() or c == '-')
            # Extract date from start_time for uniqueness
            date_part = start_dt.strftime('%B-%Y').lower()
            event_id = f"{title_slug}-{date_part}"
        
        # Validate attendance_cap if provided
        attendance_cap = body.get('attendance_cap', 50)
        if not isinstance(attendance_cap, int) or attendance_cap <= 0:
            return create_error_response(400, "Attendance cap must be a positive integer", "INVALID_ATTENDANCE_CAP")
        
        # Validate status if provided
        valid_statuses = ['active', 'cancelled', 'completed', 'archived']
        status = body.get('status', 'active')
        if status not in valid_statuses:
            return create_error_response(400, f"Status must be one of: {', '.join(valid_statuses)}", "INVALID_STATUS")
        
        # Prepare event item
        current_time = datetime.utcnow().isoformat() + 'Z'
        event_item = {
            'event_id': event_id,
            'title': body['title'],
            'description': body['description'],
            'start_time': body['start_time'],
            'end_time': body['end_time'],
            'location': location,
            'attendance_cap': attendance_cap,
            'status': status,
            'created_at': current_time,
            'updated_at': current_time,
            'hugo_config': body.get('hugo_config', {
                'tags': [],
                'preheader_is_light': False
            }),
            'metadata': body.get('metadata', {})
        }
        
        # Check if event already exists
        try:
            existing_item = events_table.get_item(Key={'event_id': event_id})
            if 'Item' in existing_item:
                return create_error_response(409, f"Event with ID '{event_id}' already exists", "EVENT_EXISTS")
        except ClientError as e:
            print(f"Error checking existing event: {e.response['Error']['Message']}")
            return create_error_response(500, "Database error while checking existing event", "DATABASE_ERROR")
        
        # Create the event
        try:
            events_table.put_item(Item=event_item)
        except ClientError as e:
            print(f"Error creating event: {e.response['Error']['Message']}")
            return create_error_response(500, "Failed to create event", "DATABASE_ERROR")
        
        return create_response(201, {
            'message': 'Event created successfully',
            'event': event_item,
            'success': True
        })
        
    except AuthorizationError as e:
        return create_error_response(403, str(e), "AUTHORIZATION_ERROR")
    except ValidationError as e:
        return create_error_response(400, str(e), "VALIDATION_ERROR")
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return create_error_response(500, "Internal server error", "INTERNAL_ERROR")