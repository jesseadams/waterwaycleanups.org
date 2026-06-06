# Auth Complete Profile endpoint
# Captures a volunteer's first/last name at first login so we always have a
# name before they RSVP. Writes the volunteers record and the SES contact.

data "archive_file" "auth_complete_profile_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_auth_complete_profile.py"
  output_path = "${path.module}/lambda_auth_complete_profile.zip"
}

resource "aws_lambda_function" "auth_complete_profile" {
  function_name    = "auth_complete_profile${local.resource_suffix}"
  filename         = data.archive_file.auth_complete_profile_zip.output_path
  source_code_hash = data.archive_file.auth_complete_profile_zip.output_base64sha256
  handler          = "lambda_auth_complete_profile.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.auth_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      SESSIONS_TABLE_NAME   = aws_dynamodb_table.auth_sessions.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      CONTACT_LIST_NAME     = "WaterwayCleanups"
      TOPIC_NAME            = "volunteer"
    }
  }
}

resource "aws_lambda_permission" "auth_complete_profile_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_complete_profile.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.auth_complete_profile_post.http_method}${aws_api_gateway_resource.auth_complete_profile.path}"
}

resource "aws_api_gateway_resource" "auth_complete_profile" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "auth-complete-profile"
}

# POST method + integration
resource "aws_api_gateway_method" "auth_complete_profile_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.auth_complete_profile.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_complete_profile_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_complete_profile.id
  http_method = aws_api_gateway_method.auth_complete_profile_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.auth_complete_profile.invoke_arn
}

resource "aws_api_gateway_method_response" "auth_complete_profile_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_complete_profile.id
  http_method = aws_api_gateway_method.auth_complete_profile_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_integration_response" "auth_complete_profile_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_complete_profile.id
  http_method = aws_api_gateway_method.auth_complete_profile_post.http_method
  status_code = aws_api_gateway_method_response.auth_complete_profile_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.auth_complete_profile_integration]
}

# OPTIONS (CORS preflight)
resource "aws_api_gateway_method" "auth_complete_profile_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.auth_complete_profile.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_complete_profile_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_complete_profile.id
  http_method = aws_api_gateway_method.auth_complete_profile_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_complete_profile_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_complete_profile.id
  http_method = aws_api_gateway_method.auth_complete_profile_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "auth_complete_profile_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_complete_profile.id
  http_method = aws_api_gateway_method.auth_complete_profile_options.http_method
  status_code = aws_api_gateway_method_response.auth_complete_profile_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}
