import json
import os
import sys
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from decimal import Decimal

# Add the current directory to Python path for imports
sys.path.append('/opt/python')
sys.path.append('.')

# Import validation and cascading update utilities
from data_validation_utils import (
    ValidationError, VolunteerValidator, format_validation_errors
)
from cascading_updates_utils import CascadingUpdateManager
from events_api_utils import (
    create_response, create_error_response, get_user_context,
    check_user_permission, log_api_call, handle_cors_preflight
)

# Initialize DynamoDB client with region
aws_region = os.environ.get('AWS_REGION', 'us-east-1')
dynamodb = boto3.resource('dynamodb', region_name=aws_region)
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')

volunteers_table = dynamodb.Table(volunteers_table_name)
events_table = dynamodb.Table(events_table_name)
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

def validate_volunteer_data(data):
    """Validate volunteer profile data"""
    errors = []
    
    # Required fields
    if not data.get('first_name'):
        errors.append('first_name is required')
    if not data.get('last_name'):
        errors.append('last_name is required')
    
    # Email validation (if provided for update)
    email = data.get('email')
    if email:
        import re
        email_pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        if not re.match(email_pattern, email):
            errors.append('Invalid email format')
    
    # Phone validation (if provided)
    phone = data.get('phone')
    if phone:
        # Remove common formatting characters
        clean_phone = re.sub(r'[^\d]', '', phone)
        if len(clean_phone) < 10 or len(clean_phone) > 15:
            errors.append('Phone number must be between 10-15 digits')
    
    return errors

def calculate_profile_completeness(volunteer_data):
    """Calculate if volunteer profile is complete"""
    required_fields = ['first_name', 'last_name', 'email']
    optional_fields = ['phone', 'emergency_contact']
    
    # Check required fields
    for field in required_fields:
        if not volunteer_data.get(field):
            return False
    
    # Check at least one optional field
    has_optional = any(volunteer_data.get(field) for field in optional_fields)
    
    return has_optional

def handler(event, context):
    """
    Lambda function to update volunteer profile with comprehensive validation
    Supports both creating new volunteers and updating existing ones
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Handle CORS preflight
    cors_response = handle_cors_preflight(event)
    if cors_response:
        return cors_response
    
    try:
        # Log API call
        log_api_call(event, context, "update_volunteer")
        
        # Get user context and check permissions
        user_context = get_user_context(event)
        
        # Get email from path parameters
        path_parameters = event.get('pathParameters') or {}
        email = path_parameters.get('email')
        
        if not email:
            return create_error_response(400, "Email parameter is required", "MISSING_PARAMETER")
        
        # Check permissions (admin or same user)
        check_user_permission(user_context, email, "volunteer profile update")
        
        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return create_error_response(400, "Invalid JSON in request body", "INVALID_JSON")
        
        # Validate input data using comprehensive validator
        validation_errors = VolunteerValidator.validate_volunteer_data(body, is_update=True)
        if validation_errors:
            return create_response(400, format_validation_errors(validation_errors))
        
        # Initialize cascading update manager
        cascade_manager = CascadingUpdateManager(events_table, volunteers_table, rsvps_table)
        
        # Perform update with validation and consistency checks
        try:
            result = cascade_manager.update_volunteer_with_validation(email, body, user_context)
            
            response_body = {
                'success': True,
                'message': 'Volunteer profile updated successfully',
                'volunteer': convert_decimals(result['volunteer'])
            }
            
            # Include update log for debugging
            if result.get('update_log'):
                response_body['update_log'] = result['update_log']
            
            # Determine status code (201 for creation, 200 for update)
            status_code = 201 if 'created' in result.get('update_log', [{}])[0] else 200
            
            return create_response(status_code, response_body)
            
        except ValidationError as e:
            return create_error_response(400, e.message, e.code)
        except ValueError as e:
            return create_error_response(404, str(e), "NOT_FOUND")
        except PermissionError as e:
            return create_error_response(403, str(e), "PERMISSION_DENIED")
        except Exception as e:
            print(f"Error in volunteer update: {str(e)}")
            return create_error_response(500, "Failed to update volunteer profile", "UPDATE_FAILED")
    
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, "Internal server error", "INTERNAL_ERROR")