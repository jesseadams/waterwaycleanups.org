# CORS Configuration for the Volunteer API

This document explains the CORS (Cross-Origin Resource Sharing) settings implemented in the Terraform configuration for the Volunteer API.

## Overview of CORS Configuration

CORS is necessary when a web application from one domain needs to make requests to an API hosted on another domain. Our Terraform configuration implements a comprehensive CORS solution at multiple levels:

1. **OPTIONS Method**: Handles preflight requests that browsers send before actual API requests
2. **Gateway Responses**: Ensures error responses include CORS headers
3. **Lambda Response Headers**: Adds CORS headers to Lambda function responses
4. **Stage-Level Settings**: Configures API Gateway stages for proper CORS handling

## Terraform Resources for CORS

### 1. OPTIONS Method for Preflight Requests

```terraform
resource "aws_api_gateway_method" "options_method" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  resource_id   = aws_api_gateway_resource.submit_volunteer.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.submit_volunteer.id
  http_method = aws_api_gateway_method.options_method.http_method
  
  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.submit_volunteer.id
  http_method = aws_api_gateway_method.options_method.http_method
  status_code = "200"
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.submit_volunteer.id
  http_method = aws_api_gateway_method.options_method.http_method
  status_code = aws_api_gateway_method_response.options_response.status_code
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}
```

### 2. Gateway Responses for Error Handling

```terraform
resource "aws_api_gateway_gateway_response" "cors" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,GET,POST'"
  }
}

resource "aws_api_gateway_gateway_response" "cors_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}
```

### 3. Lambda Response Headers

The Lambda function itself adds CORS headers to all responses:

```python
def create_cors_response(status_code, body):
    """Create a response with CORS headers"""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'OPTIONS,POST',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body)
    }
```

### 4. Stage-Level CORS Configuration

```terraform
resource "aws_api_gateway_method_settings" "cors_settings" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  stage_name  = aws_api_gateway_deployment.volunteer_api_deployment.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled    = false
    logging_level      = "OFF"
    caching_enabled    = false
    throttling_burst_limit = 5000
    throttling_rate_limit  = 10000
  }
}
```

## Testing CORS

To test CORS functionality after deployment:

1. Use a browser developer console to make a cross-origin fetch request to your API endpoint
2. Check for CORS headers in the response
3. Verify that preflight OPTIONS requests succeed

## Common CORS Issues

If you encounter CORS issues after deployment:

1. Check browser console for specific CORS error messages
2. Verify that the OPTIONS method is correctly configured
3. Ensure the Lambda function is returning the proper CORS headers
4. Confirm that Gateway Responses include CORS headers for error cases
