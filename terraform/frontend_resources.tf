# Additional resources for the frontend infrastructure

# S3 bucket versioning (extracted from main bucket resource to follow current Terraform best practices)
resource "aws_s3_bucket_versioning" "website_bucket_versioning" {
  bucket = aws_s3_bucket.website_bucket.id
  
  versioning_configuration {
    status = "Disabled"
  }
}

# S3 bucket policy (extracted from main bucket resource to follow current Terraform best practices)
resource "aws_s3_bucket_policy" "website_bucket_policy" {
  bucket = aws_s3_bucket.website_bucket.id
  
  policy = jsonencode({
    Id        = "PolicyForCloudFrontPrivateContent"
    Statement = [
      {
        Action    = "s3:GetObject"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = "arn:aws:cloudfront::767072126027:distribution/E29TF2NHYH1VYQ"
          }
        }
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Resource  = "arn:aws:s3:::waterwaycleanups.org/*"
        Sid       = "AllowCloudFrontServicePrincipal"
      },
    ]
    Version   = "2008-10-17"
  })
}