# Additional resources for the frontend infrastructure

# S3 bucket versioning (extracted from main bucket resource to follow current Terraform best practices)
resource "aws_s3_bucket_versioning" "website_bucket_versioning" {
  bucket = aws_s3_bucket.website_bucket.id
  
  versioning_configuration {
    status = "Disabled"
  }
}

# S3 bucket policy has been moved to s3_bucket_policies.tf
# This comment is kept to indicate where the resource was originally defined
