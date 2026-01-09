# SES Configuration - shared across environments (only create in production)
# Staging will use the same SES configuration as production

# Reference existing SES configuration set
resource "aws_ses_configuration_set" "main" {
  count                      = local.is_production ? 1 : 0
  name                       = "my-first-configuration-set"
  reputation_metrics_enabled = true

  # Preserve existing configuration
  sending_enabled = true
}

# Create SNS topic for email bounce, complaint and error notifications
resource "aws_sns_topic" "email_issues" {
  count = local.is_production ? 1 : 0
  name  = "email-issues"
}

# Subscribe email to the SNS topic for email issues
resource "aws_sns_topic_subscription" "email_issues_subscription" {
  count     = local.is_production ? 1 : 0
  topic_arn = aws_sns_topic.email_issues[0].arn
  protocol  = "email"
  endpoint  = "jesse@waterwaycleanups.org"
}

# Create event destination for the configuration set
resource "aws_ses_event_destination" "sns_destination" {
  count                  = local.is_production ? 1 : 0
  name                   = "email-issues-destination"
  configuration_set_name = aws_ses_configuration_set.main[0].name
  enabled                = true

  matching_types = [
    "bounce",
    "complaint",
    "reject",
    "renderingFailure"
  ]

  sns_destination {
    topic_arn = aws_sns_topic.email_issues[0].arn
  }
}
