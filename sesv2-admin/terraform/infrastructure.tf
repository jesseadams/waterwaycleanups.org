# SESv2 Admin App Infrastructure
# Consolidated file for S3, CloudFront, and Route 53 resources

#
# S3 BUCKET RESOURCES
#

# S3 bucket for sesv2-admin application hosting
resource "aws_s3_bucket" "sesv2_admin_bucket" {
  bucket = "waterwaycleanups-sesv2-admin"

  tags = {
    Name        = "Waterway Cleanups SESv2 Admin Interface"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Enable server-side encryption for the sesv2-admin bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "sesv2_admin_bucket_encryption" {
  bucket = aws_s3_bucket.sesv2_admin_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# S3 bucket versioning for sesv2-admin
resource "aws_s3_bucket_versioning" "sesv2_admin_bucket_versioning" {
  bucket = aws_s3_bucket.sesv2_admin_bucket.id

  versioning_configuration {
    status = "Disabled"
  }
}

# S3 bucket policy for allowing CloudFront access
resource "aws_s3_bucket_policy" "sesv2_admin_bucket_policy" {
  bucket = aws_s3_bucket.sesv2_admin_bucket.id
  
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action    = "s3:GetObject",
        Effect    = "Allow",
        Resource  = "${aws_s3_bucket.sesv2_admin_bucket.arn}/*",
        Principal = {
          Service = "cloudfront.amazonaws.com"
        },
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.sesv2_admin_distribution.arn
          }
        },
        Sid = "AllowCloudFrontServicePrincipal"
      }
    ]
  })
}

#
# CLOUDFRONT RESOURCES
#

# Origin access control for the SESv2 admin bucket
resource "aws_cloudfront_origin_access_control" "sesv2_admin_oac" {
  name                              = "${aws_s3_bucket.sesv2_admin_bucket.bucket}.s3.us-east-1.amazonaws.com"
  description                       = "Origin Access Control for SESv2 admin app"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution for the SESv2 admin app
resource "aws_cloudfront_distribution" "sesv2_admin_distribution" {
  # S3 origin for SESv2 admin app
  origin {
    domain_name              = "${aws_s3_bucket.sesv2_admin_bucket.bucket}.s3.us-east-1.amazonaws.com"
    origin_access_control_id = aws_cloudfront_origin_access_control.sesv2_admin_oac.id
    origin_id                = "s3-sesv2-admin"
  }

  # Alias for sesv2-admin.waterwaycleanups.org
  aliases = ["sesv2-admin.waterwaycleanups.org"]

  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  # Default cache behavior for SESv2 admin app
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-sesv2-admin"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    
    # Using standard caching policy
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized policy
  }

  # Custom error response for SPA routing
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = "arn:aws:acm:us-east-1:767072126027:certificate/98ff48eb-0a07-45a8-8cf3-c6b782f409d9"
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

#
# ROUTE 53 RESOURCES
#

# Import the existing Route 53 zone
data "aws_route53_zone" "primary" {
  name = "waterwaycleanups.org"
}

# Create a Route 53 record for the SESv2 admin app
resource "aws_route53_record" "sesv2_admin_record" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "sesv2-admin.waterwaycleanups.org"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.sesv2_admin_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.sesv2_admin_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

#
# OUTPUTS
#

# Output the sesv2-admin bucket name
output "sesv2_admin_bucket_name" {
  value = aws_s3_bucket.sesv2_admin_bucket.id
  description = "The name of the S3 bucket for sesv2-admin application"
}

# Output the CloudFront distribution ID
output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.sesv2_admin_distribution.id
  description = "The ID of the SESv2 admin CloudFront distribution"
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.sesv2_admin_distribution.domain_name
  description = "The domain name of the SESv2 admin CloudFront distribution"
}

output "route53_record_name" {
  value       = aws_route53_record.sesv2_admin_record.name
  description = "The name of the Route 53 record for SESv2 admin app"
}
