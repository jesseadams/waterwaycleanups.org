# Create SNS Topic for form submissions
resource "aws_sns_topic" "volunteer_form_topic" {
  name = "volunteer-form-submissions"
}

# Subscribe email to SNS topic
resource "aws_sns_topic_subscription" "email_subscription" {
  topic_arn = aws_sns_topic.volunteer_form_topic.arn
  protocol  = "email"
  endpoint  = "jesse@waterwaycleanups.org"
}

# Create SNS Topic for volunteer waiver submissions
resource "aws_sns_topic" "volunteer_waiver_topic" {
  name = "volunteer-waiver-submissions"
}

# Subscribe email to volunteer waiver SNS topic
resource "aws_sns_topic_subscription" "waiver_email_subscription" {
  topic_arn = aws_sns_topic.volunteer_waiver_topic.arn
  protocol  = "email"
  endpoint  = "jesse@waterwaycleanups.org"
}
