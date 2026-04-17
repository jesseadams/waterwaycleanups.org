# Admin Send Reminder Endpoint - Terraform Configuration
# Allows admins to send email messages/reminders to all RSVPed attendees for an event

# Lambda zip
data "archive_file" "admin_send_reminder_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_admin_send_reminder.py"
  output_path = "${path.module}/lambda_admin_send_reminder.zip"
}

# Lambda function
resource "aws_lambda_function" "admin_send_reminder" {
  filename         = data.archive_file.admin_send_reminder_zip.output_path
  function_name    = "admin_send_reminder${local.resource_suffix}"
  role             = aws_iam_role.auth_lambda_role.arn
  handler          = "lambda_admin_send_reminder.handler"
  source_code_hash = data.archive_file.admin_send_reminder_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60
  memory_size      = 128

  environment {
    variables = {
      SESSION_TABLE_NAME = aws_dynamodb_table.auth_sessions.name
      RSVPS_TABLE_NAME   = aws_dynamodb_table.event_rsvps.name
      EVENTS_TABLE_NAME  = aws_dynamodb_table.events.name
    }
  }

  tags = {
    Name        = "admin-send-reminder${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# API Gateway resource
resource "aws_api_gateway_resource" "admin_send_reminder" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "admin-send-reminder"
}

# POST method
resource "aws_api_gateway_method" "admin_send_reminder_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.admin_send_reminder.id
  http_method   = "POST"
  authorization = "NONE"
}

# POST integration
resource "aws_api_gateway_integration" "admin_send_reminder_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_send_reminder.id
  http_method = aws_api_gateway_method.admin_send_reminder_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.admin_send_reminder.invoke_arn
}

# POST method response
resource "aws_api_gateway_method_response" "admin_send_reminder_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_send_reminder.id
  http_method = aws_api_gateway_method.admin_send_reminder_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# POST integration response
resource "aws_api_gateway_integration_response" "admin_send_reminder_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_send_reminder.id
  http_method = aws_api_gateway_method.admin_send_reminder_post.http_method
  status_code = aws_api_gateway_method_response.admin_send_reminder_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.admin_send_reminder_integration]
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "admin_send_reminder_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.admin_send_reminder.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_send_reminder_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_send_reminder.id
  http_method = aws_api_gateway_method.admin_send_reminder_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_send_reminder_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_send_reminder.id
  http_method = aws_api_gateway_method.admin_send_reminder_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "admin_send_reminder_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_send_reminder.id
  http_method = aws_api_gateway_method.admin_send_reminder_options.http_method
  status_code = aws_api_gateway_method_response.admin_send_reminder_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [
    aws_api_gateway_integration.admin_send_reminder_options_integration
  ]
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "admin_send_reminder_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin_send_reminder.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}
