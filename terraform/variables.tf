variable "aws_region" {
  description = "AWS region for deploying resources"
  type        = string
  default     = "us-east-1"
}

variable "ses_contact_list_name" {
  description = "Name of the SES contact list"
  type        = string
  default     = "WaterwayCleanups"
}

variable "ses_topic_name" {
  description = "Name of the topic in SES contact list"
  type        = string
  default     = "volunteer"
}

variable "api_stage_name" {
  description = "Stage name for API Gateway deployment"
  type        = string
  default     = "prod"
}

variable "environment" {
  description = "Deployment environment (e.g., dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "staging_certificate_arn" {
  description = "ACM certificate ARN for staging domain (leave empty to use CloudFront default certificate)"
  type        = string
  default     = ""
}

variable "deploy_staging" {
  description = "Whether to deploy staging infrastructure (used when not using workspaces)"
  type        = bool
  default     = false
}
