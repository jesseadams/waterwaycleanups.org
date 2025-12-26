# WAF to block traffic from specific countries
# This WAF is associated with the main CloudFront distribution

# CloudWatch Log Group for WAF logging
resource "aws_cloudwatch_log_group" "waf_log_group" {
  name              = "/aws/wafv2/country-block-waf"
  retention_in_days = 90
  
  tags = {
    Name        = "WAF Country Block Logs"
    Environment = "production"
  }
}

# S3 bucket for Kinesis Firehose delivery (backup)
resource "aws_s3_bucket" "waf_logs_backup" {
  bucket = "waterway-cleanups-waf-logs-backup-${random_string.bucket_suffix.result}"
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket_versioning" "waf_logs_backup_versioning" {
  bucket = aws_s3_bucket.waf_logs_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "waf_logs_backup_encryption" {
  bucket = aws_s3_bucket.waf_logs_backup.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# IAM role for Kinesis Firehose
resource "aws_iam_role" "firehose_delivery_role" {
  name = "waf-firehose-delivery-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "firehose.amazonaws.com"
        }
      }
    ]
  })
}

# IAM policy for Kinesis Firehose
resource "aws_iam_role_policy" "firehose_delivery_policy" {
  name = "waf-firehose-delivery-policy"
  role = aws_iam_role.firehose_delivery_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.waf_log_group.arn}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject"
        ]
        Resource = [
          aws_s3_bucket.waf_logs_backup.arn,
          "${aws_s3_bucket.waf_logs_backup.arn}/*"
        ]
      }
    ]
  })
}

# Kinesis Data Firehose delivery stream
resource "aws_kinesis_firehose_delivery_stream" "waf_logs_stream" {
  name        = "aws-waf-logs-country-block-waf"
  destination = "extended_s3"

  extended_s3_configuration {
    role_arn   = aws_iam_role.firehose_delivery_role.arn
    bucket_arn = aws_s3_bucket.waf_logs_backup.arn
    prefix     = "waf-logs/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/"
    error_output_prefix = "waf-logs-errors/"
    
    buffering_size     = 5
    buffering_interval = 300
    
    compression_format = "GZIP"

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.waf_log_group.name
      log_stream_name = "waf-firehose-delivery"
    }
  }
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
  log_destination_configs = [aws_kinesis_firehose_delivery_stream.waf_logs_stream.arn]

  # No logging_filter means all requests (allowed and blocked) will be logged
  
  depends_on = [
    aws_cloudwatch_log_group.waf_log_group,
    aws_kinesis_firehose_delivery_stream.waf_logs_stream
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
