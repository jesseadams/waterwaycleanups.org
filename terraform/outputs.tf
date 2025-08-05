output "api_endpoint_url" {
  description = "The URL of the API Gateway endpoint"
  value       = "${aws_api_gateway_stage.prod.invoke_url}submit-volunteer"
}

output "aws_region" {
  description = "The AWS region where resources were deployed"
  value       = var.aws_region
}

output "contact_list_name" {
  description = "The name of the SES contact list"
  value       = var.ses_contact_list_name
}

# Website infrastructure outputs
output "website_bucket_id" {
  description = "The ID of the S3 bucket for website hosting"
  value       = aws_s3_bucket.website_bucket.id
}

output "cloudfront_distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.website_distribution.id
}

output "website_url" {
  description = "The URL of the deployed website"
  value       = var.environment == "prod" ? "https://waterwaycleanups.org/" : "https://${var.website_domain}/"
}

output "environment" {
  description = "The deployment environment"
  value       = var.environment
}
