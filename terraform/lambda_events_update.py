import json
import os
import sys
import boto3
from datetime import datetime
from botocore.exceptions import ClientError
from decimal import Decimal

# Add the current directory to Python path for imports
sys.path.append('/opt/python')
sys.path.append('.')

# Import validation and cascading update utilities
from data_validation_utils import (
    ValidationError, EventValidator, format_validation_errors
)
from cascading_updates_utils import CascadingUpdateManager
from events_api_utils import (
    create_response, create_error_response, get_user_context,
    check_admin_permission, log_api_call, handle_cors_preflight
)

# Initialize DynamoDB client with region
aws_region = os.environ.get('AWS_REGION', 'us-east-1')
dynamodb = boto3.resource('dynamodb', region_name=aws_region)
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')

events_table = dynamodb.Table(events_table_name)
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

def handler(event, context):
    """
    Lambda function to update an existing event with comprehensive validation and cascading updates
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Handle CORS preflight
    cors_response = handle_cors_preflight(event)
    if cors_response:
        return cors_response
    
    try:
        # Log API call
        log_api_call(event, context, "update_event")
        
        # Get user context and check permissions
        user_context = get_user_context(event)
        check_admin_permission(user_context, "event update")
        
        # Get event_id from path parameters
        path_params = event.get('pathParameters') or {}
        if 'event_id' not in path_params:
            return create_error_response(400, "Missing event_id in path", "MISSING_PARAMETER")
        
        event_id = path_params['event_id']
        
        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return create_error_response(400, "Invalid JSON in request body", "INVALID_JSON")
        
        # Remove event_id from updates if present (cannot update partition key)
        updates = {k: v for k, v in body.items() if k != 'event_id'}
        
        # Validate update data
        validation_errors = EventValidator.validate_event_data(updates, is_update=True)
        if validation_errors:
            return create_response(400, format_validation_errors(validation_errors))
        
        # Initialize cascading update manager
        cascade_manager = CascadingUpdateManager(events_table, volunteers_table, rsvps_table)
        
        # Perform update with cascading changes
        try:
            result = cascade_manager.update_event_with_cascading(event_id, updates, user_context)
            
            response_body = {
                'message': 'Event updated successfully',
                'event': convert_decimals(result['event']),
                'success': True
            }
            
            # Include cascading update information if any
            if result.get('cascading_updates'):
                response_body['cascading_updates'] = result['cascading_updates']
            
            # Include warnings if any
            if result.get('warnings'):
                response_body['warnings'] = result['warnings']
            
            # Include update log for debugging
            if result.get('update_log'):
                response_body['update_log'] = result['update_log']
            
            return create_response(200, response_body)
            
        except ValidationError as e:
            return create_error_response(400, e.message, e.code)
        except ValueError as e:
            return create_error_response(404, str(e), "NOT_FOUND")
        except PermissionError as e:
            return create_error_response(403, str(e), "PERMISSION_DENIED")
        except Exception as e:
            print(f"Error in cascading update: {str(e)}")
            return create_error_response(500, "Failed to update event with cascading changes", "UPDATE_FAILED")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return create_error_response(500, "Internal server error", "INTERNAL_ERROR")