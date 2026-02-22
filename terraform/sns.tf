# Create SNS Topic for form submissions
resource "aws_sns_topic" "volunteer_form_topic" {
  name = "volunteer-form-submissions${local.resource_suffix}"
}

# Subscribe email to SNS topic
resource "aws_sns_topic_subscription" "email_subscription" {
  topic_arn = aws_sns_topic.volunteer_form_topic.arn
  protocol  = "email"
  endpoint  = "jesse@waterwaycleanups.org"

  lifecycle {
    # Email subscriptions require manual confirmation — prevent Terraform from
    # destroying and recreating them on every apply, which re-sends confirmation emails
    ignore_changes = [endpoint, protocol]
  }
}

# Create SNS Topic for volunteer waiver submissions
resource "aws_sns_topic" "volunteer_waiver_topic" {
  name = "volunteer-waiver-submissions${local.resource_suffix}"
}

# Subscribe email to volunteer waiver SNS topic
resource "aws_sns_topic_subscription" "waiver_email_subscription" {
  topic_arn = aws_sns_topic.volunteer_waiver_topic.arn
  protocol  = "email"
  endpoint  = "jesse@waterwaycleanups.org"

  lifecycle {
    ignore_changes = [endpoint, protocol]
  }
}

# Subscribe email to event RSVP SNS topic
resource "aws_sns_topic_subscription" "event_rsvp_email_subscription" {
  topic_arn = aws_sns_topic.event_rsvp_topic.arn
  protocol  = "email"
  endpoint  = "jesse@waterwaycleanups.org"

  lifecycle {
    ignore_changes = [endpoint, protocol]
  }
}
