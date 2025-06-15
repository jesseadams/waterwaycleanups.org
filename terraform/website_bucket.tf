# S3 bucket for website hosting
resource "aws_s3_bucket" "website_bucket" {
  bucket = "waterwaycleanups.org"

  tags = {
    Name        = "Waterway Cleanups Website"
    Environment = "Production"
    ManagedBy   = "Terraform"
  }
}
