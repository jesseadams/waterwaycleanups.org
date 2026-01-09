# Main website infrastructure: CloudFront, S3, and Route 53 resources
# Parameterized by Terraform workspace (staging vs production)

#
# CLOUDFRONT FUNCTIONS
#

# CloudFront function for handling directory indexes in Hugo sites
# Note: This is a global resource, shared across workspaces
resource "aws_cloudfront_function" "directory_index" {
  name    = local.cloudfront_function_name
  runtime = "cloudfront-js-1.0"
  comment = "Handles directory indexes for Hugo static site"
  publish = true
  code    = file("${path.module}/directory_index_function.js")
}

#
# S3 BUCKET RESOURCES
#

# S3 bucket for website hosting
resource "aws_s3_bucket" "website_bucket" {
  bucket = local.bucket_name

  tags = {
    Name        = "Waterway Cleanups Website"
    Environment = local.environment_name
    ManagedBy   = "Terraform"
    Workspace   = local.workspace
  }
}

# Enable server-side encryption for the website bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "website_bucket_encryption" {
  bucket = aws_s3_bucket.website_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# S3 bucket versioning for the main website
resource "aws_s3_bucket_versioning" "website_bucket_versioning" {
  bucket = aws_s3_bucket.website_bucket.id

  versioning_configuration {
    status = "Disabled"
  }
}

#
# CLOUDFRONT RESOURCES
#

# Main website origin access control
resource "aws_cloudfront_origin_access_control" "website_oac" {
  name                              = local.oac_name
  description                       = "Origin Access Control for ${local.environment_name} website"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Main website CloudFront distribution
resource "aws_cloudfront_distribution" "website_distribution" {
  # S3 origin for main website
  origin {
    domain_name              = aws_s3_bucket.website_bucket.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.website_oac.id
    origin_id                = "s3-${local.workspace}-website"
  }

  # Aliases (CNAMEs) - varies by workspace
  aliases = local.use_custom_certificate ? local.cloudfront_aliases : []

  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  # Default cache behavior for main website
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-${local.workspace}-website"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    # Using standard caching policy
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized policy

    # CloudFront Function for directory index handling (Hugo-friendly)
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.directory_index.arn
    }
  }


  # Custom error response for 404 errors only
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Use ACM certificate if available, otherwise CloudFront default
  dynamic "viewer_certificate" {
    for_each = local.use_custom_certificate ? [1] : []
    content {
      acm_certificate_arn      = local.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = local.use_custom_certificate ? [] : [1]
    content {
      cloudfront_default_certificate = true
    }
  }

  # Associate WAF Web ACL with CloudFront (production only)
  web_acl_id = local.apply_waf ? aws_wafv2_web_acl.geo_block[0].arn : null

  tags = {
    Name        = "${local.environment_name} Website Distribution"
    Environment = local.environment_name
    ManagedBy   = "Terraform"
    Workspace   = local.workspace
  }

  # Prevent accidental deletion (production only)
  lifecycle {
    prevent_destroy = false # Note: Set to true manually for production after initial deploy
  }
}

# S3 bucket policy for main website
resource "aws_s3_bucket_policy" "website_bucket_policy" {
  bucket = aws_s3_bucket.website_bucket.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action   = "s3:GetObject",
        Effect   = "Allow",
        Resource = "${aws_s3_bucket.website_bucket.arn}/*",
        Principal = {
          Service = "cloudfront.amazonaws.com"
        },
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.website_distribution.arn
          }
        },
        Sid = "AllowCloudFrontServicePrincipal"
      }
    ]
  })
}

#
# ROUTE 53 RESOURCES
#

# Route 53 zone for the domain (shared across workspaces, only create in production)
resource "aws_route53_zone" "primary" {
  count         = local.is_production ? 1 : 0
  name          = "waterwaycleanups.org"
  comment       = "Managed by Terraform"
  force_destroy = false

  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }
}

# Data source to reference the zone in staging workspace
data "aws_route53_zone" "primary" {
  count = local.is_staging ? 1 : 0
  name  = "waterwaycleanups.org"
}

locals {
  # Use the zone from resource in production, data source in staging
  route53_zone_id = local.is_production ? aws_route53_zone.primary[0].zone_id : data.aws_route53_zone.primary[0].zone_id
}

# Main website A record (production only - apex domain)
resource "aws_route53_record" "website_record" {
  count   = local.is_production ? 1 : 0
  zone_id = local.route53_zone_id
  name    = "waterwaycleanups.org"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.website_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.website_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

# www CNAME record (production only)
resource "aws_route53_record" "www_record" {
  count   = local.is_production ? 1 : 0
  zone_id = local.route53_zone_id
  name    = "www.waterwaycleanups.org"
  type    = "CNAME"
  ttl     = 300
  records = ["waterwaycleanups.org"]
}

# MTA-STS CNAME record (production only)
resource "aws_route53_record" "mta_sts_record" {
  count   = local.is_production ? 1 : 0
  zone_id = local.route53_zone_id
  name    = "mta-sts.waterwaycleanups.org"
  type    = "CNAME"
  ttl     = 60
  records = ["waterwaycleanups.org"]
}

# Staging subdomain A record
resource "aws_route53_record" "staging_record" {
  count   = local.is_staging && local.use_custom_certificate ? 1 : 0
  zone_id = local.route53_zone_id
  name    = "staging.waterwaycleanups.org"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.website_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.website_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

#
# OUTPUTS
#

output "workspace" {
  value       = local.workspace
  description = "Current Terraform workspace"
}

output "environment" {
  value       = local.environment_name
  description = "Environment name (Production or Staging)"
}

output "website_bucket_name" {
  value       = aws_s3_bucket.website_bucket.id
  description = "The name of the website S3 bucket"
}

# Output the main website CloudFront distribution ID
output "main_cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.website_distribution.id
  description = "The ID of the website CloudFront distribution"
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.website_distribution.domain_name
  description = "The CloudFront distribution domain name"
}

output "website_url" {
  value       = local.use_custom_certificate ? "https://${local.domain_name}" : "https://${aws_cloudfront_distribution.website_distribution.domain_name}"
  description = "The URL for the website"
}

# Output the Route 53 zone ID
output "route53_zone_id" {
  value       = local.route53_zone_id
  description = "The ID of the Route 53 zone"
}
