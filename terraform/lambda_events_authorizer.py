import json
import os
import boto3
from datetime import datetime
from botocore.exceptions import ClientError

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
sessions_table_name = os.environ.get('SESSIONS_TABLE_NAME')
sessions_table = dynamodb.Table(sessions_table_name)

def handler(event, context):
    """
    Lambda authorizer function for Events API
    Validates session tokens and returns IAM policy
    """
    try:
        print(f"Authorizer received event: {json.dumps(event)}")
        
        # Extract token from Authorization header
        token = event.get('authorizationToken', '')
        method_arn = event.get('methodArn', '')
        
        print(f"Token: {token}")
        print(f"Method ARN: {method_arn}")
        
        # Remove 'Bearer ' prefix if present
        if token.startswith('Bearer '):
            token = token[7:]
        
        print(f"Cleaned token: {token}")
        
        # Validate session token
        response = sessions_table.get_item(
            Key={'session_token': token}
        )
        
        print(f"DynamoDB response: {response}")
        
        if 'Item' not in response:
            print(f"Session token not found: {token}")
            raise Exception('Unauthorized')
        
        item = response['Item']
        print(f"Session item: {item}")
        
        # Check if session is expired
        expires_at = datetime.fromisoformat(item['expires_at'].replace('Z', '+00:00'))
        current_time = datetime.utcnow().replace(tzinfo=expires_at.tzinfo)
        print(f"Expires at: {expires_at}, Current time: {current_time}")
        
        if current_time > expires_at:
            print(f"Session expired for token: {token}")
            # Delete expired session
            sessions_table.delete_item(
                Key={'session_token': token}
            )
            raise Exception('Unauthorized')
        
        # Extract email from session
        email = item['email']
        print(f"Email: {email}")
        
        # Check if user is admin (for write operations)
        # For now, we'll use a simple email-based check
        # In production, this should be more sophisticated
        admin_emails = [
            'admin@waterwaycleanups.org',
            'contact@waterwaycleanups.org',
            'jesse@techno-geeks.org',
            'jesse@waterwaycleanups.org',
            # Add more admin emails as needed
        ]
        
        is_admin = email.lower() in [admin_email.lower() for admin_email in admin_emails]
        print(f"Is admin: {is_admin}")
        
        # Generate policy based on method and user role
        policy = generate_policy(email, method_arn, is_admin)
        
        # Add user context
        policy['context'] = {
            'email': email,
            'isAdmin': str(is_admin).lower(),
            'sessionToken': token
        }
        
        print(f"Final policy: {json.dumps(policy)}")
        print(f"Authorization successful for {email}, admin: {is_admin}")
        return policy
        
    except Exception as e:
        print(f"Authorization failed: {str(e)}")
        print(f"Exception type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise Exception('Unauthorized')

def generate_policy(principal_id, resource, is_admin):
    """
    Generate IAM policy for the user
    """
    # Parse the method ARN to determine the HTTP method
    # ARN format: arn:aws:execute-api:region:account:api-id/stage/METHOD/resource
    arn_parts = resource.split(':')
    
    # Build the base API Gateway ARN (first 5 parts + API ID from the 6th part)
    # resource format is like: "o2pkfnwqq4/staging/POST/events"
    resource_path = arn_parts[5] if len(arn_parts) > 5 else ''
    api_id = resource_path.split('/')[0] if resource_path else ''
    api_gateway_arn = ':'.join(arn_parts[:5]) + ':' + api_id
    
    # Extract method from the resource
    method_parts = resource_path.split('/') if resource_path else []
    
    # Extract HTTP method - it's always the 3rd part (index 2) after splitting by '/'
    # Format: api-id/stage/METHOD/resource or api-id/stage/METHOD-resource
    method = ''
    if len(method_parts) >= 3:
        method_part = method_parts[2]
        # The method might have a hyphen followed by resource path (e.g., "POST-events")
        # Extract just the HTTP method (everything before the first hyphen)
        if '-' in method_part:
            method = method_part.split('-')[0]
        else:
            method = method_part
    
    print(f"Parsing method ARN: {resource}")
    print(f"Resource path: {resource_path}")
    print(f"API ID: {api_id}")
    print(f"API Gateway ARN: {api_gateway_arn}")
    print(f"Method parts: {method_parts}")
    print(f"Extracted method: {method}")
    print(f"Is admin: {is_admin}")
    
    # Define allowed actions based on method and admin status
    effect = 'Deny'
    
    # Normalize method to uppercase for comparison
    method = method.upper() if method else ''
    
    # Read operations - allowed for all authenticated users
    if method == 'GET':
        effect = 'Allow'
    
    # Write operations - only allowed for admins
    elif method in ['POST', 'PUT', 'DELETE'] and is_admin:
        effect = 'Allow'
    
    # Special case: volunteers can update their own profile
    elif method == 'PUT' and '/volunteers/' in resource_path:
        effect = 'Allow'  # We'll validate email match in the Lambda function
    
    print(f"Final authorization decision: {effect} for method '{method}', admin: {is_admin}")
    
    # Use a wildcard resource to avoid issues with specific resource matching
    policy = {
        'principalId': principal_id,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Action': 'execute-api:Invoke',
                    'Effect': effect,
                    'Resource': f"{api_gateway_arn}/*"
                }
            ]
        }
    }
    
    return policy