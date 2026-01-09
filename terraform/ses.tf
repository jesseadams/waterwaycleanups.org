# Reference existing SES configuration set
resource "aws_ses_configuration_set" "main" {
  name                       = "my-first-configuration-set"
  reputation_metrics_enabled = true

  # Preserve existing configuration
  sending_enabled = true
}

# Create SNS topic for email bounce, complaint and error notifications
resource "aws_sns_topic" "email_issues" {
  name = "email-issues"
}

# Subscribe email to the SNS topic for email issues
resource "aws_sns_topic_subscription" "email_issues_subscription" {
  topic_arn = aws_sns_topic.email_issues.arn
  protocol  = "email"
  endpoint  = "jesse@waterwaycleanups.org"
}

# Create event destination for the configuration set
resource "aws_ses_event_destination" "sns_destination" {
  name                   = "email-issues-destination"
  configuration_set_name = aws_ses_configuration_set.main.name
  enabled                = true

  matching_types = [
    "bounce",
    "complaint",
    "reject",
    "renderingFailure"
  ]

  sns_destination {
    topic_arn = aws_sns_topic.email_issues.arn
  }
}
