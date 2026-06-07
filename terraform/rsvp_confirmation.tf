# RSVP Confirmation Email System
#
# A Lambda that subscribes to the event RSVP SNS topic and sends the volunteer
# a thank-you confirmation email with an "Add to Google Calendar" link and an
# attached .ics calendar invite. Decoupled from the RSVP submit path so a
# failure to email never affects the RSVP itself.

# IAM role for the confirmation lambda
resource "aws_iam_role" "rsvp_confirmation_lambda_role" {
  name = "rsvp_confirmation_lambda_role${local.resource_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action    = "sts:AssumeRole",
        Principal = { Service = "lambda.amazonaws.com" },
        Effect    = "Allow",
        Sid       = ""
      }
    ]
  })
}

resource "aws_iam_policy" "rsvp_confirmation_lambda_policy" {
  name        = "rsvp_confirmation_lambda_policy${local.resource_suffix}"
  description = "IAM policy for the RSVP confirmation email lambda"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "dynamodb:GetItem"
        ],
        Resource = [
          aws_dynamodb_table.events.arn
        ],
        Effect = "Allow"
      },
      {
        Action = [
          "ses:SendRawEmail",
          "ses:SendEmail"
        ],
        Resource = "*",
        Effect   = "Allow"
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

resource "aws_iam_role_policy_attachment" "rsvp_confirmation_lambda_attachment" {
  role       = aws_iam_role.rsvp_confirmation_lambda_role.name
  policy_arn = aws_iam_policy.rsvp_confirmation_lambda_policy.arn
}

# Package the lambda
data "archive_file" "rsvp_confirmation_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_rsvp_confirmation.py"
  output_path = "${path.module}/lambda_rsvp_confirmation.zip"
}

resource "aws_lambda_function" "rsvp_confirmation" {
  function_name    = "rsvp_confirmation${local.resource_suffix}"
  filename         = data.archive_file.rsvp_confirmation_zip.output_path
  source_code_hash = data.archive_file.rsvp_confirmation_zip.output_base64sha256
  handler          = "lambda_rsvp_confirmation.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.rsvp_confirmation_lambda_role.arn
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      EVENTS_TABLE_NAME = aws_dynamodb_table.events.name
      SENDER_EMAIL      = "info@waterwaycleanups.org"
      SITE_URL          = "https://${local.domain_name}"
    }
  }
}

# Allow the RSVP SNS topic to invoke this lambda
resource "aws_lambda_permission" "rsvp_confirmation_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rsvp_confirmation.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.event_rsvp_topic.arn
}

# Subscribe the lambda to the RSVP notification topic
resource "aws_sns_topic_subscription" "rsvp_confirmation_subscription" {
  topic_arn = aws_sns_topic.event_rsvp_topic.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.rsvp_confirmation.arn
}
