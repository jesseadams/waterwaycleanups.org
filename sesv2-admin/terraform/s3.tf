# S3 bucket for storing email template images
resource "aws_s3_bucket" "email_images" {
  bucket = "waterway-cleanups-newsletter-photos"
  
  tags = {
    Name        = "Waterway Cleanups Newsletter Photos"
    Environment = "Production"
    ManagedBy   = "Terraform"
  }
}

# Enable public access for bucket objects
resource "aws_s3_bucket_public_access_block" "email_images_public_access" {
  bucket = aws_s3_bucket.email_images.id

  # Since we need the images to be publicly accessible in emails
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Bucket ownership controls
resource "aws_s3_bucket_ownership_controls" "email_images_ownership" {
  bucket = aws_s3_bucket.email_images.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# ACL for the bucket - make objects public-read by default
resource "aws_s3_bucket_acl" "email_images_acl" {
  depends_on = [
    aws_s3_bucket_public_access_block.email_images_public_access,
    aws_s3_bucket_ownership_controls.email_images_ownership,
  ]

  bucket = aws_s3_bucket.email_images.id
  acl    = "public-read"
}

# CORS configuration
resource "aws_s3_bucket_cors_configuration" "email_images_cors" {
  bucket = aws_s3_bucket.email_images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = []
    max_age_seconds = 3000
  }
}

# Bucket policy to allow public read access
resource "aws_s3_bucket_policy" "email_images_policy" {
  bucket = aws_s3_bucket.email_images.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.email_images.arn}/*"
      }
    ]
  })
}

# Note: The IAM policy for accessing this bucket is now defined in identity_pool.tf
# as "s3_access_policy" and attached to the authenticated role there.

# Output the S3 bucket information
output "s3_bucket_name" {
  value = aws_s3_bucket.email_images.id
}

output "s3_bucket_regional_domain_name" {
  value = aws_s3_bucket.email_images.bucket_regional_domain_name
}
