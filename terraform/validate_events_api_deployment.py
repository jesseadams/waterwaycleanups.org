#!/usr/bin/env python3
"""
Validation script for Events API deployment
Checks that all components are properly configured and accessible
"""

import boto3
import json
import sys
from datetime import datetime

def check_dynamodb_tables(region, resource_suffix=""):
    """Check that all required DynamoDB tables exist"""
    print("Checking DynamoDB tables...")
    
    dynamodb = boto3.client('dynamodb', region_name=region)
    
    required_tables = [
        f'events{resource_suffix}',
        f'volunteers{resource_suffix}',
        f'rsvps{resource_suffix}',
        f'auth_sessions{resource_suffix}'
    ]
    
    try:
        response = dynamodb.list_tables()
        existing_tables = response['TableNames']
        
        for table in required_tables:
            if table in existing_tables:
                print(f"  ✓ {table}")
                
                # Check table status
                table_info = dynamodb.describe_table(TableName=table)
                status = table_info['Table']['TableStatus']
                if status != 'ACTIVE':
                    print(f"    ⚠ Warning: Table {table} status is {status}")
            else:
                print(f"  ✗ {table} - NOT FOUND")
                return False
        
        return True
        
    except Exception as e:
        print(f"  Error checking tables: {e}")
        return False

def check_lambda_functions(region, resource_suffix=""):
    """Check that all Lambda functions exist and are configured"""
    print("Checking Lambda functions...")
    
    lambda_client = boto3.client('lambda', region_name=region)
    
    required_functions = [
        f'events_create{resource_suffix}',
        f'events_get{resource_suffix}',
        f'events_update{resource_suffix}',
        f'events_delete{resource_suffix}',
        f'events_list_rsvps{resource_suffix}',
        f'events_authorizer{resource_suffix}',
        f'volunteers_get{resource_suffix}',
        f'volunteers_update{resource_suffix}',
        f'volunteers_rsvps{resource_suffix}',
        f'volunteers_export{resource_suffix}'
    ]
    
    try:
        for function_name in required_functions:
            try:
                response = lambda_client.get_function(FunctionName=function_name)
                print(f"  ✓ {function_name}")
                
                # Check function configuration
                config = response['Configuration']
                if config['State'] != 'Active':
                    print(f"    ⚠ Warning: Function {function_name} state is {config['State']}")
                    
            except lambda_client.exceptions.ResourceNotFoundException:
                print(f"  ✗ {function_name} - NOT FOUND")
                return False
        
        return True
        
    except Exception as e:
        print(f"  Error checking Lambda functions: {e}")
        return False

def check_api_gateway(region, api_name_pattern):
    """Check that API Gateway is configured"""
    print("Checking API Gateway...")
    
    apigateway = boto3.client('apigateway', region_name=region)
    
    try:
        response = apigateway.get_rest_apis()
        apis = response['items']
        
        events_api = None
        for api in apis:
            if api_name_pattern in api['name']:
                events_api = api
                break
        
        if not events_api:
            print(f"  ✗ Events API not found (looking for pattern: {api_name_pattern})")
            return False, None
        
        print(f"  ✓ Events API found: {events_api['name']} ({events_api['id']})")
        
        # Check API deployment
        try:
            deployments = apigateway.get_deployments(restApiId=events_api['id'])
            if deployments['items']:
                latest_deployment = max(deployments['items'], key=lambda x: x['createdDate'])
                print(f"  ✓ Latest deployment: {latest_deployment['id']} ({latest_deployment['createdDate']})")
            else:
                print(f"  ⚠ Warning: No deployments found for API")
        except Exception as e:
            print(f"  ⚠ Warning: Could not check deployments: {e}")
        
        # Check authorizer
        try:
            authorizers = apigateway.get_authorizers(restApiId=events_api['id'])
            if authorizers['items']:
                auth = authorizers['items'][0]
                print(f"  ✓ Authorizer found: {auth['name']} ({auth['type']})")
            else:
                print(f"  ⚠ Warning: No authorizers found")
        except Exception as e:
            print(f"  ⚠ Warning: Could not check authorizers: {e}")
        
        return True, events_api
        
    except Exception as e:
        print(f"  Error checking API Gateway: {e}")
        return False, None

def check_ssm_parameters(region, resource_suffix=""):
    """Check that SSM parameters are set"""
    print("Checking SSM parameters...")
    
    ssm = boto3.client('ssm', region_name=region)
    
    required_params = [
        f'/waterwaycleanups{resource_suffix}/events_table_name',
        f'/waterwaycleanups{resource_suffix}/volunteers_table_name',
        f'/waterwaycleanups{resource_suffix}/rsvps_table_name',
        f'/waterwaycleanups{resource_suffix}/events_api_url',
        f'/waterwaycleanups{resource_suffix}/events_api_key'
    ]
    
    try:
        for param_name in required_params:
            try:
                response = ssm.get_parameter(Name=param_name, WithDecryption=True)
                print(f"  ✓ {param_name}")
                
                # Show value for non-sensitive parameters
                if 'api_key' not in param_name:
                    value = response['Parameter']['Value']
                    print(f"    Value: {value}")
                else:
                    print(f"    Value: [HIDDEN]")
                    
            except ssm.exceptions.ParameterNotFound:
                print(f"  ✗ {param_name} - NOT FOUND")
                return False
        
        return True
        
    except Exception as e:
        print(f"  Error checking SSM parameters: {e}")
        return False

def test_api_endpoint(api_url):
    """Test basic API connectivity"""
    print("Testing API connectivity...")
    
    try:
        import requests
        
        # Test public endpoint
        response = requests.get(f"{api_url}/events", timeout=10)
        print(f"  GET /events: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ API is responding correctly")
            return True
        elif response.status_code == 403:
            print(f"  ⚠ API returned 403 - check CORS or authentication")
            return True  # API is working, just protected
        else:
            print(f"  ⚠ Unexpected response: {response.text}")
            return False
            
    except ImportError:
        print("  ⚠ Skipping connectivity test (requests library not available)")
        return True
    except Exception as e:
        print(f"  ✗ API connectivity test failed: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_events_api_deployment.py <aws_region> [resource_suffix]")
        print("Example: python validate_events_api_deployment.py us-east-1 -dev")
        sys.exit(1)
    
    region = sys.argv[1]
    resource_suffix = sys.argv[2] if len(sys.argv) > 2 else ""
    
    print(f"Validating Events API deployment in region: {region}")
    if resource_suffix:
        print(f"Using resource suffix: {resource_suffix}")
    print("=" * 60)
    
    all_checks_passed = True
    
    # Check DynamoDB tables
    if not check_dynamodb_tables(region, resource_suffix):
        all_checks_passed = False
    print()
    
    # Check Lambda functions
    if not check_lambda_functions(region, resource_suffix):
        all_checks_passed = False
    print()
    
    # Check API Gateway
    api_name_pattern = f"events-api{resource_suffix}"
    api_ok, api_info = check_api_gateway(region, api_name_pattern)
    if not api_ok:
        all_checks_passed = False
    print()
    
    # Check SSM parameters
    if not check_ssm_parameters(region, resource_suffix):
        all_checks_passed = False
    print()
    
    # Test API connectivity if we have the API info
    if api_info:
        # Construct API URL
        api_url = f"https://{api_info['id']}.execute-api.{region}.amazonaws.com/dev"
        if not test_api_endpoint(api_url):
            all_checks_passed = False
    print()
    
    # Summary
    print("=" * 60)
    if all_checks_passed:
        print("✓ All validation checks passed!")
        print("Events API deployment appears to be successful.")
    else:
        print("✗ Some validation checks failed.")
        print("Please review the errors above and fix any issues.")
        sys.exit(1)

if __name__ == "__main__":
    main()