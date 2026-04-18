# Leaderboard - Public API endpoint for volunteer points leaderboard

data "archive_file" "leaderboard_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_leaderboard.py"
  output_path = "${path.module}/lambda_leaderboard.zip"
}

resource "aws_lambda_function" "leaderboard" {
  filename         = data.archive_file.leaderboard_zip.output_path
  function_name    = "leaderboard${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_leaderboard.handler"
  source_code_hash = data.archive_file.leaderboard_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60
  memory_size      = 128

  environment {
    variables = {
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.event_rsvps.name
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
    }
  }

  tags = {
    Name        = "leaderboard${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# API Gateway resource
resource "aws_api_gateway_resource" "leaderboard" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "leaderboard"
}

# GET method (public, no auth)
resource "aws_api_gateway_method" "leaderboard_get" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.leaderboard.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "leaderboard_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.leaderboard.id
  http_method = aws_api_gateway_method.leaderboard_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.leaderboard.invoke_arn
}

# OPTIONS for CORS
resource "aws_api_gateway_method" "leaderboard_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.leaderboard.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "leaderboard_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.leaderboard.id
  http_method = aws_api_gateway_method.leaderboard_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "leaderboard_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.leaderboard.id
  http_method = aws_api_gateway_method.leaderboard_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "leaderboard_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.leaderboard.id
  http_method = aws_api_gateway_method.leaderboard_options.http_method
  status_code = aws_api_gateway_method_response.leaderboard_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.leaderboard_options_integration]
}

# Lambda permission
resource "aws_lambda_permission" "leaderboard_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.leaderboard.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}
