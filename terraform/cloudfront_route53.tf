# CloudFront distribution for the website
resource "aws_cloudfront_distribution" "website_distribution" {
  origin {
    domain_name              = "waterwaycleanups.org.s3.us-east-1.amazonaws.com"
    origin_access_control_id = aws_cloudfront_origin_access_control.website_oac.id
    origin_id                = "s3"
    origin_path              = ""
  }

  # Aliases (CNAMEs)
  aliases = ["waterwaycleanups.org", "www.waterwaycleanups.org", "mta-sts.waterwaycleanups.org"]

  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  default_cache_behavior {
    allowed_methods        = ["HEAD", "GET"]
    cached_methods         = ["HEAD", "GET"]
    target_origin_id       = "s3"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    
    # Using cache policy instead of forwarded_values
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized policy
    
    # CloudFront function for appending index.html to directory requests
    function_association {
      event_type   = "viewer-request"
      function_arn = "arn:aws:cloudfront::767072126027:function/Append-index-html"
    }
  }

  # Custom error response
  custom_error_response {
    error_code            = 403
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
