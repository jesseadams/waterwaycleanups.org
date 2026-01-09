# Event RSVP System - Terraform Configuration

# Load event RSVPs table schema from JSON
locals {
  event_rsvps_schema = jsondecode(file("${path.module}/../schemas/event-rsvps-table.json"))
}

# Create DynamoDB table for storing event RSVPs
resource "aws_dynamodb_table" "event_rsvps" {
  name         = local.event_rsvps_schema.table_name
  billing_mode = local.event_rsvps_schema.billing_mode
  hash_key     = local.event_rsvps_schema.hash_key
  range_key    = local.event_rsvps_schema.range_key

  # Create attributes dynamically from schema
  dynamic "attribute" {
    for_each = local.event_rsvps_schema.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "event-rsvps"
    Environment = var.environment
    Project     = "waterwaycleanups"
    Schema      = "event-rsvps-table.json"
  }
}

# IAM Role for Lambda functions to access DynamoDB
resource "aws_iam_role" "event_rsvp_lambda_role" {
  name = "event_rsvp_lambda_role"

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
resource "aws_iam_policy" "event_rsvp_lambda_policy" {
  name        = "event_rsvp_lambda_policy"
  description = "IAM policy for event RSVP lambda functions"

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
          aws_dynamodb_table.event_rsvps.arn,
          "${aws_dynamodb_table.event_rsvps.arn}/index/*"
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
          "sns:Publish"
        ],
        Resource = [
          aws_sns_topic.event_rsvp_topic.arn
        ],
        Effect = "Allow"
      }
    ]
  })
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "event_rsvp_lambda_attachment" {
  role       = aws_iam_role.event_rsvp_lambda_role.name
  policy_arn = aws_iam_policy.event_rsvp_lambda_policy.arn
}

# Create SNS topic for event RSVP notifications
resource "aws_sns_topic" "event_rsvp_topic" {
  name = "event-rsvp-notifications"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Zip the Lambda function code
data "archive_file" "event_rsvp_check_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_event_rsvp_check.py"
  output_path = "${path.module}/lambda_event_rsvp_check.zip"
}

data "archive_file" "event_rsvp_submit_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_event_rsvp_submit.py"
  output_path = "${path.module}/lambda_event_rsvp_submit.zip"
}

data "archive_file" "event_rsvp_list_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_event_rsvp_list.py"
  output_path = "${path.module}/lambda_event_rsvp_list.zip"
}

# Create Lambda function for checking event RSVPs
resource "aws_lambda_function" "event_rsvp_check" {
  function_name    = "event_rsvp_check"
  filename         = data.archive_file.event_rsvp_check_zip.output_path
  source_code_hash = data.archive_file.event_rsvp_check_zip.output_base64sha256
  handler          = "lambda_event_rsvp_check.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.event_rsvp_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      RSVP_TABLE_NAME = aws_dynamodb_table.event_rsvps.name
    }
  }
}

# Create Lambda function for submitting event RSVPs
resource "aws_lambda_function" "event_rsvp_submit" {
  function_name    = "event_rsvp_submit"
  filename         = data.archive_file.event_rsvp_submit_zip.output_path
  source_code_hash = data.archive_file.event_rsvp_submit_zip.output_base64sha256
  handler          = "lambda_event_rsvp_submit.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.event_rsvp_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      RSVP_TABLE_NAME = aws_dynamodb_table.event_rsvps.name
      SNS_TOPIC_ARN   = aws_sns_topic.event_rsvp_topic.arn
    }
  }
}

# Create Lambda function for listing event RSVPs
resource "aws_lambda_function" "event_rsvp_list" {
  function_name    = "event_rsvp_list"
  filename         = data.archive_file.event_rsvp_list_zip.output_path
  source_code_hash = data.archive_file.event_rsvp_list_zip.output_base64sha256
  handler          = "lambda_event_rsvp_list.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.event_rsvp_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      RSVP_TABLE_NAME = aws_dynamodb_table.event_rsvps.name
    }
  }
}

# Create API Gateway resources
resource "aws_api_gateway_resource" "check_rsvp" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "check-event-rsvp"
}

resource "aws_api_gateway_resource" "submit_rsvp" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "submit-event-rsvp"
}

resource "aws_api_gateway_resource" "list_rsvps" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "list-event-rsvps"
}

# Methods for check-event-rsvp endpoint
resource "aws_api_gateway_method" "check_rsvp_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.check_rsvp.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "check_rsvp_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_rsvp.id
  http_method = aws_api_gateway_method.check_rsvp_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.event_rsvp_check.invoke_arn
}

# Methods for submit-event-rsvp endpoint
resource "aws_api_gateway_method" "submit_rsvp_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.submit_rsvp.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "submit_rsvp_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_rsvp.id
  http_method = aws_api_gateway_method.submit_rsvp_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.event_rsvp_submit.invoke_arn
}

# OPTIONS method for CORS support - check endpoint
resource "aws_api_gateway_method" "check_rsvp_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.check_rsvp.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "check_rsvp_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_rsvp.id
  http_method = aws_api_gateway_method.check_rsvp_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "check_rsvp_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_rsvp.id
  http_method = aws_api_gateway_method.check_rsvp_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "check_rsvp_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_rsvp.id
  http_method = aws_api_gateway_method.check_rsvp_options.http_method
  status_code = aws_api_gateway_method_response.check_rsvp_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# OPTIONS method for CORS support - submit endpoint
resource "aws_api_gateway_method" "submit_rsvp_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.submit_rsvp.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "submit_rsvp_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_rsvp.id
  http_method = aws_api_gateway_method.submit_rsvp_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "submit_rsvp_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_rsvp.id
  http_method = aws_api_gateway_method.submit_rsvp_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "submit_rsvp_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_rsvp.id
  http_method = aws_api_gateway_method.submit_rsvp_options.http_method
  status_code = aws_api_gateway_method_response.submit_rsvp_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Methods for list-event-rsvps endpoint
resource "aws_api_gateway_method" "list_rsvps_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.list_rsvps.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "list_rsvps_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.list_rsvps.id
  http_method = aws_api_gateway_method.list_rsvps_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.event_rsvp_list.invoke_arn
}

# OPTIONS method for CORS support - list endpoint
resource "aws_api_gateway_method" "list_rsvps_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.list_rsvps.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "list_rsvps_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.list_rsvps.id
  http_method = aws_api_gateway_method.list_rsvps_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "list_rsvps_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.list_rsvps.id
  http_method = aws_api_gateway_method.list_rsvps_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "list_rsvps_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.list_rsvps.id
  http_method = aws_api_gateway_method.list_rsvps_options.http_method
  status_code = aws_api_gateway_method_response.list_rsvps_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "check_rsvp_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_rsvp_check.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.check_rsvp_post.http_method}${aws_api_gateway_resource.check_rsvp.path}"
}

resource "aws_lambda_permission" "submit_rsvp_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_rsvp_submit.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.submit_rsvp_post.http_method}${aws_api_gateway_resource.submit_rsvp.path}"
}

resource "aws_lambda_permission" "list_rsvps_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_rsvp_list.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.list_rsvps_post.http_method}${aws_api_gateway_resource.list_rsvps.path}"
}

# Add Gateway Responses for CORS support
resource "aws_api_gateway_gateway_response" "rsvp_cors_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,GET,POST'"
  }
}

resource "aws_api_gateway_gateway_response" "rsvp_cors_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,GET,POST'"
  }
}

# API Gateway deployment for all endpoints (both waiver and RSVP)
resource "aws_api_gateway_deployment" "volunteer_waiver_deployment" {
  depends_on = [
    # Waiver endpoints
    aws_api_gateway_integration.check_waiver_integration,
    aws_api_gateway_integration.submit_waiver_integration,
    aws_api_gateway_integration.check_waiver_options_integration,
    aws_api_gateway_integration.submit_waiver_options_integration,
    # RSVP endpoints
    aws_api_gateway_integration.check_rsvp_integration,
    aws_api_gateway_integration.submit_rsvp_integration,
    aws_api_gateway_integration.check_rsvp_options_integration,
    aws_api_gateway_integration.submit_rsvp_options_integration,
    aws_api_gateway_integration.list_rsvps_integration,
    aws_api_gateway_integration.list_rsvps_options_integration
  ]

  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_integration.check_waiver_integration,
      aws_api_gateway_integration.submit_waiver_integration,
      aws_api_gateway_integration.check_waiver_options_integration,
      aws_api_gateway_integration.submit_waiver_options_integration,
      # RSVP endpoints
      aws_api_gateway_integration.check_rsvp_integration,
      aws_api_gateway_integration.submit_rsvp_integration,
      aws_api_gateway_integration.check_rsvp_options_integration,
      aws_api_gateway_integration.submit_rsvp_options_integration,
      aws_api_gateway_integration.list_rsvps_integration,
      aws_api_gateway_integration.list_rsvps_options_integration
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Output the API URLs
output "check_rsvp_url" {
  description = "URL for checking event RSVPs"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.check_rsvp.path_part}"
}

output "submit_rsvp_url" {
  description = "URL for submitting event RSVPs"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.submit_rsvp.path_part}"
}

# Create SSM Parameters for frontend to use
resource "aws_ssm_parameter" "check_rsvp_url" {
  name        = "/waterwaycleanups/check_rsvp_api_url"
  description = "URL for checking event RSVPs"
  type        = "String"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.check_rsvp.path_part}"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_ssm_parameter" "submit_rsvp_url" {
  name        = "/waterwaycleanups/submit_rsvp_api_url"
  description = "URL for submitting event RSVPs"
  type        = "String"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.submit_rsvp.path_part}"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

output "list_rsvps_url" {
  description = "URL for listing event RSVPs"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.list_rsvps.path_part}"
}

resource "aws_ssm_parameter" "list_rsvps_url" {
  name        = "/waterwaycleanups/list_rsvps_api_url"
  description = "URL for listing event RSVPs"
  type        = "String"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.list_rsvps.path_part}"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}
