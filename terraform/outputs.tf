output "api_endpoint_url" {
  description = "The URL of the API Gateway endpoint"
  value       = "${aws_api_gateway_stage.prod.invoke_url}submit-volunteer"
}

output "api_base_url" {
  description = "The base URL for the volunteer waiver API Gateway"
  value       = aws_api_gateway_stage.volunteer_waiver_stage.invoke_url
}

output "api_base_url_volunteer" {
  description = "The base URL for the volunteer form API Gateway"
  value       = aws_api_gateway_stage.prod.invoke_url
}

output "events_api_url" {
  description = "The base URL for the Events API Gateway"
  value       = aws_api_gateway_stage.events_api_stage.invoke_url
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
