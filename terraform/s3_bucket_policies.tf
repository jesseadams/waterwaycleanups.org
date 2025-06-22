# S3 bucket policies for granting access to CloudFront distributions

# Main website bucket policy
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
        Sid = "AllowCloudFrontServicePrincipalForMainWebsite"
      }
    ]
  })
}

# SESv2 admin bucket policy
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
        Sid = "AllowCloudFrontServicePrincipalForSESv2Admin"
      }
    ]
  })
}
