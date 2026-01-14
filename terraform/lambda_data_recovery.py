"""
Lambda function for data recovery and consistency repair operations
Handles repair of volunteer metrics and other data consistency issues
"""
import json
import os
import sys
import boto3
from datetime import datetime, timezone
from botocore.exceptions import ClientError

# Add the current directory to Python path for imports
sys.path.append('/opt/python')
sys.path.append('.')

from cascading_updates_utils import DataRecoveryManager
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

def handler(event, context):
    """
    Lambda function for data recovery operations
    Supports various recovery and consistency repair operations
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Handle CORS preflight
    cors_response = handle_cors_preflight(event)
    if cors_response:
        return cors_response
    
    try:
        # Log API call
        log_api_call(event, context, "data_recovery")
        
        # Get user context and check admin permissions
        user_context = get_user_context(event)
        check_admin_permission(user_context, "data recovery operations")
        
        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return create_error_response(400, "Invalid JSON in request body", "INVALID_JSON")
        
        # Get operation type
        operation = body.get('operation')
        if not operation:
            return create_error_response(400, "Operation type is required", "MISSING_OPERATION")
        
        # Initialize recovery manager
        recovery_manager = DataRecoveryManager(events_table, volunteers_table, rsvps_table)
        
        # Route to appropriate recovery operation
        if operation == 'repair_volunteer_metrics':
            return handle_repair_volunteer_metrics(recovery_manager, body)
        elif operation == 'validate_data_consistency':
            return handle_validate_data_consistency(recovery_manager, body)
        elif operation == 'repair_specific_volunteer':
            return handle_repair_specific_volunteer(recovery_manager, body)
        else:
            return create_error_response(400, f"Unknown operation: {operation}", "INVALID_OPERATION")
    
    except PermissionError as e:
        return create_error_response(403, str(e), "PERMISSION_DENIED")
    except Exception as e:
        print(f"Error in data recovery: {str(e)}")
        return create_error_response(500, "Data recovery operation failed", "RECOVERY_FAILED")

def handle_repair_volunteer_metrics(recovery_manager, body):
    """Handle repair of volunteer metrics for all volunteers"""
    try:
        result = recovery_manager.repair_volunteer_metrics()
        
        if result['success']:
            return create_response(200, {
                'message': 'Volunteer metrics repair completed',
                'results': result['results'],
                'recovery_log': result['recovery_log']
            })
        else:
            return create_error_response(500, result['error'], "REPAIR_FAILED")
    
    except Exception as e:
        return create_error_response(500, f"Failed to repair volunteer metrics: {str(e)}", "REPAIR_FAILED")

def handle_repair_specific_volunteer(recovery_manager, body):
    """Handle repair of metrics for a specific volunteer"""
    email = body.get('email')
    if not email:
        return create_error_response(400, "Email is required for specific volunteer repair", "MISSING_EMAIL")
    
    try:
        result = recovery_manager.repair_volunteer_metrics(email=email)
        
        if result['success']:
            return create_response(200, {
                'message': f'Volunteer metrics repair completed for {email}',
                'results': result['results'],
                'recovery_log': result['recovery_log']
            })
        else:
            return create_error_response(500, result['error'], "REPAIR_FAILED")
    
    except Exception as e:
        return create_error_response(500, f"Failed to repair metrics for {email}: {str(e)}", "REPAIR_FAILED")

def handle_validate_data_consistency(recovery_manager, body):
    """Handle validation of data consistency across tables"""
    try:
        # This would implement comprehensive consistency checks
        # For now, we'll return a placeholder response
        return create_response(200, {
            'message': 'Data consistency validation completed',
            'status': 'This feature is under development',
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    
    except Exception as e:
        return create_error_response(500, f"Failed to validate data consistency: {str(e)}", "VALIDATION_FAILED")