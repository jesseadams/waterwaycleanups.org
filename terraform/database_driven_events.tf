# Database-Driven Events System - Terraform Configuration

# Get current AWS region
data "aws_region" "current" {}

# Load table schemas from JSON files
locals {
  events_schema     = jsondecode(file("${path.module}/../schemas/events-table.json"))
  volunteers_schema = jsondecode(file("${path.module}/../schemas/volunteers-table.json"))
  rsvps_schema      = jsondecode(file("${path.module}/../schemas/rsvps-table.json"))
}

# ===== EVENTS TABLE =====

# Create DynamoDB table for storing events
resource "aws_dynamodb_table" "events" {
  name         = "${local.events_schema.table_name}${local.resource_suffix}"
  billing_mode = local.events_schema.billing_mode
  hash_key     = local.events_schema.hash_key

  # Create attributes dynamically from schema
  dynamic "attribute" {
    for_each = local.events_schema.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  # Global Secondary Index for querying events by status and start time
  global_secondary_index {
    name            = "status-start_time-index"
    hash_key        = "status"
    range_key       = "start_time"
    projection_type = "ALL"
  }

  # Global Secondary Index for querying all events by start time
  global_secondary_index {
    name            = "start_time-index"
    hash_key        = "start_time"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "events${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
    Schema      = "events-table.json"
  }
}

# ===== VOLUNTEERS TABLE =====

# Create DynamoDB table for storing volunteer profiles
resource "aws_dynamodb_table" "volunteers" {
  name         = "${local.volunteers_schema.table_name}${local.resource_suffix}"
  billing_mode = local.volunteers_schema.billing_mode
  hash_key     = local.volunteers_schema.hash_key

  # Create attributes dynamically from schema
  dynamic "attribute" {
    for_each = local.volunteers_schema.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "volunteers${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
    Schema      = "volunteers-table.json"
  }
}

# ===== RSVPS TABLE (NORMALIZED) =====

# Create DynamoDB table for storing normalized RSVP data
resource "aws_dynamodb_table" "rsvps" {
  name         = "${local.rsvps_schema.table_name}${local.resource_suffix}"
  billing_mode = local.rsvps_schema.billing_mode
  hash_key     = local.rsvps_schema.hash_key
  range_key    = local.rsvps_schema.range_key

  # Create attributes dynamically from schema
  dynamic "attribute" {
    for_each = local.rsvps_schema.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  # Global Secondary Index for querying RSVPs by volunteer email
  global_secondary_index {
    name            = "email-created_at-index"
    hash_key        = "email"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  # Global Secondary Index for querying RSVPs by status
  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "rsvps${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
    Schema      = "rsvps-table.json"
  }
}

# ===== IAM ROLES AND POLICIES =====

# IAM Role for Lambda functions to access the new DynamoDB tables
resource "aws_iam_role" "events_lambda_role" {
  name = "events_lambda_role${local.resource_suffix}"

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

  tags = {
    Name        = "events-lambda-role${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# IAM Policy for Lambda to access all three DynamoDB tables
resource "aws_iam_policy" "events_lambda_policy" {
  name        = "events_lambda_policy${local.resource_suffix}"
  description = "IAM policy for events system lambda functions to access DynamoDB tables"

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
          # Events table and indexes
          aws_dynamodb_table.events.arn,
          "${aws_dynamodb_table.events.arn}/index/*",
          # Volunteers table
          aws_dynamodb_table.volunteers.arn,
          # RSVPs table and indexes
          aws_dynamodb_table.rsvps.arn,
          "${aws_dynamodb_table.rsvps.arn}/index/*",
          # Minors table
          aws_dynamodb_table.minors.arn,
          # Volunteer waivers table
          aws_dynamodb_table.volunteer_waivers.arn,
          # Auth tables for authorization
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
      },
      {
        Action = [
          "sns:Publish"
        ],
        Resource = [
          aws_sns_topic.events_topic.arn
        ],
        Effect = "Allow"
      },
      {
        Action = [
          "lambda:InvokeFunction"
        ],
        Resource = [
          "arn:aws:lambda:*:*:function:events_lifecycle${local.resource_suffix}"
        ],
        Effect = "Allow"
      }
    ]
  })

  tags = {
    Name        = "events-lambda-policy${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "events_lambda_attachment" {
  role       = aws_iam_role.events_lambda_role.name
  policy_arn = aws_iam_policy.events_lambda_policy.arn
}

# ===== SNS TOPIC FOR NOTIFICATIONS =====

# Create SNS topic for events system notifications
resource "aws_sns_topic" "events_topic" {
  name = "events-notifications${local.resource_suffix}"

  tags = {
    Name        = "events-notifications${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== OUTPUTS =====

# Output table names for use by Lambda functions
output "events_table_name" {
  description = "Name of the Events DynamoDB table"
  value       = aws_dynamodb_table.events.name
}

output "volunteers_table_name" {
  description = "Name of the Volunteers DynamoDB table"
  value       = aws_dynamodb_table.volunteers.name
}

output "rsvps_table_name" {
  description = "Name of the RSVPs DynamoDB table"
  value       = aws_dynamodb_table.rsvps.name
}

output "events_lambda_role_arn" {
  description = "ARN of the IAM role for events Lambda functions"
  value       = aws_iam_role.events_lambda_role.arn
}

output "events_sns_topic_arn" {
  description = "ARN of the SNS topic for events notifications"
  value       = aws_sns_topic.events_topic.arn
}

output "events_api_url" {
  description = "URL of the Events API Gateway"
  value       = aws_api_gateway_stage.events_api_stage.invoke_url
}

output "events_api_id" {
  description = "ID of the Events API Gateway"
  value       = aws_api_gateway_rest_api.events_api.id
}

output "events_api_key" {
  description = "API key for Events API access"
  value       = aws_api_gateway_api_key.events_api_key.value
  sensitive   = true
}

output "events_authorizer_arn" {
  description = "ARN of the Events API Lambda authorizer"
  value       = aws_lambda_function.events_authorizer.arn
}

# ===== LAMBDA LAYER FOR SHARED UTILITIES =====

# Create ZIP file for Lambda layer
data "archive_file" "events_api_layer_zip" {
  type        = "zip"
  output_path = "${path.module}/events_api_layer.zip"
  
  source {
    content  = file("${path.module}/events_api_utils.py")
    filename = "python/events_api_utils.py"
  }
  
  source {
    content  = file("${path.module}/data_validation_utils.py")
    filename = "python/data_validation_utils.py"
  }
  
  source {
    content  = file("${path.module}/cascading_updates_utils.py")
    filename = "python/cascading_updates_utils.py"
  }
}

# Lambda layer for shared utilities
resource "aws_lambda_layer_version" "events_api_layer" {
  filename         = data.archive_file.events_api_layer_zip.output_path
  layer_name       = "events-api-utils${local.resource_suffix}"
  source_code_hash = data.archive_file.events_api_layer_zip.output_base64sha256

  compatible_runtimes = ["python3.9"]
  description         = "Shared utilities for Events API Lambda functions"
}

# ===== LAMBDA AUTHORIZER =====

# Create ZIP file for authorizer Lambda function
data "archive_file" "events_authorizer_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_authorizer.py"
  output_path = "${path.module}/lambda_events_authorizer.zip"
}

# Lambda function for API Gateway authorization
resource "aws_lambda_function" "events_authorizer" {
  filename         = data.archive_file.events_authorizer_zip.output_path
  function_name    = "events_authorizer${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_authorizer.handler"
  source_code_hash = data.archive_file.events_authorizer_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      SESSIONS_TABLE_NAME = aws_dynamodb_table.auth_sessions.name
    }
  }

  tags = {
    Name        = "events-authorizer${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda permission for API Gateway to invoke authorizer
resource "aws_lambda_permission" "events_authorizer_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*"
}

# API Gateway authorizer
resource "aws_api_gateway_authorizer" "events_authorizer" {
  name                   = "events-authorizer${local.resource_suffix}"
  rest_api_id            = aws_api_gateway_rest_api.events_api.id
  authorizer_uri         = aws_lambda_function.events_authorizer.invoke_arn
  type                   = "TOKEN"
  identity_source        = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = 0  # Disable caching for testing
}

# ===== LAMBDA FUNCTIONS FOR EVENT MANAGEMENT =====

# Create ZIP files for Lambda functions
data "archive_file" "events_create_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_create.py"
  output_path = "${path.module}/lambda_events_create.zip"
}

data "archive_file" "events_get_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_get.py"
  output_path = "${path.module}/lambda_events_get.zip"
}

data "archive_file" "events_update_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_update.py"
  output_path = "${path.module}/lambda_events_update.zip"
}

data "archive_file" "events_delete_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_delete.py"
  output_path = "${path.module}/lambda_events_delete.zip"
}

data "archive_file" "events_list_rsvps_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_list_rsvps.py"
  output_path = "${path.module}/lambda_events_list_rsvps.zip"
}

# ===== VOLUNTEER MANAGEMENT LAMBDA FUNCTIONS =====

# Create ZIP files for volunteer Lambda functions
data "archive_file" "volunteers_get_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_volunteers_get.py"
  output_path = "${path.module}/lambda_volunteers_get.zip"
}

data "archive_file" "volunteers_update_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_volunteers_update.py"
  output_path = "${path.module}/lambda_volunteers_update.zip"
}

data "archive_file" "volunteers_rsvps_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_volunteers_rsvps.py"
  output_path = "${path.module}/lambda_volunteers_rsvps.zip"
}

data "archive_file" "volunteers_export_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_volunteers_export.py"
  output_path = "${path.module}/lambda_volunteers_export.zip"
}

data "archive_file" "admin_volunteers_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_admin_volunteers.py"
  output_path = "${path.module}/lambda_admin_volunteers.zip"
}

# ===== EVENT LIFECYCLE MANAGEMENT LAMBDA FUNCTION =====

data "archive_file" "events_lifecycle_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_lifecycle.py"
  output_path = "${path.module}/lambda_events_lifecycle.zip"
}

# ===== EVENT LIFECYCLE SCHEDULER LAMBDA FUNCTION =====

data "archive_file" "events_lifecycle_scheduler_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_lifecycle_scheduler.py"
  output_path = "${path.module}/lambda_events_lifecycle_scheduler.zip"
}

# Lambda function for creating events
resource "aws_lambda_function" "events_create" {
  filename         = data.archive_file.events_create_zip.output_path
  function_name    = "events_create${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_create.handler"
  source_code_hash = data.archive_file.events_create_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30
  layers           = [aws_lambda_layer_version.events_api_layer.arn]

  environment {
    variables = {
      EVENTS_TABLE_NAME = aws_dynamodb_table.events.name
    }
  }

  tags = {
    Name        = "events-create${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for getting events
resource "aws_lambda_function" "events_get" {
  filename         = data.archive_file.events_get_zip.output_path
  function_name    = "events_get${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_get.handler"
  source_code_hash = data.archive_file.events_get_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      EVENTS_TABLE_NAME = aws_dynamodb_table.events.name
    }
  }

  tags = {
    Name        = "events-get${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for updating events
resource "aws_lambda_function" "events_update" {
  filename         = data.archive_file.events_update_zip.output_path
  function_name    = "events_update${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_update.handler"
  source_code_hash = data.archive_file.events_update_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30
  layers           = [aws_lambda_layer_version.events_api_layer.arn]

  environment {
    variables = {
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.rsvps.name
    }
  }

  tags = {
    Name        = "events-update${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for deleting events
resource "aws_lambda_function" "events_delete" {
  filename         = data.archive_file.events_delete_zip.output_path
  function_name    = "events_delete${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_delete.handler"
  source_code_hash = data.archive_file.events_delete_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30
  layers           = [aws_lambda_layer_version.events_api_layer.arn]

  environment {
    variables = {
      EVENTS_TABLE_NAME = aws_dynamodb_table.events.name
      RSVPS_TABLE_NAME  = aws_dynamodb_table.rsvps.name
    }
  }

  tags = {
    Name        = "events-delete${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for listing event RSVPs
resource "aws_lambda_function" "events_list_rsvps" {
  filename         = data.archive_file.events_list_rsvps_zip.output_path
  function_name    = "events_list_rsvps${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_list_rsvps.handler"
  source_code_hash = data.archive_file.events_list_rsvps_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.rsvps.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
    }
  }

  tags = {
    Name        = "events-list-rsvps${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== VOLUNTEER MANAGEMENT LAMBDA FUNCTIONS =====

# Lambda function for getting volunteers
resource "aws_lambda_function" "volunteers_get" {
  filename         = data.archive_file.volunteers_get_zip.output_path
  function_name    = "volunteers_get${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_volunteers_get.handler"
  source_code_hash = data.archive_file.volunteers_get_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.rsvps.name
    }
  }

  tags = {
    Name        = "volunteers-get${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for updating volunteers
resource "aws_lambda_function" "volunteers_update" {
  filename         = data.archive_file.volunteers_update_zip.output_path
  function_name    = "volunteers_update${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_volunteers_update.handler"
  source_code_hash = data.archive_file.volunteers_update_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
    }
  }

  tags = {
    Name        = "volunteers-update${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for getting volunteer RSVPs
resource "aws_lambda_function" "volunteers_rsvps" {
  filename         = data.archive_file.volunteers_rsvps_zip.output_path
  function_name    = "volunteers_rsvps${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_volunteers_rsvps.handler"
  source_code_hash = data.archive_file.volunteers_rsvps_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.rsvps.name
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
    }
  }

  tags = {
    Name        = "volunteers-rsvps${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for exporting volunteers
resource "aws_lambda_function" "volunteers_export" {
  filename         = data.archive_file.volunteers_export_zip.output_path
  function_name    = "volunteers_export${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_volunteers_export.handler"
  source_code_hash = data.archive_file.volunteers_export_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60  # Longer timeout for export operations

  environment {
    variables = {
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.rsvps.name
    }
  }

  tags = {
    Name        = "volunteers-export${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for admin volunteers list
resource "aws_lambda_function" "admin_volunteers" {
  filename         = data.archive_file.admin_volunteers_zip.output_path
  function_name    = "admin_volunteers${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_admin_volunteers.handler"
  source_code_hash = data.archive_file.admin_volunteers_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      MINORS_TABLE_NAME     = aws_dynamodb_table.minors.name
      SESSION_TABLE_NAME    = aws_dynamodb_table.auth_sessions.name
      WAIVERS_TABLE_NAME    = aws_dynamodb_table.volunteer_waivers.name
    }
  }

  tags = {
    Name        = "admin-volunteers${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for event lifecycle management
resource "aws_lambda_function" "events_lifecycle" {
  filename         = data.archive_file.events_lifecycle_zip.output_path
  function_name    = "events_lifecycle${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_lifecycle.handler"
  source_code_hash = data.archive_file.events_lifecycle_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60  # Longer timeout for lifecycle operations

  environment {
    variables = {
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.rsvps.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      SNS_TOPIC_ARN         = aws_sns_topic.events_topic.arn
    }
  }

  tags = {
    Name        = "events-lifecycle${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for scheduled event lifecycle management
resource "aws_lambda_function" "events_lifecycle_scheduler" {
  filename         = data.archive_file.events_lifecycle_scheduler_zip.output_path
  function_name    = "events_lifecycle_scheduler${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_lifecycle_scheduler.handler"
  source_code_hash = data.archive_file.events_lifecycle_scheduler_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 30

  environment {
    variables = {
      LIFECYCLE_FUNCTION_NAME = aws_lambda_function.events_lifecycle.function_name
    }
  }

  tags = {
    Name        = "events-lifecycle-scheduler${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== CLOUDWATCH EVENTS FOR SCHEDULED LIFECYCLE MANAGEMENT =====

# CloudWatch Events rule to trigger lifecycle management every hour
resource "aws_cloudwatch_event_rule" "events_lifecycle_schedule" {
  name                = "events-lifecycle-schedule${local.resource_suffix}"
  description         = "Trigger event lifecycle management every hour"
  schedule_expression = "rate(1 hour)"

  tags = {
    Name        = "events-lifecycle-schedule${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# CloudWatch Events target to invoke the scheduler Lambda
resource "aws_cloudwatch_event_target" "events_lifecycle_target" {
  rule      = aws_cloudwatch_event_rule.events_lifecycle_schedule.name
  target_id = "EventsLifecycleSchedulerTarget"
  arn       = aws_lambda_function.events_lifecycle_scheduler.arn
}

# Lambda permission for CloudWatch Events to invoke the scheduler
resource "aws_lambda_permission" "events_lifecycle_scheduler_cloudwatch" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_lifecycle_scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.events_lifecycle_schedule.arn
}

# ===== API GATEWAY INTEGRATION =====

# Create API Gateway for events management
resource "aws_api_gateway_rest_api" "events_api" {
  name        = "events-api${local.resource_suffix}"
  description = "API for managing events in the database-driven events system"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name        = "events-api${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Create /events resource
resource "aws_api_gateway_resource" "events" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_rest_api.events_api.root_resource_id
  path_part   = "events"
}

# Create /events/{event_id} resource
resource "aws_api_gateway_resource" "events_by_id" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.events.id
  path_part   = "{event_id}"
}

# Create /events/{event_id}/rsvps resource
resource "aws_api_gateway_resource" "events_rsvps" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.events_by_id.id
  path_part   = "rsvps"
}

# ===== VOLUNTEER API RESOURCES =====

# Create /volunteers resource
resource "aws_api_gateway_resource" "volunteers" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_rest_api.events_api.root_resource_id
  path_part   = "volunteers"
}

# Create /volunteers/{email} resource
resource "aws_api_gateway_resource" "volunteers_by_email" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.volunteers.id
  path_part   = "{email}"
}

# Create /volunteers/{email}/rsvps resource
resource "aws_api_gateway_resource" "volunteers_rsvps" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.volunteers_by_email.id
  path_part   = "rsvps"
}

# Create /volunteers/export resource
resource "aws_api_gateway_resource" "volunteers_export" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.volunteers.id
  path_part   = "export"
}

# ===== EVENT LIFECYCLE API RESOURCES =====

# Create /events/lifecycle resource
resource "aws_api_gateway_resource" "events_lifecycle" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.events.id
  path_part   = "lifecycle"
}

# GET /events - List events (public endpoint)
resource "aws_api_gateway_method" "events_get" {
  rest_api_id      = aws_api_gateway_rest_api.events_api.id
  resource_id      = aws_api_gateway_resource.events.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "events_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.events.id
  http_method             = aws_api_gateway_method.events_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.events_get.invoke_arn
}

# POST /events - Create event
resource "aws_api_gateway_method" "events_post" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.events.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.events_authorizer.id
  
  depends_on = [
    aws_api_gateway_authorizer.events_authorizer
  ]
}

resource "aws_api_gateway_integration" "events_post" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.events.id
  http_method             = aws_api_gateway_method.events_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.events_create.invoke_arn
}

# Method response for events POST
resource "aws_api_gateway_method_response" "events_post_response" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events.id
  http_method = aws_api_gateway_method.events_post.http_method
  status_code = "201"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for events POST
resource "aws_api_gateway_integration_response" "events_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events.id
  http_method = aws_api_gateway_method.events_post.http_method
  status_code = aws_api_gateway_method_response.events_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }
}

# GET /events/{event_id} - Get specific event
resource "aws_api_gateway_method" "events_by_id_get" {
  rest_api_id      = aws_api_gateway_rest_api.events_api.id
  resource_id      = aws_api_gateway_resource.events_by_id.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "events_by_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.events_by_id.id
  http_method             = aws_api_gateway_method.events_by_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.events_get.invoke_arn
}

# PUT /events/{event_id} - Update event
resource "aws_api_gateway_method" "events_by_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.events_by_id.id
  http_method   = "PUT"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.events_authorizer.id
}

resource "aws_api_gateway_integration" "events_by_id_put" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.events_by_id.id
  http_method             = aws_api_gateway_method.events_by_id_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.events_update.invoke_arn
}

# Method response for events PUT
resource "aws_api_gateway_method_response" "events_by_id_put_response" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events_by_id.id
  http_method = aws_api_gateway_method.events_by_id_put.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for events PUT
resource "aws_api_gateway_integration_response" "events_by_id_put_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events_by_id.id
  http_method = aws_api_gateway_method.events_by_id_put.http_method
  status_code = aws_api_gateway_method_response.events_by_id_put_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.events_by_id_put]
}

# DELETE /events/{event_id} - Delete event
resource "aws_api_gateway_method" "events_by_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.events_by_id.id
  http_method   = "DELETE"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.events_authorizer.id
}

resource "aws_api_gateway_integration" "events_by_id_delete" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.events_by_id.id
  http_method             = aws_api_gateway_method.events_by_id_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.events_delete.invoke_arn
}

# Method response for events DELETE
resource "aws_api_gateway_method_response" "events_by_id_delete_response" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events_by_id.id
  http_method = aws_api_gateway_method.events_by_id_delete.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for events DELETE
resource "aws_api_gateway_integration_response" "events_by_id_delete_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events_by_id.id
  http_method = aws_api_gateway_method.events_by_id_delete.http_method
  status_code = aws_api_gateway_method_response.events_by_id_delete_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }

  depends_on = [aws_api_gateway_integration.events_by_id_delete]
}

# GET /events/{event_id}/rsvps - Get event RSVPs
resource "aws_api_gateway_method" "events_rsvps_get" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.events_rsvps.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.events_authorizer.id
}

resource "aws_api_gateway_integration" "events_rsvps_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.events_rsvps.id
  http_method             = aws_api_gateway_method.events_rsvps_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.events_list_rsvps.invoke_arn
}

# ===== VOLUNTEER API METHODS AND INTEGRATIONS =====

# GET /volunteers - List volunteers
resource "aws_api_gateway_method" "volunteers_get" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.volunteers.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.events_authorizer.id
}

resource "aws_api_gateway_integration" "volunteers_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.volunteers.id
  http_method             = aws_api_gateway_method.volunteers_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteers_get.invoke_arn
}

# GET /volunteers/{email} - Get specific volunteer
resource "aws_api_gateway_method" "volunteers_by_email_get" {
  rest_api_id      = aws_api_gateway_rest_api.events_api.id
  resource_id      = aws_api_gateway_resource.volunteers_by_email.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "volunteers_by_email_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.volunteers_by_email.id
  http_method             = aws_api_gateway_method.volunteers_by_email_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteers_get.invoke_arn
}

# PUT /volunteers/{email} - Update volunteer profile
resource "aws_api_gateway_method" "volunteers_by_email_put" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.volunteers_by_email.id
  http_method   = "PUT"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.events_authorizer.id
}

resource "aws_api_gateway_integration" "volunteers_by_email_put" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.volunteers_by_email.id
  http_method             = aws_api_gateway_method.volunteers_by_email_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteers_update.invoke_arn
}

# GET /volunteers/{email}/rsvps - Get volunteer's RSVP history
resource "aws_api_gateway_method" "volunteers_rsvps_get" {
  rest_api_id      = aws_api_gateway_rest_api.events_api.id
  resource_id      = aws_api_gateway_resource.volunteers_rsvps.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "volunteers_rsvps_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.volunteers_rsvps.id
  http_method             = aws_api_gateway_method.volunteers_rsvps_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteers_rsvps.invoke_arn
}

# GET /volunteers/export - Export volunteer data
resource "aws_api_gateway_method" "volunteers_export_get" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.volunteers_export.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.events_authorizer.id
}

resource "aws_api_gateway_integration" "volunteers_export_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.volunteers_export.id
  http_method             = aws_api_gateway_method.volunteers_export_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteers_export.invoke_arn
}

# ===== EVENT LIFECYCLE API METHODS AND INTEGRATIONS =====

# POST /events/lifecycle - Event lifecycle management
resource "aws_api_gateway_method" "events_lifecycle_post" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.events_lifecycle.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.events_authorizer.id
}

resource "aws_api_gateway_integration" "events_lifecycle_post" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.events_lifecycle.id
  http_method             = aws_api_gateway_method.events_lifecycle_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.events_lifecycle.invoke_arn
}

# Add CORS support for all methods
resource "aws_api_gateway_method" "events_options" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.events.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "events_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events.id
  http_method = aws_api_gateway_method.events_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "events_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events.id
  http_method = aws_api_gateway_method.events_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "events_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events.id
  http_method = aws_api_gateway_method.events_options.http_method
  status_code = aws_api_gateway_method_response.events_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Deploy the API
resource "aws_api_gateway_deployment" "events_api" {
  depends_on = [
    # Existing integrations
    aws_api_gateway_integration.events_get,
    aws_api_gateway_integration.events_post,
    aws_api_gateway_integration.events_by_id_get,
    aws_api_gateway_integration.events_by_id_put,
    aws_api_gateway_integration.events_by_id_delete,
    aws_api_gateway_integration.events_rsvps_get,
    aws_api_gateway_integration.events_options,
    # Method and integration responses for events POST
    aws_api_gateway_method_response.events_post_response,
    aws_api_gateway_integration_response.events_post_integration_response,
    # Volunteer endpoints
    aws_api_gateway_integration.volunteers_get,
    aws_api_gateway_integration.volunteers_by_email_get,
    aws_api_gateway_integration.volunteers_by_email_put,
    aws_api_gateway_integration.volunteers_rsvps_get,
    aws_api_gateway_integration.volunteers_export_get,
    # Event lifecycle endpoints
    aws_api_gateway_integration.events_lifecycle_post,
    # New export and analytics endpoints
    aws_api_gateway_integration.events_export_get,
    aws_api_gateway_integration.analytics_get,
    aws_api_gateway_integration.volunteers_metrics_get,
    aws_api_gateway_integration.volunteers_metrics_by_email_get,
    # CORS endpoints for new resources
    aws_api_gateway_integration.events_export_options,
    aws_api_gateway_integration.analytics_options,
    aws_api_gateway_integration.volunteers_metrics_options
  ]

  rest_api_id = aws_api_gateway_rest_api.events_api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_method.events_post.id,
      aws_api_gateway_method_response.events_post_response.id,
      aws_api_gateway_integration_response.events_post_integration_response.id,
      aws_api_gateway_method.analytics_get.id,
      aws_api_gateway_method.events_export_get.id,
      aws_api_gateway_method.volunteers_metrics_get.id,
      aws_api_gateway_method.volunteers_metrics_by_email_get.id,
      aws_api_gateway_authorizer.events_authorizer.id,
      "force-redeploy-12-fix-authorizer-credentials"
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# API Gateway stage
resource "aws_api_gateway_stage" "events_api_stage" {
  deployment_id = aws_api_gateway_deployment.events_api.id
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  stage_name    = local.is_production ? "prod" : "staging"
  
  depends_on = [aws_api_gateway_deployment.events_api]
}

# ===== API THROTTLING AND RATE LIMITING =====

# Usage plan for API throttling
resource "aws_api_gateway_usage_plan" "events_api_usage_plan" {
  name         = "events-api-usage-plan${local.resource_suffix}"
  description  = "Usage plan for Events API with rate limiting"

  api_stages {
    api_id = aws_api_gateway_rest_api.events_api.id
    stage  = aws_api_gateway_stage.events_api_stage.stage_name
  }

  quota_settings {
    limit  = 10000  # 10,000 requests per day
    period = "DAY"
  }

  throttle_settings {
    rate_limit  = 100  # 100 requests per second
    burst_limit = 200  # 200 burst requests
  }

  tags = {
    Name        = "events-api-usage-plan${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# API Key for authenticated access
resource "aws_api_gateway_api_key" "events_api_key" {
  name        = "events-api-key${local.resource_suffix}"
  description = "API key for Events API access"
  enabled     = true

  tags = {
    Name        = "events-api-key${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Associate API key with usage plan
resource "aws_api_gateway_usage_plan_key" "events_api_usage_plan_key" {
  key_id        = aws_api_gateway_api_key.events_api_key.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.events_api_usage_plan.id
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "events_create_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_create.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "events_get_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_get.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "events_update_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_update.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "events_delete_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_delete.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "events_list_rsvps_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_list_rsvps.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

# ===== VOLUNTEER LAMBDA PERMISSIONS =====

resource "aws_lambda_permission" "volunteers_get_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.volunteers_get.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "volunteers_update_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.volunteers_update.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "volunteers_rsvps_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.volunteers_rsvps.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "volunteers_export_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.volunteers_export.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

# ===== EVENT LIFECYCLE LAMBDA PERMISSIONS =====

resource "aws_lambda_permission" "events_lifecycle_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_lifecycle.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

# ===== SSM PARAMETERS FOR FRONTEND =====

# Store table names in SSM for frontend and Lambda functions to use
resource "aws_ssm_parameter" "events_table_name" {
  name        = "/waterwaycleanups${local.resource_suffix}/events_table_name"
  description = "Name of the Events DynamoDB table"
  type        = "String"
  value       = aws_dynamodb_table.events.name

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_ssm_parameter" "volunteers_table_name" {
  name        = "/waterwaycleanups${local.resource_suffix}/volunteers_table_name"
  description = "Name of the Volunteers DynamoDB table"
  type        = "String"
  value       = aws_dynamodb_table.volunteers.name

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_ssm_parameter" "rsvps_table_name" {
  name        = "/waterwaycleanups${local.resource_suffix}/rsvps_table_name"
  description = "Name of the RSVPs DynamoDB table"
  type        = "String"
  value       = aws_dynamodb_table.rsvps.name

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Store API Gateway URL in SSM
resource "aws_ssm_parameter" "events_api_url" {
  name        = "/waterwaycleanups${local.resource_suffix}/events_api_url"
  description = "URL of the Events API Gateway"
  type        = "String"
  value       = "https://${aws_api_gateway_rest_api.events_api.id}.execute-api.${data.aws_region.current.name}.amazonaws.com/${local.is_production ? "prod" : "staging"}"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Store API key in SSM (SecureString for security)
resource "aws_ssm_parameter" "events_api_key" {
  name        = "/waterwaycleanups${local.resource_suffix}/events_api_key"
  description = "API key for Events API access"
  type        = "SecureString"
  value       = aws_api_gateway_api_key.events_api_key.value

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== EXPORT AND ANALYTICS LAMBDA FUNCTIONS =====

# Create ZIP files for export and analytics Lambda functions
data "archive_file" "events_export_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_events_export.py"
  output_path = "${path.module}/lambda_events_export.zip"
}

data "archive_file" "analytics_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_analytics.py"
  output_path = "${path.module}/lambda_analytics.zip"
}

data "archive_file" "volunteer_metrics_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_volunteer_metrics.py"
  output_path = "${path.module}/lambda_volunteer_metrics.zip"
}

# Lambda function for exporting events
resource "aws_lambda_function" "events_export" {
  filename         = data.archive_file.events_export_zip.output_path
  function_name    = "events_export${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_events_export.handler"
  source_code_hash = data.archive_file.events_export_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60  # Longer timeout for export operations

  environment {
    variables = {
      EVENTS_TABLE_NAME = aws_dynamodb_table.events.name
      RSVPS_TABLE_NAME  = aws_dynamodb_table.rsvps.name
    }
  }

  tags = {
    Name        = "events-export${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for analytics
resource "aws_lambda_function" "analytics" {
  filename         = data.archive_file.analytics_zip.output_path
  function_name    = "analytics${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_analytics.handler"
  source_code_hash = data.archive_file.analytics_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60  # Longer timeout for analytics calculations

  environment {
    variables = {
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.rsvps.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
    }
  }

  tags = {
    Name        = "analytics${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# Lambda function for volunteer metrics
resource "aws_lambda_function" "volunteer_metrics" {
  filename         = data.archive_file.volunteer_metrics_zip.output_path
  function_name    = "volunteer_metrics${local.resource_suffix}"
  role             = aws_iam_role.events_lambda_role.arn
  handler          = "lambda_volunteer_metrics.handler"
  source_code_hash = data.archive_file.volunteer_metrics_zip.output_base64sha256
  runtime          = "python3.9"
  timeout          = 60  # Longer timeout for metrics calculations

  environment {
    variables = {
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.rsvps.name
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
    }
  }

  tags = {
    Name        = "volunteer-metrics${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

# ===== API GATEWAY RESOURCES FOR EXPORT AND ANALYTICS =====

# Create /events/export resource
resource "aws_api_gateway_resource" "events_export" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.events.id
  path_part   = "export"
}

# Create /analytics resource
resource "aws_api_gateway_resource" "analytics" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_rest_api.events_api.root_resource_id
  path_part   = "analytics"
}

# Create /volunteers/metrics resource
resource "aws_api_gateway_resource" "volunteers_metrics" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.volunteers.id
  path_part   = "metrics"
}

# Create /volunteers/metrics/{email} resource
resource "aws_api_gateway_resource" "volunteers_metrics_by_email" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  parent_id   = aws_api_gateway_resource.volunteers_metrics.id
  path_part   = "{email}"
}

# ===== API GATEWAY METHODS FOR EXPORT AND ANALYTICS =====

# GET /events/export - Export event data
resource "aws_api_gateway_method" "events_export_get" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.events_export.id
  http_method   = "GET"
  authorization = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "events_export_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.events_export.id
  http_method             = aws_api_gateway_method.events_export_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.events_export.invoke_arn
}

# GET /analytics - Get analytics data
resource "aws_api_gateway_method" "analytics_get" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.analytics.id
  http_method   = "GET"
  authorization = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "analytics_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.analytics.id
  http_method             = aws_api_gateway_method.analytics_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.analytics.invoke_arn
}

# GET /volunteers/metrics - Get volunteer metrics leaderboard
resource "aws_api_gateway_method" "volunteers_metrics_get" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.volunteers_metrics.id
  http_method   = "GET"
  authorization = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "volunteers_metrics_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.volunteers_metrics.id
  http_method             = aws_api_gateway_method.volunteers_metrics_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteer_metrics.invoke_arn
}

# GET /volunteers/metrics/{email} - Get detailed volunteer metrics
resource "aws_api_gateway_method" "volunteers_metrics_by_email_get" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.volunteers_metrics_by_email.id
  http_method   = "GET"
  authorization = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "volunteers_metrics_by_email_get" {
  rest_api_id             = aws_api_gateway_rest_api.events_api.id
  resource_id             = aws_api_gateway_resource.volunteers_metrics_by_email.id
  http_method             = aws_api_gateway_method.volunteers_metrics_by_email_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteer_metrics.invoke_arn
}

# ===== LAMBDA PERMISSIONS FOR EXPORT AND ANALYTICS =====

resource "aws_lambda_permission" "events_export_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.events_export.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "analytics_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.analytics.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "volunteer_metrics_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.volunteer_metrics.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.events_api.execution_arn}/*/*"
}

# ===== CORS SUPPORT FOR NEW ENDPOINTS =====

# OPTIONS /events/export
resource "aws_api_gateway_method" "events_export_options" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.events_export.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "events_export_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events_export.id
  http_method = aws_api_gateway_method.events_export_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "events_export_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events_export.id
  http_method = aws_api_gateway_method.events_export_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "events_export_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.events_export.id
  http_method = aws_api_gateway_method.events_export_options.http_method
  status_code = aws_api_gateway_method_response.events_export_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# OPTIONS /analytics
resource "aws_api_gateway_method" "analytics_options" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.analytics.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "analytics_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.analytics.id
  http_method = aws_api_gateway_method.analytics_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "analytics_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.analytics.id
  http_method = aws_api_gateway_method.analytics_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "analytics_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.analytics.id
  http_method = aws_api_gateway_method.analytics_options.http_method
  status_code = aws_api_gateway_method_response.analytics_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# OPTIONS /volunteers/metrics
resource "aws_api_gateway_method" "volunteers_metrics_options" {
  rest_api_id   = aws_api_gateway_rest_api.events_api.id
  resource_id   = aws_api_gateway_resource.volunteers_metrics.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "volunteers_metrics_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.volunteers_metrics.id
  http_method = aws_api_gateway_method.volunteers_metrics_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "volunteers_metrics_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.volunteers_metrics.id
  http_method = aws_api_gateway_method.volunteers_metrics_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "volunteers_metrics_options" {
  rest_api_id = aws_api_gateway_rest_api.events_api.id
  resource_id = aws_api_gateway_resource.volunteers_metrics.id
  http_method = aws_api_gateway_method.volunteers_metrics_options.http_method
  status_code = aws_api_gateway_method_response.volunteers_metrics_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ===== ADDITIONAL OUTPUTS FOR NEW FUNCTIONS =====

output "events_export_function_name" {
  description = "Name of the Events Export Lambda function"
  value       = aws_lambda_function.events_export.function_name
}

output "analytics_function_name" {
  description = "Name of the Analytics Lambda function"
  value       = aws_lambda_function.analytics.function_name
}

output "volunteer_metrics_function_name" {
  description = "Name of the Volunteer Metrics Lambda function"
  value       = aws_lambda_function.volunteer_metrics.function_name
}