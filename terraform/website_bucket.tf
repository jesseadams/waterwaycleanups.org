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

# S3 bucket policy for the main website bucket to allow CloudFront access
resource "aws_s3_bucket_policy" "website_bucket_policy" {
  bucket = aws_s3_bucket.website_bucket.id

  policy = jsonencode({
    Id        = "PolicyForCloudFrontPrivateContent"
    Statement = [
      {
        Action    = "s3:GetObject"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.website_distribution.arn
          }
        }
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Resource  = "${aws_s3_bucket.website_bucket.arn}/*"
        Sid       = "AllowCloudFrontServicePrincipal"
      },
    ]
    Version   = "2012-10-17"
  })
}

# Output the main website bucket name
output "website_bucket_name" {
  value = aws_s3_bucket.website_bucket.id
  description = "The name of the S3 bucket for the main website"
}
