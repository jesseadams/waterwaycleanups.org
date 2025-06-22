# Separate CloudFront distributions for main website and SESv2 admin app

# ----------------------
# Main Website Resources
# ----------------------

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

# ----------------------
# SESv2 Admin Resources
# ----------------------

# SESv2 admin origin access control
resource "aws_cloudfront_origin_access_control" "sesv2_admin_oac" {
  name                              = "${aws_s3_bucket.sesv2_admin_bucket.bucket}.s3.us-east-1.amazonaws.com"
  description                       = "Origin Access Control for SESv2 admin app"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# SESv2 admin CloudFront distribution
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

# ----------------------
# Route 53 Configuration
# ----------------------

# Main website records (unchanged)
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

# www CNAME record (unchanged)
resource "aws_route53_record" "www_record" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "www.waterwaycleanups.org"
  type    = "CNAME"
  ttl     = 300
  records = ["waterwaycleanups.org"]
}

# MTA-STS CNAME record (unchanged)
resource "aws_route53_record" "mta_sts_record" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "mta-sts.waterwaycleanups.org"
  type    = "CNAME"
  ttl     = 60
  records = ["waterwaycleanups.org"]
}

# New record for SESv2 admin app
resource "aws_route53_record" "sesv2_admin_record" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "sesv2-admin.waterwaycleanups.org"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.sesv2_admin_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.sesv2_admin_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

# Output the IDs for verification
output "main_cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.website_distribution.id
  description = "The ID of the main website CloudFront distribution"
}

output "admin_cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.sesv2_admin_distribution.id
  description = "The ID of the SESv2 admin CloudFront distribution"
}
