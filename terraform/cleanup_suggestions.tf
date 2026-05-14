# Cleanup Suggestions - Public form for residents to suggest cleanup locations

# ===== DYNAMODB TABLE =====

resource "aws_dynamodb_table" "cleanup_suggestions" {
  name         = "cleanup_suggestions${local.dynamodb_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "suggestion_id"

  attribute {
    name = "suggestion_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  global_secondary_index {
    name            = "status-created_at-index"
    hash_key        = "status"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "cleanup-suggestions${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== LAMBDA =====

data "archive_file" "cleanup_suggestions_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_cleanup_suggestions.py"
  output_path = "${path.module}/lambda_cleanup_suggestions.zip"
}

resource "aws_lambda_function" "cleanup_suggestions" {
  filename         = data.archive_file.cleanup_suggestions_zip.output_path
  function_name    = "cleanup_suggestions${local.resource_suffix}"
  role             = aws_iam_role.cleanup_suggestions_role.arn
  handler          = "lambda_cleanup_suggestions.handler"
  source_code_hash = data.archive_file.cleanup_suggestions_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      SUGGESTIONS_TABLE_NAME = aws_dynamodb_table.cleanup_suggestions.name
      SESSION_TABLE_NAME     = aws_dynamodb_table.auth_sessions.name
    }
  }

  tags = {
    Name        = "cleanup-suggestions${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== IAM =====

resource "aws_iam_role" "cleanup_suggestions_role" {
  name = "cleanup_suggestions_role${local.resource_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Principal = { Service = "lambda.amazonaws.com" },
      Effect    = "Allow"
    }]
  })
}

resource "aws_iam_policy" "cleanup_suggestions_policy" {
  name = "cleanup_suggestions_policy${local.resource_suffix}"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action   = ["dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:UpdateItem", "dynamodb:GetItem"],
        Resource = [aws_dynamodb_table.cleanup_suggestions.arn, "${aws_dynamodb_table.cleanup_suggestions.arn}/index/*"],
        Effect   = "Allow"
      },
      {
        Action   = ["dynamodb:GetItem", "dynamodb:Query"],
        Resource = [aws_dynamodb_table.auth_sessions.arn, "${aws_dynamodb_table.auth_sessions.arn}/index/*"],
        Effect   = "Allow"
      },
      {
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource = "arn:aws:logs:*:*:*",
        Effect   = "Allow"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "cleanup_suggestions_attachment" {
  role       = aws_iam_role.cleanup_suggestions_role.name
  policy_arn = aws_iam_policy.cleanup_suggestions_policy.arn
}

# ===== API GATEWAY =====

resource "aws_api_gateway_resource" "cleanup_suggestions" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "cleanup-suggestions"
}

resource "aws_api_gateway_method" "cleanup_suggestions_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.cleanup_suggestions.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cleanup_suggestions_get" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.cleanup_suggestions.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cleanup_suggestions_post_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.cleanup_suggestions.id
  http_method             = aws_api_gateway_method.cleanup_suggestions_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cleanup_suggestions.invoke_arn
}

resource "aws_api_gateway_integration" "cleanup_suggestions_get_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.cleanup_suggestions.id
  http_method             = aws_api_gateway_method.cleanup_suggestions_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cleanup_suggestions.invoke_arn
}

# OPTIONS for CORS
resource "aws_api_gateway_method" "cleanup_suggestions_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.cleanup_suggestions.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cleanup_suggestions_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cleanup_suggestions.id
  http_method = aws_api_gateway_method.cleanup_suggestions_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "cleanup_suggestions_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cleanup_suggestions.id
  http_method = aws_api_gateway_method.cleanup_suggestions_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cleanup_suggestions_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cleanup_suggestions.id
  http_method = aws_api_gateway_method.cleanup_suggestions_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST,GET'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_integration.cleanup_suggestions_options_integration]
}

resource "aws_lambda_permission" "cleanup_suggestions_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cleanup_suggestions.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}
