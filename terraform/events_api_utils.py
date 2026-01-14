"""
Shared utilities for Events API Lambda functions
"""
import json
import logging
from datetime import datetime
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

class DecimalEncoder(json.JSONEncoder):
    """JSON encoder for DynamoDB Decimal types"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def create_response(status_code, body, headers=None):
    """
    Create standardized API Gateway response
    """
    default_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    }
    
    if headers:
        default_headers.update(headers)
    
    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def create_error_response(status_code, error_message, error_code=None):
    """
    Create standardized error response
    """
    error_body = {
        'error': error_message,
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }
    
    if error_code:
        error_body['error_code'] = error_code
    
    return create_response(status_code, error_body)

def validate_required_fields(data, required_fields):
    """
    Validate that all required fields are present in the data
    Returns list of missing fields
    """
    missing_fields = []
    for field in required_fields:
        if field not in data or data[field] is None or data[field] == '':
            missing_fields.append(field)
    return missing_fields

def validate_email_format(email):
    """
    Basic email validation
    """
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_iso_datetime(datetime_str):
    """
    Validate ISO 8601 datetime format
    """
    try:
        datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
        return True
    except ValueError:
        return False

def get_user_context(event):
    """
    Extract user context from API Gateway authorizer
    """
    context = event.get('requestContext', {}).get('authorizer', {})
    return {
        'email': context.get('email'),
        'is_admin': context.get('isAdmin', 'false').lower() == 'true',
        'session_token': context.get('sessionToken')
    }

def check_admin_permission(user_context, operation):
    """
    Check if user has admin permission for the operation
    """
    if not user_context.get('is_admin', False):
        raise PermissionError(f"Admin permission required for {operation}")

def check_user_permission(user_context, target_email, operation):
    """
    Check if user can perform operation on target email
    (either admin or same user)
    """
    user_email = user_context.get('email', '')
    is_admin = user_context.get('is_admin', False)
    
    if not is_admin and user_email.lower() != target_email.lower():
        raise PermissionError(f"Permission denied for {operation} on {target_email}")

def log_api_call(event, context, operation):
    """
    Log API call details
    """
    user_context = get_user_context(event)
    logger.info(f"API Call: {operation}")
    logger.info(f"User: {user_context.get('email', 'anonymous')}")
    logger.info(f"Admin: {user_context.get('is_admin', False)}")
    logger.info(f"Method: {event.get('httpMethod', 'unknown')}")
    logger.info(f"Path: {event.get('path', 'unknown')}")

def handle_cors_preflight(event):
    """
    Handle CORS preflight OPTIONS request
    """
    if event.get('httpMethod') == 'OPTIONS':
        return create_response(200, {'message': 'CORS preflight successful'})
    return None

class ValidationError(Exception):
    """Custom exception for validation errors"""
    pass

class AuthorizationError(Exception):
    """Custom exception for authorization errors"""
    pass