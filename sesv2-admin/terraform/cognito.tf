# AWS Cognito configuration for SESv2 Admin Interface
# Including Google SSO integration

resource "aws_cognito_user_pool" "ses_admin_pool" {
  name = var.user_pool_name
  
  # Enable self-registration and account recovery
  username_attributes = ["email"]
  auto_verified_attributes = ["email"]
  
  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
    temporary_password_validity_days = 7  # Match AWS default
  }
  
  # User attributes
  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "email"
    required                 = true
    
    string_attribute_constraints {
      min_length = 5
      max_length = 100
    }
  }
  
  # Include department schema attributes to match AWS configuration
  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "department"
    required                 = false
    
    string_attribute_constraints {
      min_length = 1
      max_length = 100
    }
  }
  
  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "custom:department"
    required                 = false
    
    string_attribute_constraints {
      min_length = 1
      max_length = 100
    }
  }
  
  # Email settings
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }
  
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

# App client for web authentication - IMPORTANT: This resource is created and imported
# This configuration exactly matches the AWS resource to prevent Terraform from trying to modify it
resource "aws_cognito_user_pool_client" "ses_admin_client" {
  name                = var.app_client_name
  user_pool_id        = aws_cognito_user_pool.ses_admin_pool.id
  
  # Do NOT set generate_secret as it will force replacement
  refresh_token_validity = 30
  # Note: access_token_validity and id_token_validity are omitted as they
  # require values between 5m and 24h, and AWS shows them as 0 in the console
  auth_session_validity = 3  # Match AWS value
  
  # Enable all auth flows for flexibility
  allowed_oauth_flows = ["code", "implicit"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes = ["email", "openid", "profile"]
  
  # Define callback URLs matching exactly what's in AWS
  callback_urls = ["http://localhost:3000", "https://ses-admin.waterwaycleanups.org/"]
  logout_urls   = ["http://localhost:3000", "https://ses-admin.waterwaycleanups.org/"]
  
  supported_identity_providers = ["COGNITO", "Google"]
  
  # Match exact flows configured in AWS
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH", 
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]
  
  # These fields match AWS defaults
  enable_token_revocation = true
  enable_propagate_additional_user_context_data = false
  read_attributes = []
  write_attributes = []
}

# Google integration as an identity provider
resource "aws_cognito_identity_provider" "google_provider" {
  user_pool_id  = aws_cognito_user_pool.ses_admin_pool.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "profile email openid https://www.googleapis.com/auth/user.organization.read"
    
    # Google OAuth endpoints - should not need to be changed
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    "email"       = "email"
    "username"    = "sub"
    "given_name"  = "given_name"
    "family_name" = "family_name"
    "picture"     = "picture"
    "custom:department" = "organizations[0].department"
  }
}

# User Pool Domain for hosted UI
resource "aws_cognito_user_pool_domain" "ses_admin_domain" {
  domain       = var.domain_prefix  # This creates a Cognito domain: https://ses-admin-portal.auth.[region].amazoncognito.com
  user_pool_id = aws_cognito_user_pool.ses_admin_pool.id
}

# Create an admin user
resource "null_resource" "create_admin_user" {
  depends_on = [aws_cognito_user_pool.ses_admin_pool]
  
  # This will create a default admin user - for production, use a more secure approach
  provisioner "local-exec" {
    command = <<EOT
      aws cognito-idp admin-create-user \
        --user-pool-id ${aws_cognito_user_pool.ses_admin_pool.id} \
        --username ${var.default_admin_email} \
        --user-attributes Name=email,Value=${var.default_admin_email} Name=email_verified,Value=true \
        --temporary-password "${var.default_admin_temp_password}" \
        --message-action SUPPRESS \
        --region us-east-1
    EOT
  }
}

# Outputs
output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.ses_admin_pool.id
}

output "cognito_app_client_id" {
  description = "ID of the Cognito App Client"
  value       = aws_cognito_user_pool_client.ses_admin_client.id
}

output "cognito_domain" {
  description = "Cognito Domain for hosted UI"
  value       = "https://${aws_cognito_user_pool_domain.ses_admin_domain.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

# Get current AWS region
data "aws_region" "current" {}
