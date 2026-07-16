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

# Package the lambda, bundling pytz for US/Eastern-aware date formatting
resource "null_resource" "rsvp_confirmation_package" {
  provisioner "local-exec" {
    command = <<EOF
rm -rf ${path.module}/lambda_rsvp_confirmation_package
mkdir -p ${path.module}/lambda_rsvp_confirmation_package
cp ${path.module}/lambda_rsvp_confirmation.py ${path.module}/lambda_rsvp_confirmation_package/
pip install pytz -t ${path.module}/lambda_rsvp_confirmation_package/ >/dev/null 2>&1
cd ${path.module}/lambda_rsvp_confirmation_package && python3 -c "import zipfile; import os; z=zipfile.ZipFile('../lambda_rsvp_confirmation.zip', 'w'); [z.write(os.path.join(root, f), os.path.join(root, f)) for root, _, files in os.walk('.') for f in files]; z.close()"
cd ${path.module} && rm -rf lambda_rsvp_confirmation_package
EOF
  }

  triggers = {
    code_hash = filemd5("${path.module}/lambda_rsvp_confirmation.py")
  }
}

resource "aws_lambda_function" "rsvp_confirmation" {
  function_name    = "rsvp_confirmation${local.resource_suffix}"
  filename         = "${path.module}/lambda_rsvp_confirmation.zip"
  source_code_hash = filemd5("${path.module}/lambda_rsvp_confirmation.py")
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

  depends_on = [null_resource.rsvp_confirmation_package]
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
