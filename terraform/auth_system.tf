# Authentication System - Terraform Configuration

# Create DynamoDB tables for authentication system
resource "aws_dynamodb_table" "auth_codes" {
  name         = "auth_codes${local.dynamodb_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "auth-codes${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_dynamodb_table" "auth_sessions" {
  name         = "auth_sessions${local.dynamodb_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "session_token"

  attribute {
    name = "session_token"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "auth-sessions${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Auth Lambda function zip files
data "archive_file" "auth_send_code_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_auth_send_code.py"
  output_path = "${path.module}/lambda_auth_send_code.zip"
}

data "archive_file" "auth_verify_code_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_auth_verify_code.py"
  output_path = "${path.module}/lambda_auth_verify_code.zip"
}

data "archive_file" "auth_validate_session_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_auth_validate_session.py"
  output_path = "${path.module}/lambda_auth_validate_session.zip"
}

data "archive_file" "user_dashboard_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_user_dashboard.py"
  output_path = "${path.module}/lambda_user_dashboard.zip"
}

# IAM Role for Auth Lambda functions
resource "aws_iam_role" "auth_lambda_role" {
  name = "auth_lambda_role${local.resource_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Effect = "Allow",
        Sid    = ""
      }
    ]
  })
}

# IAM Policy for Auth Lambda functions
resource "aws_iam_policy" "auth_lambda_policy" {
  name        = "auth_lambda_policy${local.resource_suffix}"
  description = "IAM policy for auth lambda functions"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ],
        Resource = [
          aws_dynamodb_table.auth_codes.arn,
          aws_dynamodb_table.auth_sessions.arn,
          aws_dynamodb_table.volunteer_waivers.arn,
          aws_dynamodb_table.event_rsvps.arn,
          # New normalized tables
          aws_dynamodb_table.events.arn,
          aws_dynamodb_table.volunteers.arn,
          aws_dynamodb_table.rsvps.arn,
          "${aws_dynamodb_table.auth_codes.arn}/index/*",
          "${aws_dynamodb_table.auth_sessions.arn}/index/*",
          "${aws_dynamodb_table.volunteer_waivers.arn}/index/*",
          "${aws_dynamodb_table.event_rsvps.arn}/index/*",
          # New normalized table indexes
          "${aws_dynamodb_table.events.arn}/index/*",
          "${aws_dynamodb_table.volunteers.arn}/index/*",
          "${aws_dynamodb_table.rsvps.arn}/index/*"
        ],
        Effect = "Allow"
      },
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "arn:aws:logs:*:*:*",
        Effect   = "Allow"
      },
      {
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ],
        Resource = "*",
        Effect   = "Allow"
      }
    ]
  })
}

# Attach auth policy to auth role
resource "aws_iam_role_policy_attachment" "auth_lambda_attachment" {
  role       = aws_iam_role.auth_lambda_role.name
  policy_arn = aws_iam_policy.auth_lambda_policy.arn
}

# Auth Lambda functions
resource "aws_lambda_function" "auth_send_code" {
  function_name    = "auth_send_code${local.resource_suffix}"
  filename         = data.archive_file.auth_send_code_zip.output_path
  source_code_hash = data.archive_file.auth_send_code_zip.output_base64sha256
  handler          = "lambda_auth_send_code.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.auth_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      AUTH_TABLE_NAME = aws_dynamodb_table.auth_codes.name
    }
  }
}

resource "aws_lambda_function" "auth_verify_code" {
  function_name    = "auth_verify_code${local.resource_suffix}"
  filename         = data.archive_file.auth_verify_code_zip.output_path
  source_code_hash = data.archive_file.auth_verify_code_zip.output_base64sha256
  handler          = "lambda_auth_verify_code.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.auth_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      AUTH_TABLE_NAME     = aws_dynamodb_table.auth_codes.name
      SESSIONS_TABLE_NAME = aws_dynamodb_table.auth_sessions.name
    }
  }
}

resource "aws_lambda_function" "auth_validate_session" {
  function_name    = "auth_validate_session${local.resource_suffix}"
  filename         = data.archive_file.auth_validate_session_zip.output_path
  source_code_hash = data.archive_file.auth_validate_session_zip.output_base64sha256
  handler          = "lambda_auth_validate_session.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.auth_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      SESSIONS_TABLE_NAME = aws_dynamodb_table.auth_sessions.name
    }
  }
}

resource "aws_lambda_function" "user_dashboard" {
  function_name    = "user_dashboard${local.resource_suffix}"
  filename         = data.archive_file.user_dashboard_zip.output_path
  source_code_hash = data.archive_file.user_dashboard_zip.output_base64sha256
  handler          = "lambda_user_dashboard.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.auth_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      SESSIONS_TABLE_NAME   = aws_dynamodb_table.auth_sessions.name
      WAIVER_TABLE_NAME     = aws_dynamodb_table.volunteer_waivers.name
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.event_rsvps.name
    }
  }
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "auth_send_code_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_send_code.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.auth_send_code_post.http_method}${aws_api_gateway_resource.auth_send_code.path}"
}

resource "aws_lambda_permission" "auth_verify_code_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_verify_code.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.auth_verify_code_post.http_method}${aws_api_gateway_resource.auth_verify_code.path}"
}

resource "aws_lambda_permission" "auth_validate_session_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_validate_session.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.auth_validate_session_post.http_method}${aws_api_gateway_resource.auth_validate_session.path}"
}

resource "aws_lambda_permission" "user_dashboard_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.user_dashboard.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.user_dashboard_post.http_method}${aws_api_gateway_resource.user_dashboard.path}"
}
# API Gateway resources for auth endpoints
resource "aws_api_gateway_resource" "auth_send_code" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "auth-send-code"
}

resource "aws_api_gateway_resource" "auth_verify_code" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "auth-verify-code"
}

resource "aws_api_gateway_resource" "auth_validate_session" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "auth-validate-session"
}

resource "aws_api_gateway_resource" "user_dashboard" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "user-dashboard"
}

# Methods and integrations for auth-send-code endpoint
resource "aws_api_gateway_method" "auth_send_code_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.auth_send_code.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_send_code_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_send_code.id
  http_method = aws_api_gateway_method.auth_send_code_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.auth_send_code.invoke_arn
}

resource "aws_api_gateway_method_response" "auth_send_code_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_send_code.id
  http_method = aws_api_gateway_method.auth_send_code_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_integration_response" "auth_send_code_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_send_code.id
  http_method = aws_api_gateway_method.auth_send_code_post.http_method
  status_code = aws_api_gateway_method_response.auth_send_code_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.auth_send_code_integration]
}

resource "aws_api_gateway_method" "auth_send_code_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.auth_send_code.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_send_code_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_send_code.id
  http_method = aws_api_gateway_method.auth_send_code_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_send_code_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_send_code.id
  http_method = aws_api_gateway_method.auth_send_code_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "auth_send_code_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_send_code.id
  http_method = aws_api_gateway_method.auth_send_code_options.http_method
  status_code = aws_api_gateway_method_response.auth_send_code_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# Methods and integrations for auth-verify-code endpoint
resource "aws_api_gateway_method" "auth_verify_code_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.auth_verify_code.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_verify_code_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_verify_code.id
  http_method = aws_api_gateway_method.auth_verify_code_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.auth_verify_code.invoke_arn
}

resource "aws_api_gateway_method_response" "auth_verify_code_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_verify_code.id
  http_method = aws_api_gateway_method.auth_verify_code_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_integration_response" "auth_verify_code_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_verify_code.id
  http_method = aws_api_gateway_method.auth_verify_code_post.http_method
  status_code = aws_api_gateway_method_response.auth_verify_code_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.auth_verify_code_integration]
}

resource "aws_api_gateway_method" "auth_verify_code_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.auth_verify_code.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_verify_code_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_verify_code.id
  http_method = aws_api_gateway_method.auth_verify_code_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_verify_code_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_verify_code.id
  http_method = aws_api_gateway_method.auth_verify_code_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "auth_verify_code_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_verify_code.id
  http_method = aws_api_gateway_method.auth_verify_code_options.http_method
  status_code = aws_api_gateway_method_response.auth_verify_code_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# Methods and integrations for auth-validate-session endpoint
resource "aws_api_gateway_method" "auth_validate_session_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.auth_validate_session.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_validate_session_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_validate_session.id
  http_method = aws_api_gateway_method.auth_validate_session_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.auth_validate_session.invoke_arn
}

resource "aws_api_gateway_method_response" "auth_validate_session_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_validate_session.id
  http_method = aws_api_gateway_method.auth_validate_session_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_integration_response" "auth_validate_session_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_validate_session.id
  http_method = aws_api_gateway_method.auth_validate_session_post.http_method
  status_code = aws_api_gateway_method_response.auth_validate_session_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.auth_validate_session_integration]
}

resource "aws_api_gateway_method" "auth_validate_session_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.auth_validate_session.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "auth_validate_session_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_validate_session.id
  http_method = aws_api_gateway_method.auth_validate_session_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "auth_validate_session_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_validate_session.id
  http_method = aws_api_gateway_method.auth_validate_session_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "auth_validate_session_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.auth_validate_session.id
  http_method = aws_api_gateway_method.auth_validate_session_options.http_method
  status_code = aws_api_gateway_method_response.auth_validate_session_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# Methods and integrations for user-dashboard endpoint
resource "aws_api_gateway_method" "user_dashboard_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.user_dashboard.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "user_dashboard_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.user_dashboard.id
  http_method = aws_api_gateway_method.user_dashboard_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_dashboard.invoke_arn
}

resource "aws_api_gateway_method_response" "user_dashboard_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.user_dashboard.id
  http_method = aws_api_gateway_method.user_dashboard_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_integration_response" "user_dashboard_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.user_dashboard.id
  http_method = aws_api_gateway_method.user_dashboard_post.http_method
  status_code = aws_api_gateway_method_response.user_dashboard_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.user_dashboard_integration]
}

resource "aws_api_gateway_method" "user_dashboard_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.user_dashboard.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "user_dashboard_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.user_dashboard.id
  http_method = aws_api_gateway_method.user_dashboard_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "user_dashboard_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.user_dashboard.id
  http_method = aws_api_gateway_method.user_dashboard_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "user_dashboard_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.user_dashboard.id
  http_method = aws_api_gateway_method.user_dashboard_options.http_method
  status_code = aws_api_gateway_method_response.user_dashboard_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}