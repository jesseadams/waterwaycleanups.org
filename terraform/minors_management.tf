# Minors Management System - Terraform Configuration
# Allows volunteers to add minors to their accounts, covered by guardian's waiver

# Create DynamoDB table for minors
resource "aws_dynamodb_table" "minors" {
  name         = "minors${local.dynamodb_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "guardian_email"
  range_key    = "minor_id"

  attribute {
    name = "guardian_email"
    type = "S"
  }

  attribute {
    name = "minor_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "minors${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function zip files for minors management
data "archive_file" "minors_add_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_minors_add.py"
  output_path = "${path.module}/lambda_minors_add.zip"
}

data "archive_file" "minors_list_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_minors_list.py"
  output_path = "${path.module}/lambda_minors_list.zip"
}

data "archive_file" "minors_update_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_minors_update.py"
  output_path = "${path.module}/lambda_minors_update.zip"
}

data "archive_file" "minors_delete_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_minors_delete.py"
  output_path = "${path.module}/lambda_minors_delete.zip"
}

# IAM Role for Minors Lambda functions (reuse auth_lambda_role or create new one)
resource "aws_iam_policy" "minors_lambda_policy" {
  name        = "minors_lambda_policy${local.resource_suffix}"
  description = "IAM policy for minors management lambda functions"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ],
        Resource = [
          aws_dynamodb_table.minors.arn,
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
}

resource "aws_iam_role_policy_attachment" "minors_lambda_policy_attachment" {
  role       = aws_iam_role.auth_lambda_role.name
  policy_arn = aws_iam_policy.minors_lambda_policy.arn
}

# Lambda Functions for Minors Management

# 1. Add Minor Lambda
resource "aws_lambda_function" "minors_add" {
  filename         = data.archive_file.minors_add_zip.output_path
  function_name    = "minors_add${local.resource_suffix}"
  role             = aws_iam_role.auth_lambda_role.arn
  handler          = "lambda_minors_add.handler"
  source_code_hash = data.archive_file.minors_add_zip.output_base64sha256
  runtime          = "python3.11"
  timeout          = 30

  environment {
    variables = {
      MINORS_TABLE_NAME  = aws_dynamodb_table.minors.name
      SESSION_TABLE_NAME = aws_dynamodb_table.auth_sessions.name
    }
  }

  tags = {
    Name        = "minors-add${local.resource_suffix}"
    Environment = var.environment
  }
}

# 2. List Minors Lambda
resource "aws_lambda_function" "minors_list" {
  filename         = data.archive_file.minors_list_zip.output_path
  function_name    = "minors_list${local.resource_suffix}"
  role             = aws_iam_role.auth_lambda_role.arn
  handler          = "lambda_minors_list.handler"
  source_code_hash = data.archive_file.minors_list_zip.output_base64sha256
  runtime          = "python3.11"
  timeout          = 30

  environment {
    variables = {
      MINORS_TABLE_NAME  = aws_dynamodb_table.minors.name
      SESSION_TABLE_NAME = aws_dynamodb_table.auth_sessions.name
    }
  }

  tags = {
    Name        = "minors-list${local.resource_suffix}"
    Environment = var.environment
  }
}

# 3. Update Minor Lambda
resource "aws_lambda_function" "minors_update" {
  filename         = data.archive_file.minors_update_zip.output_path
  function_name    = "minors_update${local.resource_suffix}"
  role             = aws_iam_role.auth_lambda_role.arn
  handler          = "lambda_minors_update.handler"
  source_code_hash = data.archive_file.minors_update_zip.output_base64sha256
  runtime          = "python3.11"
  timeout          = 30

  environment {
    variables = {
      MINORS_TABLE_NAME  = aws_dynamodb_table.minors.name
      SESSION_TABLE_NAME = aws_dynamodb_table.auth_sessions.name
    }
  }

  tags = {
    Name        = "minors-update${local.resource_suffix}"
    Environment = var.environment
  }
}

# 4. Delete Minor Lambda
resource "aws_lambda_function" "minors_delete" {
  filename         = data.archive_file.minors_delete_zip.output_path
  function_name    = "minors_delete${local.resource_suffix}"
  role             = aws_iam_role.auth_lambda_role.arn
  handler          = "lambda_minors_delete.handler"
  source_code_hash = data.archive_file.minors_delete_zip.output_base64sha256
  runtime          = "python3.11"
  timeout          = 30

  environment {
    variables = {
      MINORS_TABLE_NAME       = aws_dynamodb_table.minors.name
      SESSION_TABLE_NAME      = aws_dynamodb_table.auth_sessions.name
      EVENT_RSVPS_TABLE_NAME  = aws_dynamodb_table.event_rsvps.name
      EVENTS_TABLE_NAME       = aws_dynamodb_table.events.name
    }
  }

  tags = {
    Name        = "minors-delete${local.resource_suffix}"
    Environment = var.environment
  }
}

# API Gateway Resources for Minors Management

# 1. /minors-add resource
resource "aws_api_gateway_resource" "minors_add" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "minors-add"
}

# POST method for minors-add
resource "aws_api_gateway_method" "minors_add_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_add.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_add_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.minors_add.id
  http_method             = aws_api_gateway_method.minors_add_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.minors_add.invoke_arn
}

# OPTIONS method for CORS - minors-add
resource "aws_api_gateway_method" "minors_add_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_add.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_add_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_add.id
  http_method = aws_api_gateway_method.minors_add_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "minors_add_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_add.id
  http_method = aws_api_gateway_method.minors_add_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "minors_add_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_add.id
  http_method = aws_api_gateway_method.minors_add_options.http_method
  status_code = aws_api_gateway_method_response.minors_add_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}

# Lambda permission for minors-add
resource "aws_lambda_permission" "minors_add_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.minors_add.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}

# 2. /minors-list resource
resource "aws_api_gateway_resource" "minors_list" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "minors-list"
}

# POST method for minors-list
resource "aws_api_gateway_method" "minors_list_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_list.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_list_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.minors_list.id
  http_method             = aws_api_gateway_method.minors_list_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.minors_list.invoke_arn
}

# OPTIONS method for CORS - minors-list
resource "aws_api_gateway_method" "minors_list_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_list.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_list_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_list.id
  http_method = aws_api_gateway_method.minors_list_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "minors_list_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_list.id
  http_method = aws_api_gateway_method.minors_list_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "minors_list_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_list.id
  http_method = aws_api_gateway_method.minors_list_options.http_method
  status_code = aws_api_gateway_method_response.minors_list_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}

# Lambda permission for minors-list
resource "aws_lambda_permission" "minors_list_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.minors_list.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}

# 3. /minors-update resource
resource "aws_api_gateway_resource" "minors_update" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "minors-update"
}

# POST method for minors-update
resource "aws_api_gateway_method" "minors_update_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_update.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_update_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.minors_update.id
  http_method             = aws_api_gateway_method.minors_update_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.minors_update.invoke_arn
}

# OPTIONS method for CORS - minors-update
resource "aws_api_gateway_method" "minors_update_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_update.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_update_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_update.id
  http_method = aws_api_gateway_method.minors_update_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "minors_update_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_update.id
  http_method = aws_api_gateway_method.minors_update_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "minors_update_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_update.id
  http_method = aws_api_gateway_method.minors_update_options.http_method
  status_code = aws_api_gateway_method_response.minors_update_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}

# Lambda permission for minors-update
resource "aws_lambda_permission" "minors_update_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.minors_update.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}

# 4. /minors-delete resource
resource "aws_api_gateway_resource" "minors_delete" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "minors-delete"
}

# POST method for minors-delete
resource "aws_api_gateway_method" "minors_delete_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_delete.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_delete_integration" {
  rest_api_id             = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id             = aws_api_gateway_resource.minors_delete.id
  http_method             = aws_api_gateway_method.minors_delete_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.minors_delete.invoke_arn
}

# OPTIONS method for CORS - minors-delete
resource "aws_api_gateway_method" "minors_delete_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.minors_delete.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "minors_delete_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_delete.id
  http_method = aws_api_gateway_method.minors_delete_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "minors_delete_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_delete.id
  http_method = aws_api_gateway_method.minors_delete_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "minors_delete_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.minors_delete.id
  http_method = aws_api_gateway_method.minors_delete_options.http_method
  status_code = aws_api_gateway_method_response.minors_delete_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}

# Lambda permission for minors-delete
resource "aws_lambda_permission" "minors_delete_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.minors_delete.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}

# Outputs
output "minors_table_name" {
  description = "Name of the minors DynamoDB table"
  value       = aws_dynamodb_table.minors.name
}

output "minors_add_function_name" {
  description = "Name of the minors-add Lambda function"
  value       = aws_lambda_function.minors_add.function_name
}

output "minors_list_function_name" {
  description = "Name of the minors-list Lambda function"
  value       = aws_lambda_function.minors_list.function_name
}

output "minors_update_function_name" {
  description = "Name of the minors-update Lambda function"
  value       = aws_lambda_function.minors_update.function_name
}

output "minors_delete_function_name" {
  description = "Name of the minors-delete Lambda function"
  value       = aws_lambda_function.minors_delete.function_name
}
