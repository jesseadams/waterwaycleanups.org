# Minors Graduate Endpoint - Converts aged-out minor to full volunteer account

data "archive_file" "minors_graduate_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_minors_graduate.py"
  output_path = "${path.module}/lambda_minors_graduate.zip"
}

resource "aws_lambda_function" "minors_graduate" {
  filename         = data.archive_file.minors_graduate_zip.output_path
  function_name    = "minors_graduate${local.resource_suffix}"
  role             = aws_iam_role.auth_lambda_role.arn
  handler          = "lambda_minors_graduate.handler"
  source_code_hash = data.archive_file.minors_graduate_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60
  memory_size      = 128

  environment {
    variables = {
      MINORS_TABLE_NAME     = aws_dynamodb_table.minors.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.event_rsvps.name
      SESSION_TABLE_NAME    = aws_dynamodb_table.auth_sessions.name
    }
  }

  tags = {
    Name        = "minors-graduate${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_api_gateway_resource" "minors_graduate" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "minors-graduate"
}

resource "aws_api_gateway_method" "minors_graduate_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_graduate.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_graduate_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.minors_graduate.id
  http_method             = aws_api_gateway_method.minors_graduate_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.minors_graduate.invoke_arn
}

resource "aws_api_gateway_method" "minors_graduate_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_graduate.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_graduate_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_graduate.id
  http_method = aws_api_gateway_method.minors_graduate_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "minors_graduate_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_graduate.id
  http_method = aws_api_gateway_method.minors_graduate_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "minors_graduate_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_graduate.id
  http_method = aws_api_gateway_method.minors_graduate_options.http_method
  status_code = aws_api_gateway_method_response.minors_graduate_options_response.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_integration.minors_graduate_options_integration]
}

resource "aws_lambda_permission" "minors_graduate_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.minors_graduate.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}
