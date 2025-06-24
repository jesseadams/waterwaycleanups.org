# Volunteer Waiver System - Terraform Configuration

# Create DynamoDB table for storing volunteer waivers
resource "aws_dynamodb_table" "volunteer_waivers" {
  name         = "volunteer_waivers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"
  range_key    = "waiver_id"

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "waiver_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "volunteer-waivers"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# IAM Role for Lambda functions to access DynamoDB
resource "aws_iam_role" "volunteer_waiver_lambda_role" {
  name = "volunteer_waiver_lambda_role"

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

# IAM Policy for Lambda to access DynamoDB and CloudWatch Logs
resource "aws_iam_policy" "volunteer_waiver_lambda_policy" {
  name        = "volunteer_waiver_lambda_policy"
  description = "IAM policy for volunteer waiver lambda functions"

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
          aws_dynamodb_table.volunteer_waivers.arn,
          "${aws_dynamodb_table.volunteer_waivers.arn}/index/*"
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
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "volunteer_waiver_lambda_attachment" {
  role       = aws_iam_role.volunteer_waiver_lambda_role.name
  policy_arn = aws_iam_policy.volunteer_waiver_lambda_policy.arn
}

# Zip the Lambda function code
data "archive_file" "volunteer_waiver_check_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_volunteer_waiver_check.py"
  output_path = "${path.module}/lambda_volunteer_waiver_check.zip"
}

data "archive_file" "volunteer_waiver_submit_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_volunteer_waiver_submit.py"
  output_path = "${path.module}/lambda_volunteer_waiver_submit.zip"
}

# Create Lambda function for checking volunteer waivers
resource "aws_lambda_function" "volunteer_waiver_check" {
  function_name    = "volunteer_waiver_check"
  filename         = data.archive_file.volunteer_waiver_check_zip.output_path
  source_code_hash = data.archive_file.volunteer_waiver_check_zip.output_base64sha256
  handler          = "lambda_volunteer_waiver_check.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.volunteer_waiver_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      WAIVER_TABLE_NAME = aws_dynamodb_table.volunteer_waivers.name
    }
  }
}

# Create Lambda function for submitting volunteer waivers
resource "aws_lambda_function" "volunteer_waiver_submit" {
  function_name    = "volunteer_waiver_submit"
  filename         = data.archive_file.volunteer_waiver_submit_zip.output_path
  source_code_hash = data.archive_file.volunteer_waiver_submit_zip.output_base64sha256
  handler          = "lambda_volunteer_waiver_submit.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.volunteer_waiver_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      WAIVER_TABLE_NAME = aws_dynamodb_table.volunteer_waivers.name
    }
  }
}

# Create API Gateway REST API
resource "aws_api_gateway_rest_api" "volunteer_waiver_api" {
  name        = "volunteer-waiver-api"
  description = "API for volunteer waiver system"
}

# Resources for API Gateway
resource "aws_api_gateway_resource" "check_waiver" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "check-volunteer-waiver"
}

resource "aws_api_gateway_resource" "submit_waiver" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "submit-volunteer-waiver"
}

# Methods for check-volunteer-waiver endpoint
resource "aws_api_gateway_method" "check_waiver_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.check_waiver.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "check_waiver_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_waiver.id
  http_method = aws_api_gateway_method.check_waiver_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteer_waiver_check.invoke_arn
}

# Methods for submit-volunteer-waiver endpoint
resource "aws_api_gateway_method" "submit_waiver_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.submit_waiver.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "submit_waiver_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_waiver.id
  http_method = aws_api_gateway_method.submit_waiver_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteer_waiver_submit.invoke_arn
}

# OPTIONS method for CORS support - check endpoint
resource "aws_api_gateway_method" "check_waiver_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.check_waiver.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "check_waiver_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_waiver.id
  http_method = aws_api_gateway_method.check_waiver_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "check_waiver_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_waiver.id
  http_method = aws_api_gateway_method.check_waiver_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "check_waiver_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_waiver.id
  http_method = aws_api_gateway_method.check_waiver_options.http_method
  status_code = aws_api_gateway_method_response.check_waiver_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# OPTIONS method for CORS support - submit endpoint
resource "aws_api_gateway_method" "submit_waiver_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.submit_waiver.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "submit_waiver_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_waiver.id
  http_method = aws_api_gateway_method.submit_waiver_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "submit_waiver_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_waiver.id
  http_method = aws_api_gateway_method.submit_waiver_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "submit_waiver_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_waiver.id
  http_method = aws_api_gateway_method.submit_waiver_options.http_method
  status_code = aws_api_gateway_method_response.submit_waiver_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "check_waiver_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.volunteer_waiver_check.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.check_waiver_post.http_method}${aws_api_gateway_resource.check_waiver.path}"
}

resource "aws_lambda_permission" "submit_waiver_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.volunteer_waiver_submit.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.submit_waiver_post.http_method}${aws_api_gateway_resource.submit_waiver.path}"
}

# API Gateway deployment
resource "aws_api_gateway_deployment" "volunteer_waiver_deployment" {
  depends_on = [
    aws_api_gateway_integration.check_waiver_integration,
    aws_api_gateway_integration.submit_waiver_integration,
    aws_api_gateway_integration.check_waiver_options_integration,
    aws_api_gateway_integration.submit_waiver_options_integration
  ]

  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  stage_name  = var.environment
}

# Output the API URLs
output "check_waiver_url" {
  description = "URL for checking volunteer waivers"
  value       = "${aws_api_gateway_deployment.volunteer_waiver_deployment.invoke_url}/${aws_api_gateway_resource.check_waiver.path_part}"
}

output "submit_waiver_url" {
  description = "URL for submitting volunteer waivers"
  value       = "${aws_api_gateway_deployment.volunteer_waiver_deployment.invoke_url}/${aws_api_gateway_resource.submit_waiver.path_part}"
}

# Create SSM Parameters for frontend to use
resource "aws_ssm_parameter" "check_waiver_url" {
  name        = "/waterwaycleanups/check_waiver_api_url"
  description = "URL for checking volunteer waivers"
  type        = "String"
  value       = "${aws_api_gateway_deployment.volunteer_waiver_deployment.invoke_url}/${aws_api_gateway_resource.check_waiver.path_part}"
  
  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_ssm_parameter" "submit_waiver_url" {
  name        = "/waterwaycleanups/submit_waiver_api_url"
  description = "URL for submitting volunteer waivers"
  type        = "String"
  value       = "${aws_api_gateway_deployment.volunteer_waiver_deployment.invoke_url}/${aws_api_gateway_resource.submit_waiver.path_part}"
  
  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}
