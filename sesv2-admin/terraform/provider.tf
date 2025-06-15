# Configure AWS provider
provider "aws" {
  region = "us-east-1"  # Change to your preferred AWS region
  
  # Authentication can be provided via the following:
  # 1. Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
  # 2. Shared credentials file (~/.aws/credentials)
  # 3. EC2 instance profile
  
  # For more advanced authentication options, uncomment and configure:
  # profile = "default"  # AWS CLI profile to use
  # assume_role {
  #   role_arn     = "arn:aws:iam::123456789012:role/terraform-role"
  #   session_name = "terraform-session"
  # }
  
  # If you need to specify API versions:
  # version = "~> 4.0"
}

# Configure terraform backend (optional)
# This allows storing terraform state in S3 with locking via DynamoDB
# terraform {
#   backend "s3" {
#     bucket         = "my-terraform-state-bucket"
#     key            = "sesv2-admin/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "terraform-locks"
#     encrypt        = true
#   }
# }

# Define terraform settings
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"  # Specify the version constraint for the AWS provider
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"  # Specify the version for the null provider (used for local-exec)
    }
  }
  
  required_version = ">= 1.0.0"  # Minimum required Terraform version
}

# Optional: Configure terraform variables (could also be in variables.tf)
variable "app_name" {
  description = "Name of the application"
  default     = "sesv2-admin"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  default     = "dev"
  type        = string
}
