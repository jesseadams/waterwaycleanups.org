# Outputs for Database Events Module

output "events_table_name" {
  description = "Name of the Events DynamoDB table"
  value       = aws_dynamodb_table.events.name
}

output "events_table_arn" {
  description = "ARN of the Events DynamoDB table"
  value       = aws_dynamodb_table.events.arn
}

output "volunteers_table_name" {
  description = "Name of the Volunteers DynamoDB table"
  value       = aws_dynamodb_table.volunteers.name
}

output "volunteers_table_arn" {
  description = "ARN of the Volunteers DynamoDB table"
  value       = aws_dynamodb_table.volunteers.arn
}

output "rsvps_table_name" {
  description = "Name of the RSVPs DynamoDB table"
  value       = aws_dynamodb_table.rsvps.name
}

output "rsvps_table_arn" {
  description = "ARN of the RSVPs DynamoDB table"
  value       = aws_dynamodb_table.rsvps.arn
}

output "table_arns" {
  description = "List of all table ARNs for IAM policy creation"
  value = [
    aws_dynamodb_table.events.arn,
    "${aws_dynamodb_table.events.arn}/index/*",
    aws_dynamodb_table.volunteers.arn,
    aws_dynamodb_table.rsvps.arn,
    "${aws_dynamodb_table.rsvps.arn}/index/*"
  ]
}

output "ssm_parameter_names" {
  description = "Names of SSM parameters storing table names"
  value = {
    events_table     = aws_ssm_parameter.events_table_name.name
    volunteers_table = aws_ssm_parameter.volunteers_table_name.name
    rsvps_table      = aws_ssm_parameter.rsvps_table_name.name
  }
}