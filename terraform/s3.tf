# S3 bucket for newsletter image uploads
resource "aws_s3_bucket" "newsletter_photos_bucket" {
  bucket = "waterway-cleanups-newsletter-photos"

  tags = {
    Name        = "Waterway Cleanups Newsletter Photos"
    Environment = "Production"
    ManagedBy   = "Terraform"
  }
}

# Enable server-side encryption for the newsletter photos bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "newsletter_photos_bucket_encryption" {
  bucket = aws_s3_bucket.newsletter_photos_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# S3 bucket versioning for newsletter photos
resource "aws_s3_bucket_versioning" "newsletter_photos_bucket_versioning" {
  bucket = aws_s3_bucket.newsletter_photos_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
}

# CORS configuration for the newsletter photos bucket to allow uploads from the admin interface
resource "aws_s3_bucket_cors_configuration" "newsletter_photos_cors" {
  bucket = aws_s3_bucket.newsletter_photos_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = []
    max_age_seconds = 3000
  }
}

# Public read access policy for the newsletter photos bucket
resource "aws_s3_bucket_policy" "newsletter_photos_bucket_policy" {
  bucket = aws_s3_bucket.newsletter_photos_bucket.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "PublicReadGetObject",
        Effect    = "Allow",
        Principal = "*",
        Action    = "s3:GetObject",
        Resource  = "${aws_s3_bucket.newsletter_photos_bucket.arn}/*"
      }
    ]
  })
}

# Output the newsletter photos bucket name
output "newsletter_photos_bucket_name" {
  value       = aws_s3_bucket.newsletter_photos_bucket.id
  description = "The name of the S3 bucket for newsletter photos"
}
