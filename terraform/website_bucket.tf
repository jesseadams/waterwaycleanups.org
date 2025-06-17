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
