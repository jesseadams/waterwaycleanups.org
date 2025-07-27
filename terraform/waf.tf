# WAF to block traffic from China
# This WAF is associated with the main CloudFront distribution

# Create a Web ACL for CloudFront
resource "aws_wafv2_web_acl" "china_block" {
  name        = "china-block-waf"
  description = "WAF Web ACL to block traffic from China"
  scope       = "CLOUDFRONT" # Using CLOUDFRONT scope since we're associating it with CloudFront

  default_action {
    allow {}
  }

  # Rule to block traffic from China
  rule {
    name     = "BlockChina"
    priority = 1

    action {
      block {}
    }

    statement {
      geo_match_statement {
        country_codes = ["CN"] # ISO 3166 country code for China
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BlockChina"
      sampled_requests_enabled   = true
    }
  }

  # Required visibility configuration
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "ChinaBlockWAF"
    sampled_requests_enabled   = true
  }

  # Prevent accidental deletion
  lifecycle {
    create_before_destroy = true
  }
}

# Note: For CloudFront, the WAF is associated directly in the CloudFront distribution configuration
# in main-site-infrastructure.tf, not here with aws_wafv2_web_acl_association

# Output the WAF Web ACL ID
output "waf_web_acl_id" {
  value       = aws_wafv2_web_acl.china_block.id
  description = "The ID of the WAF Web ACL"
}

# Output the WAF Web ACL ARN
output "waf_web_acl_arn" {
  value       = aws_wafv2_web_acl.china_block.arn
  description = "The ARN of the WAF Web ACL"
}
