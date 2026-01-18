# Admin Volunteers Endpoint - Terraform Configuration
# Allows admins to list all volunteers with their associated minors

# API Gateway Resource for admin-volunteers
resource "aws_api_gateway_resource" "admin_volunteers" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "admin-volunteers"
}

# GET method for admin-volunteers
resource "aws_api_gateway_method" "admin_volunteers_get" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.admin_volunteers.id
  http_method   = "GET"
  authorization = "NONE"
}

# Lambda integration for GET
resource "aws_api_gateway_integration" "admin_volunteers_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_volunteers.id
  http_method = aws_api_gateway_method.admin_volunteers_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.admin_volunteers.invoke_arn
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "admin_volunteers_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.admin_volunteers.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_volunteers_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_volunteers.id
  http_method = aws_api_gateway_method.admin_volunteers_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_volunteers_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_volunteers.id
  http_method = aws_api_gateway_method.admin_volunteers_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "admin_volunteers_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_volunteers.id
  http_method = aws_api_gateway_method.admin_volunteers_options.http_method
  status_code = aws_api_gateway_method_response.admin_volunteers_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [
    aws_api_gateway_integration.admin_volunteers_options_integration
  ]
}

# Lambda permission for API Gateway to invoke the function
resource "aws_lambda_permission" "admin_volunteers_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin_volunteers.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}
