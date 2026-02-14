# Workspace-based configuration
# Use `terraform workspace select staging` or `terraform workspace select production`

locals {
  # Workspace name (default, staging, or production)
  workspace = terraform.workspace

  # Environment-specific configuration
  # Note: Only "production" workspace deploys to prod. "default" workspace should not be used.
  is_production = local.workspace == "production"
  is_staging    = local.workspace == "staging" || local.workspace == "default"

  # Resource name suffix - append to AWS resource names to avoid conflicts
  # Production has no suffix to maintain compatibility with existing resources
  # Other workspaces get their name as suffix
  resource_suffix = local.is_production ? "" : (local.workspace == "default" ? "-staging" : "-${local.workspace}")

  # DynamoDB table suffix - always includes workspace name for consistency
  # This allows production and staging tables to coexist
  dynamodb_suffix = local.workspace == "default" ? "-staging" : "-${local.workspace}"

  # Bucket names
  bucket_name = local.is_production ? "waterwaycleanups.org" : "staging.waterwaycleanups.org"

  # Domain configuration
  domain_name = local.is_production ? "waterwaycleanups.org" : "staging.waterwaycleanups.org"

  # CloudFront aliases - production gets www and mta-sts, staging just gets subdomain
  cloudfront_aliases = local.is_production ? [
    "waterwaycleanups.org",
    "www.waterwaycleanups.org",
    "mta-sts.waterwaycleanups.org"
  ] : ["staging.waterwaycleanups.org"]

  # ACM certificate ARN - production uses existing cert, staging needs its own or uses CloudFront default
  # You'll need to create a certificate for staging.waterwaycleanups.org or use CloudFront default
  acm_certificate_arn = "arn:aws:acm:us-east-1:767072126027:certificate/98ff48eb-0a07-45a8-8cf3-c6b782f409d9"

  # Use custom certificate or CloudFront default
  use_custom_certificate = local.acm_certificate_arn != ""

  # Resource naming
  environment_name = local.is_production ? "Production" : "Staging"

  # OAC naming
  oac_name = "${local.bucket_name}.s3.${var.aws_region}.amazonaws.com"

  # CloudFront function name - needs suffix to avoid conflicts
  cloudfront_function_name = "directory-index-handler${local.resource_suffix}"

  # WAF - only apply to production
  apply_waf = local.is_production

  # Lifecycle protection - only for production
  prevent_destroy = local.is_production
}
