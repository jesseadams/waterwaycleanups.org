# S3 bucket for sesv2-admin application hosting
resource "aws_s3_bucket" "sesv2_admin_bucket" {
  bucket = "waterwaycleanups-sesv2-admin"

  tags = {
    Name        = "Waterway Cleanups SESv2 Admin Interface"
    Environment = "Production"
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

# S3 bucket policy for sesv2-admin bucket to allow CloudFront access
resource "aws_s3_bucket_policy" "sesv2_admin_bucket_policy" {
  bucket = aws_s3_bucket.sesv2_admin_bucket.id

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
        Resource  = "${aws_s3_bucket.sesv2_admin_bucket.arn}/*"
        Sid       = "AllowCloudFrontServicePrincipal"
      },
    ]
    Version   = "2012-10-17"
  })
}

# Output the sesv2-admin bucket name
output "sesv2_admin_bucket_name" {
  value = aws_s3_bucket.sesv2_admin_bucket.id
  description = "The name of the S3 bucket for sesv2-admin application"
}
