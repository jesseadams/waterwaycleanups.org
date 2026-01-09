# WAF to block traffic from specific countries
# This WAF is associated with the main CloudFront distribution

# CloudWatch Log Group for WAF logging
resource "aws_cloudwatch_log_group" "waf_log_group" {
  name              = "aws-waf-logs-country-block-waf"
  retention_in_days = 90

  tags = {
    Name        = "WAF Country Block Logs"
    Environment = "production"
  }
}

# Resource policy to allow WAF to write to CloudWatch Logs
resource "aws_cloudwatch_log_resource_policy" "waf_log_policy" {
  policy_name = "waf-log-policy"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "wafv2.amazonaws.com"
        }
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.waf_log_group.arn}:*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = "767072126027"
          }
        }
      }
    ]
  })
}

# Create a Web ACL for CloudFront
resource "aws_wafv2_web_acl" "geo_block" {
  name        = "country-block-waf"
  description = "WAF Web ACL to block traffic from specific countries"
  scope       = "CLOUDFRONT" # Using CLOUDFRONT scope since we're associating it with CloudFront

  default_action {
    allow {}
  }

  # Rule to block traffic from specified countries
  rule {
    name     = "BlockCountries"
    priority = 1

    action {
      block {}
    }

    statement {
      geo_match_statement {
        country_codes = [
          "CN", # China
          "RU", # Russia
          "NL", # Netherlands
          "KP"  # North Korea
        ]
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BlockCountries"
      sampled_requests_enabled   = true
    }
  }

  # Required visibility configuration
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "CountryBlockWAF"
    sampled_requests_enabled   = true
  }

  # Prevent accidental deletion
  lifecycle {
    create_before_destroy = true
  }
}

# Note: For CloudFront, the WAF is associated directly in the CloudFront distribution configuration
# in main-site-infrastructure.tf, not here with aws_wafv2_web_acl_association

# Enable WAF logging
resource "aws_wafv2_web_acl_logging_configuration" "waf_logging" {
  resource_arn            = aws_wafv2_web_acl.geo_block.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf_log_group.arn]

  # No logging_filter means all requests (allowed and blocked) will be logged

  depends_on = [
    aws_cloudwatch_log_group.waf_log_group,
    aws_cloudwatch_log_resource_policy.waf_log_policy
  ]
}

# Output the WAF Web ACL ID
output "waf_web_acl_id" {
  value       = aws_wafv2_web_acl.geo_block.id
  description = "The ID of the WAF Web ACL"
}

# Output the WAF Web ACL ARN
output "waf_web_acl_arn" {
  value       = aws_wafv2_web_acl.geo_block.arn
  description = "The ARN of the WAF Web ACL"
}

# Output the CloudWatch Log Group name for easy access
output "waf_log_group_name" {
  value       = aws_cloudwatch_log_group.waf_log_group.name
  description = "The name of the CloudWatch Log Group for WAF logs"
}

# Output the CloudWatch Log Group ARN
output "waf_log_group_arn" {
  value       = aws_cloudwatch_log_group.waf_log_group.arn
  description = "The ARN of the CloudWatch Log Group for WAF logs"
}
