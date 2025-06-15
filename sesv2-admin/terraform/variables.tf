# Variables for SESv2 Admin Terraform configuration

variable "region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "user_pool_name" {
  description = "Name of the Cognito User Pool"
  type        = string
  default     = "ses-admin-user-pool"
}

variable "app_client_name" {
  description = "Name of the Cognito App Client"
  type        = string
  default     = "ses-admin-client"
}

variable "domain_prefix" {
  description = "Prefix for the Cognito hosted UI domain"
  type        = string
  default     = "ses-admin-portal"
}

variable "callback_urls" {
  description = "Callback URLs for the Cognito App Client"
  type        = list(string)
  default     = ["http://localhost:3000/", "https://ses-admin.your-domain.com/"]
}

variable "logout_urls" {
  description = "Logout URLs for the Cognito App Client"
  type        = list(string)
  default     = ["http://localhost:3000/", "https://ses-admin.your-domain.com/"]
}

variable "default_admin_email" {
  description = "Email address for the default admin user"
  type        = string
  default     = "admin@example.com"
}

variable "default_admin_temp_password" {
  description = "Temporary password for the default admin user"
  type        = string
  default     = "ChangeMe123!"
  sensitive   = true
}

# Google SSO variables
variable "google_client_id" {
  description = "Google OAuth Client ID"
  type        = string
  default     = ""  # Set this via environment variable TF_VAR_google_client_id or in terraform.tfvars
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth Client Secret"
  type        = string
  default     = ""  # Set this via environment variable TF_VAR_google_client_secret or in terraform.tfvars
  sensitive   = true
}

variable "google_authorized_domains" {
  description = "List of authorized Google domains for sign-in"
  type        = list(string)
  default     = []  # Example: ["example.com", "mycompany.org"]
}
