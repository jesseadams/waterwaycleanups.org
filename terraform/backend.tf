# Terraform backend configuration
# Using S3 bucket for state storage and DynamoDB for state locking
# State is stored per-workspace: waterwaycleanups/env:/<workspace>/terraform.tfstate

terraform {
  backend "s3" {
    bucket         = "waterwaycleanups-terraform-state"
    key            = "waterwaycleanups/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "waterwaycleanups-terraform-locks"
    encrypt        = true
    # Workspaces will automatically use: waterwaycleanups/env:/<workspace>/terraform.tfstate
  }
}
