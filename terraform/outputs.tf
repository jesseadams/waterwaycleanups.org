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

# CloudFront distribution ID outputs have been moved to separate_distributions.tf
