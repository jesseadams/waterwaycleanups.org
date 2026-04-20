# Impact Templates System - Terraform Configuration
# DynamoDB table, Lambda function, and API Gateway for impact map templates

# ===== DYNAMODB TABLE =====

resource "aws_dynamodb_table" "impact_templates" {
  name         = "impact_templates${local.dynamodb_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "template_id"

  attribute {
    name = "template_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "impact-templates${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== IAM ROLE AND POLICY =====

resource "aws_iam_role" "impact_templates_lambda_role" {
  name = "impact_templates_lambda_role${local.resource_suffix}"

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
    Name        = "impact-templates-lambda-role${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_iam_policy" "impact_templates_lambda_policy" {
  name        = "impact_templates_lambda_policy${local.resource_suffix}"
  description = "IAM policy for impact templates lambda"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan"
        ],
        Resource = [
          aws_dynamodb_table.impact_templates.arn
        ],
        Effect = "Allow"
      },
      {
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query"
        ],
        Resource = [
          aws_dynamodb_table.auth_sessions.arn,
          "${aws_dynamodb_table.auth_sessions.arn}/index/*"
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
    Name        = "impact-templates-lambda-policy${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_iam_role_policy_attachment" "impact_templates_lambda_attachment" {
  role       = aws_iam_role.impact_templates_lambda_role.name
  policy_arn = aws_iam_policy.impact_templates_lambda_policy.arn
}

# ===== LAMBDA FUNCTION =====

data "archive_file" "impact_templates_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_impact_templates.py"
  output_path = "${path.module}/lambda_impact_templates.zip"
}

resource "aws_lambda_function" "impact_templates" {
  filename         = data.archive_file.impact_templates_zip.output_path
  function_name    = "impact_templates${local.resource_suffix}"
  role             = aws_iam_role.impact_templates_lambda_role.arn
  handler          = "lambda_impact_templates.handler"
  source_code_hash = data.archive_file.impact_templates_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      SESSION_TABLE_NAME          = aws_dynamodb_table.auth_sessions.name
      IMPACT_TEMPLATES_TABLE_NAME = aws_dynamodb_table.impact_templates.name
    }
  }

  tags = {
    Name        = "impact-templates${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== API GATEWAY INTEGRATION =====

# /impact-templates resource on the volunteer waiver API (same gateway as other admin endpoints)
resource "aws_api_gateway_resource" "impact_templates" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "impact-templates"
}

# GET method (public - list/get templates)
resource "aws_api_gateway_method" "impact_templates_get" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.impact_templates.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "impact_templates_get_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.impact_templates.id
  http_method             = aws_api_gateway_method.impact_templates_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.impact_templates.invoke_arn
}

resource "aws_api_gateway_method_response" "impact_templates_get_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.impact_templates.id
  http_method = aws_api_gateway_method.impact_templates_get.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_integration_response" "impact_templates_get_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.impact_templates.id
  http_method = aws_api_gateway_method.impact_templates_get.http_method
  status_code = aws_api_gateway_method_response.impact_templates_get_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.impact_templates_get_integration]
}

# POST method (admin - save/delete templates)
resource "aws_api_gateway_method" "impact_templates_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.impact_templates.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "impact_templates_post_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.impact_templates.id
  http_method             = aws_api_gateway_method.impact_templates_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.impact_templates.invoke_arn
}

resource "aws_api_gateway_method_response" "impact_templates_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.impact_templates.id
  http_method = aws_api_gateway_method.impact_templates_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_integration_response" "impact_templates_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.impact_templates.id
  http_method = aws_api_gateway_method.impact_templates_post.http_method
  status_code = aws_api_gateway_method_response.impact_templates_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.impact_templates_post_integration]
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "impact_templates_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.impact_templates.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "impact_templates_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.impact_templates.id
  http_method = aws_api_gateway_method.impact_templates_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "impact_templates_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.impact_templates.id
  http_method = aws_api_gateway_method.impact_templates_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "impact_templates_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.impact_templates.id
  http_method = aws_api_gateway_method.impact_templates_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [
    aws_api_gateway_integration.impact_templates_options_integration
  ]
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "impact_templates_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.impact_templates.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}

# ===== OUTPUTS =====

output "impact_templates_table_name" {
  description = "Name of the impact templates DynamoDB table"
  value       = aws_dynamodb_table.impact_templates.name
}

output "impact_templates_function_name" {
  description = "Name of the impact templates Lambda function"
  value       = aws_lambda_function.impact_templates.function_name
}

output "impact_templates_api_endpoint" {
  description = "API endpoint for impact templates"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/impact-templates"
}
