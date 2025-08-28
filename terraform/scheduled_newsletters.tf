# DynamoDB table for scheduled newsletters
resource "aws_dynamodb_table" "scheduled_newsletters" {
  name           = "waterway-cleanups-scheduled-newsletters"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "scheduledTime"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  # Global secondary index for querying by scheduled time
  global_secondary_index {
    name            = "scheduledTime-index"
    hash_key        = "status"
    range_key       = "scheduledTime"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "waterway-cleanups-scheduled-newsletters"
    Environment = "production"
  }
}

# Create Lambda package for process scheduled newsletters
resource "null_resource" "process_scheduled_newsletters_package" {
  provisioner "local-exec" {
    command = <<EOF
rm -rf ${path.module}/lambda_process_package
mkdir -p ${path.module}/lambda_process_package
cp ${path.module}/lambda_process_scheduled_newsletters.py ${path.module}/lambda_process_package/
pip install pytz -t ${path.module}/lambda_process_package/ >/dev/null 2>&1
cd ${path.module}/lambda_process_package && python3 -c "import zipfile; import os; z=zipfile.ZipFile('../lambda_scheduled_newsletters.zip', 'w'); [z.write(os.path.join(root, f), os.path.join(root, f)) for root, _, files in os.walk('.') for f in files]; z.close()"
cd ${path.module} && rm -rf lambda_process_package
EOF
  }

  triggers = {
    code_hash = filemd5("${path.module}/lambda_process_scheduled_newsletters.py")
  }
}

# Archive for process scheduled newsletters Lambda
data "archive_file" "process_scheduled_newsletters" {
  type        = "zip"
  output_path = "${path.module}/lambda_scheduled_newsletters_dummy.zip"
  
  source {
    content  = "dummy"
    filename = "dummy.txt"
  }
  
  depends_on = [null_resource.process_scheduled_newsletters_package]
}

# Lambda function for processing scheduled newsletters
resource "aws_lambda_function" "process_scheduled_newsletters" {
  filename         = "${path.module}/lambda_scheduled_newsletters.zip"
  function_name    = "waterway-cleanups-process-scheduled-newsletters"
  role             = aws_iam_role.scheduled_newsletters_lambda.arn
  handler          = "lambda_process_scheduled_newsletters.handler"
  runtime          = "python3.9"
  timeout          = 300 # 5 minutes
  memory_size      = 512

  environment {
    variables = {
      DYNAMODB_TABLE_NAME     = aws_dynamodb_table.scheduled_newsletters.name
      SOURCE_EMAIL            = "Waterway Cleanups <info@waterwaycleanups.org>"
      REGION                  = var.aws_region
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.scheduled_newsletters_lambda_policy,
    aws_cloudwatch_log_group.scheduled_newsletters_lambda,
    null_resource.process_scheduled_newsletters_package
  ]
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "scheduled_newsletters_lambda" {
  name              = "/aws/lambda/waterway-cleanups-process-scheduled-newsletters"
  retention_in_days = 30
}

# IAM role for Lambda
resource "aws_iam_role" "scheduled_newsletters_lambda" {
  name = "waterway-cleanups-scheduled-newsletters-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM policy for Lambda
resource "aws_iam_policy" "scheduled_newsletters_lambda" {
  name        = "waterway-cleanups-scheduled-newsletters-lambda-policy"
  description = "Policy for scheduled newsletters Lambda function"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          aws_dynamodb_table.scheduled_newsletters.arn,
          "${aws_dynamodb_table.scheduled_newsletters.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendBulkTemplatedEmail",
          "ses:GetTemplate",
          "sesv2:SendEmail",
          "sesv2:GetEmailTemplate",
          "sesv2:ListContacts",
          "sesv2:GetContact",
          "sesv2:GetContactList",
          "sesv2:TestRenderEmailTemplate"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "scheduled_newsletters_lambda_policy" {
  policy_arn = aws_iam_policy.scheduled_newsletters_lambda.arn
  role       = aws_iam_role.scheduled_newsletters_lambda.name
}

# EventBridge rule to trigger Lambda hourly from 9 AM to 4 PM ET
resource "aws_cloudwatch_event_rule" "scheduled_newsletters_trigger" {
  name                = "waterway-cleanups-scheduled-newsletters-trigger"
  description         = "Trigger scheduled newsletter processing hourly between 9 AM and 4 PM ET"
  schedule_expression = "cron(0 13-20 * * ? *)" # 13-20 UTC = 9 AM - 4 PM ET (accounting for EST/EDT)
}

resource "aws_cloudwatch_event_target" "scheduled_newsletters_lambda" {
  rule      = aws_cloudwatch_event_rule.scheduled_newsletters_trigger.name
  target_id = "ProcessScheduledNewslettersLambda"
  arn       = aws_lambda_function.process_scheduled_newsletters.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.process_scheduled_newsletters.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scheduled_newsletters_trigger.arn
}

# API Gateway endpoints for scheduled newsletters
resource "aws_api_gateway_resource" "scheduled_newsletters" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_api.root_resource_id
  path_part   = "scheduled-newsletters"
}

# Create Lambda package for API
resource "null_resource" "scheduled_newsletters_api_package" {
  provisioner "local-exec" {
    command = <<EOF
rm -rf ${path.module}/lambda_api_package
mkdir -p ${path.module}/lambda_api_package
cp ${path.module}/lambda_scheduled_newsletters_api.py ${path.module}/lambda_api_package/
pip install pytz -t ${path.module}/lambda_api_package/ >/dev/null 2>&1
cd ${path.module}/lambda_api_package && python3 -c "import zipfile; import os; z=zipfile.ZipFile('../lambda_scheduled_newsletters_api.zip', 'w'); [z.write(os.path.join(root, f), os.path.join(root, f)) for root, _, files in os.walk('.') for f in files]; z.close()"
cd ${path.module} && rm -rf lambda_api_package
EOF
  }

  triggers = {
    code_hash = filemd5("${path.module}/lambda_scheduled_newsletters_api.py")
  }
}

# Archive for API Lambda
data "archive_file" "scheduled_newsletters_api" {
  type        = "zip"
  output_path = "${path.module}/lambda_scheduled_newsletters_api_dummy.zip"
  
  source {
    content  = "dummy"
    filename = "dummy.txt"
  }
  
  depends_on = [null_resource.scheduled_newsletters_api_package]
}

# Lambda for API endpoints
resource "aws_lambda_function" "scheduled_newsletters_api" {
  filename         = "${path.module}/lambda_scheduled_newsletters_api.zip"
  function_name    = "waterway-cleanups-scheduled-newsletters-api"
  role             = aws_iam_role.scheduled_newsletters_api.arn
  handler          = "lambda_scheduled_newsletters_api.handler"
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.scheduled_newsletters.name
      REGION              = var.aws_region
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.scheduled_newsletters_api_policy,
    aws_cloudwatch_log_group.scheduled_newsletters_api,
    null_resource.scheduled_newsletters_api_package
  ]
}

# CloudWatch Log Group for API Lambda
resource "aws_cloudwatch_log_group" "scheduled_newsletters_api" {
  name              = "/aws/lambda/waterway-cleanups-scheduled-newsletters-api"
  retention_in_days = 30
}

# IAM role for API Lambda
resource "aws_iam_role" "scheduled_newsletters_api" {
  name = "waterway-cleanups-scheduled-newsletters-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM policy for API Lambda
resource "aws_iam_policy" "scheduled_newsletters_api" {
  name        = "waterway-cleanups-scheduled-newsletters-api-policy"
  description = "Policy for scheduled newsletters API Lambda function"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.scheduled_newsletters.arn,
          "${aws_dynamodb_table.scheduled_newsletters.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sesv2:ListContacts",
          "sesv2:GetContactList"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "scheduled_newsletters_api_policy" {
  policy_arn = aws_iam_policy.scheduled_newsletters_api.arn
  role       = aws_iam_role.scheduled_newsletters_api.name
}

# API Gateway Lambda integration
resource "aws_api_gateway_method" "scheduled_newsletters_any" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  resource_id   = aws_api_gateway_resource.scheduled_newsletters.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "scheduled_newsletters_lambda" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.scheduled_newsletters.id
  http_method = aws_api_gateway_method.scheduled_newsletters_any.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.scheduled_newsletters_api.invoke_arn
}

# OPTIONS method for CORS support
resource "aws_api_gateway_method" "scheduled_newsletters_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  resource_id   = aws_api_gateway_resource.scheduled_newsletters.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "scheduled_newsletters_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.scheduled_newsletters.id
  http_method = aws_api_gateway_method.scheduled_newsletters_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "scheduled_newsletters_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.scheduled_newsletters.id
  http_method = aws_api_gateway_method.scheduled_newsletters_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "scheduled_newsletters_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.scheduled_newsletters.id
  http_method = aws_api_gateway_method.scheduled_newsletters_options.http_method
  status_code = aws_api_gateway_method_response.scheduled_newsletters_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,GET,POST,PUT,DELETE'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  
  depends_on = [
    aws_api_gateway_integration.scheduled_newsletters_options_integration
  ]
}

resource "aws_lambda_permission" "api_gateway_scheduled_newsletters" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduled_newsletters_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_api.execution_arn}/*/*"
}


# CloudWatch Alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "scheduled_newsletters_errors" {
  alarm_name          = "waterway-cleanups-scheduled-newsletters-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "3"
  alarm_description   = "This metric monitors scheduled newsletter processing errors"

  dimensions = {
    FunctionName = aws_lambda_function.process_scheduled_newsletters.function_name
  }

  # You can add SNS topic for alerts if needed
  # alarm_actions = [aws_sns_topic.alerts.arn]
}

# Output the API Gateway URL for scheduled newsletters
output "scheduled_newsletters_api_url" {
  description = "URL for scheduled newsletters API"
  value       = "${aws_api_gateway_stage.prod.invoke_url}/scheduled-newsletters"
}

# Create SSM Parameter for frontend to use
resource "aws_ssm_parameter" "scheduled_newsletters_api_url" {
  name        = "/waterwaycleanups/scheduled_newsletters_api_url"
  description = "URL for scheduled newsletters API"
  type        = "String"
  value       = "${aws_api_gateway_stage.prod.invoke_url}/scheduled-newsletters"
  
  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Output the full API Gateway base URL for the SESv2 Admin app
output "api_gateway_base_url" {
  description = "Base URL for API Gateway (for REACT_APP_API_GATEWAY_URL)"
  value       = aws_api_gateway_stage.prod.invoke_url
}

# Create SSM Parameter for the base API Gateway URL
resource "aws_ssm_parameter" "api_gateway_base_url" {
  name        = "/waterwaycleanups/api_gateway_base_url"
  description = "Base URL for API Gateway"
  type        = "String"
  value       = aws_api_gateway_stage.prod.invoke_url
  
  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Create SSM Parameter specifically for the SESv2 Admin app
resource "aws_ssm_parameter" "sesv2_admin_api_gateway_url" {
  name        = "/waterwaycleanups/sesv2-admin/${var.environment}/REACT_APP_API_GATEWAY_URL"
  description = "API Gateway URL for SESv2 Admin app"
  type        = "String"
  value       = aws_api_gateway_stage.prod.invoke_url
  
  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
    Application = "sesv2-admin"
  }
}
