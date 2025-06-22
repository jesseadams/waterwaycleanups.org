# Main website infrastructure: CloudFront, S3, and Route 53 resources

#
# S3 BUCKET RESOURCES
#

# S3 bucket for website hosting
resource "aws_s3_bucket" "website_bucket" {
  bucket = "waterwaycleanups.org"

  tags = {
    Name        = "Waterway Cleanups Website"
    Environment = "Production"
    ManagedBy   = "Terraform"
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
  name                              = "waterwaycleanups.org.s3.us-east-1.amazonaws.com"
  description                       = "Origin Access Control for main website"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Main website CloudFront distribution
resource "aws_cloudfront_distribution" "website_distribution" {
  # S3 origin for main website
  origin {
    domain_name              = "waterwaycleanups.org.s3.us-east-1.amazonaws.com"
    origin_access_control_id = aws_cloudfront_origin_access_control.website_oac.id
    origin_id                = "s3-main-website"
  }

  # Aliases (CNAMEs)
  aliases = ["waterwaycleanups.org", "www.waterwaycleanups.org", "mta-sts.waterwaycleanups.org"]

  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  # Default cache behavior for main website
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-main-website"
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

  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }
}

# S3 bucket policy for main website
resource "aws_s3_bucket_policy" "website_bucket_policy" {
  bucket = aws_s3_bucket.website_bucket.id
  
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action    = "s3:GetObject",
        Effect    = "Allow",
        Resource  = "${aws_s3_bucket.website_bucket.arn}/*",
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

# Route 53 zone for the domain
resource "aws_route53_zone" "primary" {
  name          = "waterwaycleanups.org"
  comment       = "Managed by Terraform"
  force_destroy = false
  
  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }
}

# Main website records
resource "aws_route53_record" "website_record" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "waterwaycleanups.org"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.website_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.website_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

# www CNAME record
resource "aws_route53_record" "www_record" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "www.waterwaycleanups.org"
  type    = "CNAME"
  ttl     = 300
  records = ["waterwaycleanups.org"]
}

# MTA-STS CNAME record
resource "aws_route53_record" "mta_sts_record" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "mta-sts.waterwaycleanups.org"
  type    = "CNAME"
  ttl     = 60
  records = ["waterwaycleanups.org"]
}

#
# OUTPUTS
#

# Output the main website CloudFront distribution ID
output "main_cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.website_distribution.id
  description = "The ID of the main website CloudFront distribution"
}

# Output the Route 53 zone ID
output "route53_zone_id" {
  value = aws_route53_zone.primary.zone_id
  description = "The ID of the Route 53 zone"
}
