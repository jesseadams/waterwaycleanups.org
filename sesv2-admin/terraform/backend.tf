# Terraform backend configuration for sesv2-admin
# Using the same S3 bucket and DynamoDB table for locking, but with a different key

terraform {
  backend "s3" {
    bucket         = "waterwaycleanups-terraform-state"
    key            = "waterwaycleanups/sesv2-admin/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "waterwaycleanups-terraform-locks"
    encrypt        = true
  }
}
