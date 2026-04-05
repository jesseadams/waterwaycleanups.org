# Content Sync System - Terraform Configuration
# Manages event content editing, publishes to events table, triggers GitHub Actions rebuild

# ===== DYNAMODB TABLE FOR CONTENT EDITS =====

resource "aws_dynamodb_table" "content_edits" {
  name         = "content_edits${local.dynamodb_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "edit_id"

  attribute {
    name = "edit_id"
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

  # GSI for querying by status
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
    Name        = "content-edits${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== IAM ROLE AND POLICY FOR CONTENT SYNC LAMBDA =====

resource "aws_iam_role" "content_sync_lambda_role" {
  name = "content_sync_lambda_role${local.resource_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Effect = "Allow"
      }
    ]
  })

  tags = {
    Name        = "content-sync-lambda-role${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_iam_policy" "content_sync_lambda_policy" {
  name        = "content_sync_lambda_policy${local.resource_suffix}"
  description = "IAM policy for content sync lambda to access DynamoDB tables, sessions, and SSM parameters"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ],
        Resource = [
          aws_dynamodb_table.content_edits.arn,
          "${aws_dynamodb_table.content_edits.arn}/index/*",
          aws_dynamodb_table.auth_sessions.arn,
          "${aws_dynamodb_table.auth_sessions.arn}/index/*",
          aws_dynamodb_table.events.arn,
          "${aws_dynamodb_table.events.arn}/index/*"
        ],
        Effect = "Allow"
      },
      {
        Action = [
          "ssm:GetParameter"
        ],
        Resource = [
          "arn:aws:ssm:${var.aws_region}:*:parameter/waterwaycleanups/shared/github_token"
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
      }
    ]
  })

  tags = {
    Name        = "content-sync-lambda-policy${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_iam_role_policy_attachment" "content_sync_lambda_attachment" {
  role       = aws_iam_role.content_sync_lambda_role.name
  policy_arn = aws_iam_policy.content_sync_lambda_policy.arn
}

# ===== LAMBDA FUNCTION FOR CONTENT SYNC =====

# Create ZIP file for content sync Lambda
data "archive_file" "admin_content_sync_zip" {
  type        = "zip"
  source_file = "${path.module}/../api/lambda_admin_content_sync.py"
  output_path = "${path.module}/lambda_admin_content_sync.zip"
}

resource "aws_lambda_function" "admin_content_sync" {
  filename         = data.archive_file.admin_content_sync_zip.output_path
  function_name    = "admin_content_sync${local.resource_suffix}"
  role             = aws_iam_role.content_sync_lambda_role.arn
  handler          = "lambda_admin_content_sync.handler"
  source_code_hash = data.archive_file.admin_content_sync_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60

  environment {
    variables = {
      SESSION_TABLE_NAME       = aws_dynamodb_table.auth_sessions.name
      CONTENT_EDITS_TABLE_NAME = aws_dynamodb_table.content_edits.name
      EVENTS_TABLE_NAME        = aws_dynamodb_table.events.name
      GITHUB_TOKEN_PARAMETER   = "/waterwaycleanups/shared/github_token"
      GITHUB_REPO              = var.github_repo
      GITHUB_BRANCH            = var.github_branch
    }
  }

  tags = {
    Name        = "admin-content-sync${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== API GATEWAY INTEGRATION =====

# Create /admin-content-sync resource in the volunteer waiver API (same as other admin endpoints)
resource "aws_api_gateway_resource" "admin_content_sync" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "admin-content-sync"
}

# POST method for content sync
resource "aws_api_gateway_method" "admin_content_sync_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.admin_content_sync.id
  http_method   = "POST"
  authorization = "NONE"
}

# Lambda integration
resource "aws_api_gateway_integration" "admin_content_sync_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.admin_content_sync.id
  http_method             = aws_api_gateway_method.admin_content_sync_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.admin_content_sync.invoke_arn
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "admin_content_sync_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.admin_content_sync.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_content_sync_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_content_sync.id
  http_method = aws_api_gateway_method.admin_content_sync_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_content_sync_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_content_sync.id
  http_method = aws_api_gateway_method.admin_content_sync_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "admin_content_sync_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.admin_content_sync.id
  http_method = aws_api_gateway_method.admin_content_sync_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [
    aws_api_gateway_integration.admin_content_sync_options_integration
  ]
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "admin_content_sync_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin_content_sync.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}

# ===== OUTPUTS =====

output "content_edits_table_name" {
  description = "Name of the content edits DynamoDB table"
  value       = aws_dynamodb_table.content_edits.name
}

output "admin_content_sync_function_name" {
  description = "Name of the admin content sync Lambda function"
  value       = aws_lambda_function.admin_content_sync.function_name
}

output "admin_content_sync_api_endpoint" {
  description = "API endpoint for admin content sync"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/admin-content-sync"
}
