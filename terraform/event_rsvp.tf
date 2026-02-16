# Event RSVP System - Terraform Configuration

# Load event RSVPs table schema from JSON
locals {
  event_rsvps_schema = jsondecode(file("${path.module}/../schemas/event-rsvps-table.json"))
}

# Create DynamoDB table for storing event RSVPs
resource "aws_dynamodb_table" "event_rsvps" {
  name         = "${local.event_rsvps_schema.table_name}${local.dynamodb_suffix}"
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

  # Create Global Secondary Indexes dynamically from schema
  dynamic "global_secondary_index" {
    for_each = lookup(local.event_rsvps_schema, "global_secondary_indexes", [])
    content {
      name            = global_secondary_index.value.index_name
      hash_key        = global_secondary_index.value.hash_key
      range_key       = lookup(global_secondary_index.value, "range_key", null)
      projection_type = global_secondary_index.value.projection_type
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "event-rsvps${local.resource_suffix}"
    Environment = var.environment
    Project     = "waterwaycleanups"
    Schema      = "event-rsvps-table.json"
  }
}

# IAM Role for Lambda functions to access DynamoDB
resource "aws_iam_role" "event_rsvp_lambda_role" {
  name = "event_rsvp_lambda_role${local.resource_suffix}"

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
  name        = "event_rsvp_lambda_policy${local.resource_suffix}"
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
          # Legacy event_rsvps table (for backward compatibility)
          aws_dynamodb_table.event_rsvps.arn,
          "${aws_dynamodb_table.event_rsvps.arn}/index/*",
          # New normalized tables
          aws_dynamodb_table.events.arn,
          "${aws_dynamodb_table.events.arn}/index/*",
          aws_dynamodb_table.volunteers.arn,
          "${aws_dynamodb_table.volunteers.arn}/index/*",
          # Auth sessions table for session validation
          aws_dynamodb_table.auth_sessions.arn,
          "${aws_dynamodb_table.auth_sessions.arn}/index/*",
          # Minors table for ownership verification
          aws_dynamodb_table.minors.arn,
          "${aws_dynamodb_table.minors.arn}/index/*"
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
  name = "event-rsvp-notifications${local.resource_suffix}"

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

data "archive_file" "event_rsvp_cancel_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_event_rsvp_cancel.py"
  output_path = "${path.module}/lambda_event_rsvp_cancel.zip"
}

data "archive_file" "event_rsvp_noshow_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_event_rsvp_noshow.py"
  output_path = "${path.module}/lambda_event_rsvp_noshow.zip"
}

# Create Lambda function for checking event RSVPs
resource "aws_lambda_function" "event_rsvp_check" {
  function_name    = "event_rsvp_check${local.resource_suffix}"
  filename         = data.archive_file.event_rsvp_check_zip.output_path
  source_code_hash = data.archive_file.event_rsvp_check_zip.output_base64sha256
  handler          = "lambda_event_rsvp_check.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.event_rsvp_lambda_role.arn
  timeout          = 30
  memory_size      = 128
  layers           = [aws_lambda_layer_version.events_api_layer.arn]

  environment {
    variables = {
      EVENTS_TABLE_NAME       = aws_dynamodb_table.events.name
      VOLUNTEERS_TABLE_NAME   = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME        = aws_dynamodb_table.event_rsvps.name
      EVENT_RSVPS_TABLE_NAME  = aws_dynamodb_table.event_rsvps.name
    }
  }
}

# Create Lambda function for submitting event RSVPs
resource "aws_lambda_function" "event_rsvp_submit" {
  function_name    = "event_rsvp_submit${local.resource_suffix}"
  filename         = data.archive_file.event_rsvp_submit_zip.output_path
  source_code_hash = data.archive_file.event_rsvp_submit_zip.output_base64sha256
  handler          = "lambda_event_rsvp_submit.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.event_rsvp_lambda_role.arn
  timeout          = 30
  memory_size      = 128
  layers           = [aws_lambda_layer_version.events_api_layer.arn]

  environment {
    variables = {
      EVENTS_TABLE_NAME       = aws_dynamodb_table.events.name
      VOLUNTEERS_TABLE_NAME   = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME        = aws_dynamodb_table.event_rsvps.name
      EVENT_RSVPS_TABLE_NAME  = aws_dynamodb_table.event_rsvps.name
      MINORS_TABLE_NAME       = aws_dynamodb_table.minors.name
      SESSIONS_TABLE_NAME     = aws_dynamodb_table.auth_sessions.name
      SNS_TOPIC_ARN           = aws_sns_topic.event_rsvp_topic.arn
    }
  }
}

# Create Lambda function for listing event RSVPs
resource "aws_lambda_function" "event_rsvp_list" {
  function_name    = "event_rsvp_list${local.resource_suffix}"
  filename         = data.archive_file.event_rsvp_list_zip.output_path
  source_code_hash = data.archive_file.event_rsvp_list_zip.output_base64sha256
  handler          = "lambda_event_rsvp_list.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.event_rsvp_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.event_rsvps.name
    }
  }
}

# Create Lambda function for cancelling event RSVPs
resource "aws_lambda_function" "event_rsvp_cancel" {
  function_name    = "event_rsvp_cancel${local.resource_suffix}"
  filename         = data.archive_file.event_rsvp_cancel_zip.output_path
  source_code_hash = data.archive_file.event_rsvp_cancel_zip.output_base64sha256
  handler          = "lambda_event_rsvp_cancel.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.event_rsvp_lambda_role.arn
  timeout          = 30
  memory_size      = 128
  layers           = [aws_lambda_layer_version.events_api_layer.arn]

  environment {
    variables = {
      EVENTS_TABLE_NAME       = aws_dynamodb_table.events.name
      VOLUNTEERS_TABLE_NAME   = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME        = aws_dynamodb_table.event_rsvps.name
      EVENT_RSVPS_TABLE_NAME  = aws_dynamodb_table.event_rsvps.name
      SESSIONS_TABLE_NAME     = aws_dynamodb_table.auth_sessions.name
      MINORS_TABLE_NAME       = aws_dynamodb_table.minors.name
    }
  }
}

# Create Lambda function for marking no-shows
resource "aws_lambda_function" "event_rsvp_noshow" {
  function_name    = "event_rsvp_noshow${local.resource_suffix}"
  filename         = data.archive_file.event_rsvp_noshow_zip.output_path
  source_code_hash = data.archive_file.event_rsvp_noshow_zip.output_base64sha256
  handler          = "lambda_event_rsvp_noshow.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.event_rsvp_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      EVENTS_TABLE_NAME     = aws_dynamodb_table.events.name
      VOLUNTEERS_TABLE_NAME = aws_dynamodb_table.volunteers.name
      RSVPS_TABLE_NAME      = aws_dynamodb_table.event_rsvps.name
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

resource "aws_api_gateway_resource" "cancel_rsvp" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "cancel-event-rsvp"
}

resource "aws_api_gateway_resource" "mark_noshow" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "mark-event-noshow"
}

# POST method for mark-event-noshow endpoint
resource "aws_api_gateway_method" "mark_noshow_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.mark_noshow.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "mark_noshow_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.mark_noshow.id
  http_method = aws_api_gateway_method.mark_noshow_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.event_rsvp_noshow.invoke_arn
}

resource "aws_api_gateway_method_response" "mark_noshow_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.mark_noshow.id
  http_method = aws_api_gateway_method.mark_noshow_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_integration_response" "mark_noshow_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.mark_noshow.id
  http_method = aws_api_gateway_method.mark_noshow_post.http_method
  status_code = aws_api_gateway_method_response.mark_noshow_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.mark_noshow_integration]
}

# OPTIONS method for CORS support - mark-noshow endpoint
resource "aws_api_gateway_method" "mark_noshow_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.mark_noshow.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "mark_noshow_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.mark_noshow.id
  http_method = aws_api_gateway_method.mark_noshow_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "mark_noshow_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.mark_noshow.id
  http_method = aws_api_gateway_method.mark_noshow_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "mark_noshow_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.mark_noshow.id
  http_method = aws_api_gateway_method.mark_noshow_options.http_method
  status_code = aws_api_gateway_method_response.mark_noshow_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# Lambda permission for mark-noshow endpoint
resource "aws_lambda_permission" "mark_noshow_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_rsvp_noshow.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.mark_noshow_post.http_method}${aws_api_gateway_resource.mark_noshow.path}"
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

# Method response for check RSVP POST
resource "aws_api_gateway_method_response" "check_rsvp_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_rsvp.id
  http_method = aws_api_gateway_method.check_rsvp_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for check RSVP POST
resource "aws_api_gateway_integration_response" "check_rsvp_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_rsvp.id
  http_method = aws_api_gateway_method.check_rsvp_post.http_method
  status_code = aws_api_gateway_method_response.check_rsvp_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.check_rsvp_integration]
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

# Method response for submit RSVP POST
resource "aws_api_gateway_method_response" "submit_rsvp_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_rsvp.id
  http_method = aws_api_gateway_method.submit_rsvp_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for submit RSVP POST
resource "aws_api_gateway_integration_response" "submit_rsvp_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_rsvp.id
  http_method = aws_api_gateway_method.submit_rsvp_post.http_method
  status_code = aws_api_gateway_method_response.submit_rsvp_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.submit_rsvp_integration]
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
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "check_rsvp_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.check_rsvp.id
  http_method = aws_api_gateway_method.check_rsvp_options.http_method
  status_code = aws_api_gateway_method_response.check_rsvp_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
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
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "submit_rsvp_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.submit_rsvp.id
  http_method = aws_api_gateway_method.submit_rsvp_options.http_method
  status_code = aws_api_gateway_method_response.submit_rsvp_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
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

# Method response for list RSVPs POST
resource "aws_api_gateway_method_response" "list_rsvps_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.list_rsvps.id
  http_method = aws_api_gateway_method.list_rsvps_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for list RSVPs POST
resource "aws_api_gateway_integration_response" "list_rsvps_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.list_rsvps.id
  http_method = aws_api_gateway_method.list_rsvps_post.http_method
  status_code = aws_api_gateway_method_response.list_rsvps_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.list_rsvps_integration]
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
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "list_rsvps_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.list_rsvps.id
  http_method = aws_api_gateway_method.list_rsvps_options.http_method
  status_code = aws_api_gateway_method_response.list_rsvps_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# Methods for cancel-event-rsvp endpoint
resource "aws_api_gateway_method" "cancel_rsvp_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.cancel_rsvp.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cancel_rsvp_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cancel_rsvp.id
  http_method = aws_api_gateway_method.cancel_rsvp_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.event_rsvp_cancel.invoke_arn
}

# Method response for cancel RSVP POST
resource "aws_api_gateway_method_response" "cancel_rsvp_post_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cancel_rsvp.id
  http_method = aws_api_gateway_method.cancel_rsvp_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# Integration response for cancel RSVP POST
resource "aws_api_gateway_integration_response" "cancel_rsvp_post_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cancel_rsvp.id
  http_method = aws_api_gateway_method.cancel_rsvp_post.http_method
  status_code = aws_api_gateway_method_response.cancel_rsvp_post_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }

  depends_on = [aws_api_gateway_integration.cancel_rsvp_integration]
}

# OPTIONS method for CORS support - cancel endpoint
resource "aws_api_gateway_method" "cancel_rsvp_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.cancel_rsvp.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cancel_rsvp_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cancel_rsvp.id
  http_method = aws_api_gateway_method.cancel_rsvp_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "cancel_rsvp_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cancel_rsvp.id
  http_method = aws_api_gateway_method.cancel_rsvp_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "cancel_rsvp_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.cancel_rsvp.id
  http_method = aws_api_gateway_method.cancel_rsvp_options.http_method
  status_code = aws_api_gateway_method_response.cancel_rsvp_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
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

resource "aws_lambda_permission" "cancel_rsvp_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_rsvp_cancel.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.cancel_rsvp_post.http_method}${aws_api_gateway_resource.cancel_rsvp.path}"
}

# Add Gateway Responses for CORS support
resource "aws_api_gateway_gateway_response" "rsvp_cors_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,GET,POST'"
    "gatewayresponse.header.Access-Control-Max-Age"       = "'86400'"
  }
}

resource "aws_api_gateway_gateway_response" "rsvp_cors_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,GET,POST'"
    "gatewayresponse.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# API Gateway deployment for all endpoints (both waiver and RSVP)
resource "aws_api_gateway_deployment" "volunteer_waiver_deployment_v2" {
  depends_on = [
    # Waiver endpoints
    aws_api_gateway_integration.check_waiver_integration,
    aws_api_gateway_integration.submit_waiver_integration,
    aws_api_gateway_integration.check_waiver_options_integration,
    aws_api_gateway_integration.submit_waiver_options_integration,
    # Waiver OPTIONS integration responses
    aws_api_gateway_integration_response.check_waiver_options_integration_response,
    aws_api_gateway_integration_response.submit_waiver_options_integration_response,
    # RSVP endpoints
    aws_api_gateway_integration.check_rsvp_integration,
    aws_api_gateway_integration.submit_rsvp_integration,
    aws_api_gateway_integration.check_rsvp_options_integration,
    aws_api_gateway_integration.submit_rsvp_options_integration,
    aws_api_gateway_integration.list_rsvps_integration,
    aws_api_gateway_integration.list_rsvps_options_integration,
    aws_api_gateway_integration.cancel_rsvp_integration,
    aws_api_gateway_integration.cancel_rsvp_options_integration,
    # Mark no-show endpoints
    aws_api_gateway_integration.mark_noshow_integration,
    aws_api_gateway_integration.mark_noshow_options_integration,
    # Method responses for POST endpoints
    aws_api_gateway_method_response.check_rsvp_post_response,
    aws_api_gateway_method_response.submit_rsvp_post_response,
    aws_api_gateway_method_response.list_rsvps_post_response,
    aws_api_gateway_method_response.cancel_rsvp_post_response,
    aws_api_gateway_method_response.mark_noshow_post_response,
    # Integration responses for POST endpoints
    aws_api_gateway_integration_response.check_rsvp_post_integration_response,
    aws_api_gateway_integration_response.submit_rsvp_post_integration_response,
    aws_api_gateway_integration_response.list_rsvps_post_integration_response,
    aws_api_gateway_integration_response.cancel_rsvp_post_integration_response,
    aws_api_gateway_integration_response.mark_noshow_post_integration_response,
    # Integration responses for OPTIONS endpoints
    aws_api_gateway_integration_response.check_rsvp_options_integration_response,
    aws_api_gateway_integration_response.submit_rsvp_options_integration_response,
    aws_api_gateway_integration_response.list_rsvps_options_integration_response,
    aws_api_gateway_integration_response.cancel_rsvp_options_integration_response,
    aws_api_gateway_integration_response.mark_noshow_options_integration_response,
    # Auth endpoints
    aws_api_gateway_integration.auth_send_code_integration,
    aws_api_gateway_integration.auth_verify_code_integration,
    aws_api_gateway_integration.auth_validate_session_integration,
    aws_api_gateway_integration.user_dashboard_integration,
    aws_api_gateway_integration.auth_send_code_options_integration,
    aws_api_gateway_integration.auth_verify_code_options_integration,
    aws_api_gateway_integration.auth_validate_session_options_integration,
    aws_api_gateway_integration.user_dashboard_options_integration,
    # Auth method responses for POST endpoints
    aws_api_gateway_method_response.auth_send_code_post_response,
    aws_api_gateway_method_response.auth_verify_code_post_response,
    aws_api_gateway_method_response.auth_validate_session_post_response,
    aws_api_gateway_method_response.user_dashboard_post_response,
    # Auth integration responses for POST endpoints
    aws_api_gateway_integration_response.auth_send_code_post_integration_response,
    aws_api_gateway_integration_response.auth_verify_code_post_integration_response,
    aws_api_gateway_integration_response.auth_validate_session_post_integration_response,
    aws_api_gateway_integration_response.user_dashboard_post_integration_response,
    # Auth integration responses for OPTIONS endpoints
    aws_api_gateway_integration_response.auth_send_code_options_integration_response,
    aws_api_gateway_integration_response.auth_verify_code_options_integration_response,
    aws_api_gateway_integration_response.auth_validate_session_options_integration_response,
    aws_api_gateway_integration_response.user_dashboard_options_integration_response,
    # Minors endpoints
    aws_api_gateway_integration.minors_add_integration,
    aws_api_gateway_integration.minors_list_integration,
    aws_api_gateway_integration.minors_update_integration,
    aws_api_gateway_integration.minors_delete_integration,
    aws_api_gateway_integration.minors_add_options_integration,
    aws_api_gateway_integration.minors_list_options_integration,
    aws_api_gateway_integration.minors_update_options_integration,
    aws_api_gateway_integration.minors_delete_options_integration,
    # Minors method responses for OPTIONS endpoints
    aws_api_gateway_method_response.minors_add_options_response,
    aws_api_gateway_method_response.minors_list_options_response,
    aws_api_gateway_method_response.minors_update_options_response,
    aws_api_gateway_method_response.minors_delete_options_response,
    # Minors integration responses for OPTIONS endpoints
    aws_api_gateway_integration_response.minors_add_options_integration_response,
    aws_api_gateway_integration_response.minors_list_options_integration_response,
    aws_api_gateway_integration_response.minors_update_options_integration_response,
    aws_api_gateway_integration_response.minors_delete_options_integration_response,
    # Admin volunteers endpoint
    aws_api_gateway_integration.admin_volunteers_integration,
    aws_api_gateway_integration.admin_volunteers_options_integration,
    aws_api_gateway_method_response.admin_volunteers_options_response,
    aws_api_gateway_integration_response.admin_volunteers_options_integration_response
  ]

  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_integration.check_waiver_integration,
      aws_api_gateway_integration.submit_waiver_integration,
      aws_api_gateway_integration.check_waiver_options_integration,
      aws_api_gateway_integration.submit_waiver_options_integration,
      # Waiver OPTIONS integration responses
      aws_api_gateway_integration_response.check_waiver_options_integration_response,
      aws_api_gateway_integration_response.submit_waiver_options_integration_response,
      # RSVP endpoints
      aws_api_gateway_integration.check_rsvp_integration,
      aws_api_gateway_integration.submit_rsvp_integration,
      aws_api_gateway_integration.check_rsvp_options_integration,
      aws_api_gateway_integration.submit_rsvp_options_integration,
      aws_api_gateway_integration.list_rsvps_integration,
      aws_api_gateway_integration.list_rsvps_options_integration,
      # Method responses for POST endpoints
      aws_api_gateway_method_response.check_rsvp_post_response,
      aws_api_gateway_method_response.submit_rsvp_post_response,
      aws_api_gateway_method_response.list_rsvps_post_response,
      # Integration responses for POST endpoints
      aws_api_gateway_integration_response.check_rsvp_post_integration_response,
      aws_api_gateway_integration_response.submit_rsvp_post_integration_response,
      aws_api_gateway_integration_response.list_rsvps_post_integration_response,
      # Integration responses for OPTIONS endpoints
      aws_api_gateway_integration_response.check_rsvp_options_integration_response,
      aws_api_gateway_integration_response.submit_rsvp_options_integration_response,
      aws_api_gateway_integration_response.list_rsvps_options_integration_response,
      # Auth endpoints
      aws_api_gateway_integration.auth_send_code_integration,
      aws_api_gateway_integration.auth_verify_code_integration,
      aws_api_gateway_integration.auth_validate_session_integration,
      aws_api_gateway_integration.user_dashboard_integration,
      aws_api_gateway_integration.auth_send_code_options_integration,
      aws_api_gateway_integration.auth_verify_code_options_integration,
      aws_api_gateway_integration.auth_validate_session_options_integration,
      aws_api_gateway_integration.user_dashboard_options_integration,
      # Auth method responses for POST endpoints
      aws_api_gateway_method_response.auth_send_code_post_response,
      aws_api_gateway_method_response.auth_verify_code_post_response,
      aws_api_gateway_method_response.auth_validate_session_post_response,
      aws_api_gateway_method_response.user_dashboard_post_response,
      # Auth integration responses for POST endpoints
      aws_api_gateway_integration_response.auth_send_code_post_integration_response,
      aws_api_gateway_integration_response.auth_verify_code_post_integration_response,
      aws_api_gateway_integration_response.auth_validate_session_post_integration_response,
      aws_api_gateway_integration_response.user_dashboard_post_integration_response,
      # Auth integration responses for OPTIONS endpoints
      aws_api_gateway_integration_response.auth_send_code_options_integration_response,
      aws_api_gateway_integration_response.auth_verify_code_options_integration_response,
      aws_api_gateway_integration_response.auth_validate_session_options_integration_response,
      aws_api_gateway_integration_response.user_dashboard_options_integration_response,
      # Minors endpoints
      aws_api_gateway_integration.minors_add_integration,
      aws_api_gateway_integration.minors_list_integration,
      aws_api_gateway_integration.minors_update_integration,
      aws_api_gateway_integration.minors_delete_integration,
      aws_api_gateway_integration.minors_add_options_integration,
      aws_api_gateway_integration.minors_list_options_integration,
      aws_api_gateway_integration.minors_update_options_integration,
      aws_api_gateway_integration.minors_delete_options_integration,
      # Minors method responses for OPTIONS endpoints
      aws_api_gateway_method_response.minors_add_options_response,
      aws_api_gateway_method_response.minors_list_options_response,
      aws_api_gateway_method_response.minors_update_options_response,
      aws_api_gateway_method_response.minors_delete_options_response,
      # Minors integration responses for OPTIONS endpoints
      aws_api_gateway_integration_response.minors_add_options_integration_response,
      aws_api_gateway_integration_response.minors_list_options_integration_response,
      aws_api_gateway_integration_response.minors_update_options_integration_response,
      aws_api_gateway_integration_response.minors_delete_options_integration_response,
      # Admin volunteers endpoint
      aws_api_gateway_integration.admin_volunteers_integration,
      aws_api_gateway_integration.admin_volunteers_options_integration,
      aws_api_gateway_method_response.admin_volunteers_options_response,
      aws_api_gateway_integration_response.admin_volunteers_options_integration_response,
      # Force redeployment timestamp
      timestamp()
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
  name        = "/waterwaycleanups${local.resource_suffix}/check_rsvp_api_url"
  description = "URL for checking event RSVPs"
  type        = "String"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.check_rsvp.path_part}"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_ssm_parameter" "submit_rsvp_url" {
  name        = "/waterwaycleanups${local.resource_suffix}/submit_rsvp_api_url"
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

output "cancel_rsvp_url" {
  description = "URL for cancelling event RSVPs"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.cancel_rsvp.path_part}"
}

resource "aws_ssm_parameter" "list_rsvps_url" {
  name        = "/waterwaycleanups${local.resource_suffix}/list_rsvps_api_url"
  description = "URL for listing event RSVPs"
  type        = "String"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.list_rsvps.path_part}"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}

resource "aws_ssm_parameter" "cancel_rsvp_url" {
  name        = "/waterwaycleanups${local.resource_suffix}/cancel_rsvp_api_url"
  description = "URL for cancelling event RSVPs"
  type        = "String"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.cancel_rsvp.path_part}"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}
