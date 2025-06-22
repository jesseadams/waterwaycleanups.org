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

# S3 bucket policy has been moved to s3_bucket_policies.tf
# This comment is kept to indicate where the resource was originally defined

# Output the sesv2-admin bucket name
output "sesv2_admin_bucket_name" {
  value = aws_s3_bucket.sesv2_admin_bucket.id
  description = "The name of the S3 bucket for sesv2-admin application"
}
