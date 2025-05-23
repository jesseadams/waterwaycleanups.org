provider "aws" {
  region = var.aws_region
}

# Create IAM role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "volunteer_lambda_role"

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

# Create policy for Lambda to interact with SESv2 and SNS
resource "aws_iam_policy" "lambda_ses_policy" {
  name        = "lambda_sesv2_policy"
  description = "IAM policy for Lambda to interact with SESv2 and SNS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "ses:CreateContact",
          "ses:PutContactListEntry",
          "ses:GetContact",
          "ses:GetContactList",
          "ses:CreateContactList",
          "ses:ListContactLists",
          "ses:BatchPutContactListEntries",
          "sns:Publish",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Effect   = "Allow"
        Resource = "*"
      }
    ]
  })
}

# Attach policy to IAM role
resource "aws_iam_role_policy_attachment" "lambda_ses_attachment" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_ses_policy.arn
}

# Create Lambda function for handling volunteer form submissions
resource "aws_lambda_function" "volunteer_lambda" {
  filename      = data.archive_file.lambda_zip.output_path
  source_code_hash = filebase64sha256(data.archive_file.lambda_zip.output_path)
  function_name = "volunteer_form_handler"
  role          = aws_iam_role.lambda_role.arn
  handler       = "lambda.handler"
  runtime       = "python3.9"
  timeout       = 30

  environment {
    variables = {
      CONTACT_LIST_NAME = var.ses_contact_list_name
      TOPIC_NAME        = var.ses_topic_name
      REGION_NAME       = var.aws_region
      SNS_TOPIC_ARN     = aws_sns_topic.volunteer_form_topic.arn
    }
  }
}

# Create API Gateway REST API
resource "aws_api_gateway_rest_api" "volunteer_api" {
  name        = "volunteer-api"
  description = "API for volunteer form submissions"
  
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# Create resource for /submit-volunteer
resource "aws_api_gateway_resource" "submit_volunteer" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_api.root_resource_id
  path_part   = "submit-volunteer"
}

# Create POST method for /submit-volunteer
resource "aws_api_gateway_method" "submit_volunteer_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  resource_id   = aws_api_gateway_resource.submit_volunteer.id
  http_method   = "POST"
  authorization = "NONE"
}

# Setup integration between API Gateway and Lambda
resource "aws_api_gateway_integration" "lambda_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.submit_volunteer.id
  http_method = aws_api_gateway_method.submit_volunteer_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.volunteer_lambda.invoke_arn
}

# Create POST method response
resource "aws_api_gateway_method_response" "post_200" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.submit_volunteer.id
  http_method = aws_api_gateway_method.submit_volunteer_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
  
  response_models = {
    "application/json" = "Empty"
  }
}

# Enable CORS on the API Gateway resource
resource "aws_api_gateway_gateway_response" "cors" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,GET,POST'"
  }
}

# Setup OPTIONS method for CORS
resource "aws_api_gateway_method" "options_method" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  resource_id   = aws_api_gateway_resource.submit_volunteer.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# Create mock integration for OPTIONS
resource "aws_api_gateway_integration" "options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.submit_volunteer.id
  http_method = aws_api_gateway_method.options_method.http_method
  
  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Create method response for OPTIONS
resource "aws_api_gateway_method_response" "options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.submit_volunteer.id
  http_method = aws_api_gateway_method.options_method.http_method
  status_code = "200"
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

# Create integration response for OPTIONS
resource "aws_api_gateway_integration_response" "options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  resource_id = aws_api_gateway_resource.submit_volunteer.id
  http_method = aws_api_gateway_method.options_method.http_method
  status_code = aws_api_gateway_method_response.options_response.status_code
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}

# Create Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.volunteer_lambda.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_api_gateway_rest_api.volunteer_api.execution_arn}/*/*"
}

# Deploy API Gateway
resource "aws_api_gateway_deployment" "volunteer_api_deployment" {
  depends_on = [
    aws_api_gateway_integration.lambda_integration,
    aws_api_gateway_integration.options_integration
  ]

  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  
  lifecycle {
    create_before_destroy = true
  }
}

# Create API Gateway Stage
resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.volunteer_api_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  stage_name    = var.api_stage_name
}

# Create SES Contact List (if it doesn't exist)
resource "null_resource" "create_contact_list" {
  provisioner "local-exec" {
    command = <<EOT
      aws sesv2 create-contact-list \
        --contact-list-name ${var.ses_contact_list_name} \
        --topics TopicName=${var.ses_topic_name} \
        --region ${var.aws_region} || true
    EOT
  }
}

# Zip Lambda function for deployment
data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "${path.module}/lambda.zip"
  source_file = "${path.module}/lambda.py"
}
