# CloudFront distribution for the website
resource "aws_cloudfront_distribution" "website_distribution" {
  # Main website origin
  origin {
    domain_name              = "waterwaycleanups.org.s3.us-east-1.amazonaws.com"
    origin_access_control_id = aws_cloudfront_origin_access_control.website_oac.id
    origin_id                = "s3-main"
  }

  # SESv2-admin origin
  origin {
    domain_name              = "${aws_s3_bucket.sesv2_admin_bucket.bucket}.s3.us-east-1.amazonaws.com"
    origin_access_control_id = aws_cloudfront_origin_access_control.website_oac.id
    origin_id                = "s3-admin"
  }

  # Aliases (CNAMEs)
  aliases = ["waterwaycleanups.org", "www.waterwaycleanups.org", "mta-sts.waterwaycleanups.org"]

  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  # SESv2-admin cache behavior for /sesv2-admin/* paths
  ordered_cache_behavior {
    path_pattern           = "/sesv2-admin/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-admin"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    # Using minimal caching for SPA routes
    cache_policy_id = aws_cloudfront_cache_policy.spa_minimal_cache.id
    
    # Lambda@Edge function for the admin app path
    lambda_function_association {
      event_type   = "origin-request"
      lambda_arn   = "${aws_lambda_function.spa_router.arn}:${aws_lambda_function.spa_router.version}"
      include_body = false
    }
  }

  # Default cache behavior for all requests
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-main"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    # Using minimal caching for SPA routes
    cache_policy_id = aws_cloudfront_cache_policy.spa_minimal_cache.id
    
    # Lambda@Edge function for origin-request
    lambda_function_association {
      event_type   = "origin-request"
      lambda_arn   = "${aws_lambda_function.spa_router.arn}:${aws_lambda_function.spa_router.version}"
      include_body = false
    }
  }

  # We're removing custom error responses since Lambda@Edge will handle routing

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

# Custom cache policy for SPA routes
resource "aws_cloudfront_cache_policy" "spa_minimal_cache" {
  name        = "SPA-Minimal-Cache-Policy"
  comment     = "Policy for Single Page Applications with minimal caching"
  
  default_ttl = 0
  min_ttl     = 0
  max_ttl     = 60
  
  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    
    headers_config {
      header_behavior = "none"
    }
    
    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Origin Access Control for CloudFront
resource "aws_cloudfront_origin_access_control" "website_oac" {
  name                              = "waterwaycleanups.org.s3.us-east-1.amazonaws.com"
  description                       = "Managed by Terraform"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
  
  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }
}

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

# A record pointing to CloudFront distribution
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

# www CNAME record - modifying to match existing DNS
resource "aws_route53_record" "www_record" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "www.waterwaycleanups.org"
  type    = "CNAME"
  ttl     = 300
  records = ["waterwaycleanups.org"]
}

# MTA-STS CNAME record - modifying to match existing DNS
resource "aws_route53_record" "mta_sts_record" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "mta-sts.waterwaycleanups.org"
  type    = "CNAME"
  ttl     = 60
  records = ["waterwaycleanups.org"]
}

# Output the IDs for verification
output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.website_distribution.id
  description = "The ID of the CloudFront distribution"
}

output "route53_zone_id" {
  value = aws_route53_zone.primary.zone_id
  description = "The ID of the Route 53 zone"
}
