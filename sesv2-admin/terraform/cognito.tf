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

# App client for web authentication
resource "aws_cognito_user_pool_client" "ses_admin_client" {
  name                = var.app_client_name
  user_pool_id        = aws_cognito_user_pool.ses_admin_pool.id
  
  generate_secret     = false
  refresh_token_validity = 30
  
  # Enable all auth flows for flexibility
  allowed_oauth_flows = ["code", "implicit"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes = ["email", "openid", "profile"]
  
  # Define callback URLs
  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls
  
  supported_identity_providers = ["COGNITO", "Google"]
  
  # Enable standard OAuth2 grants
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]
}

# Google integration as an identity provider
resource "aws_cognito_identity_provider" "google_provider" {
  user_pool_id  = aws_cognito_user_pool.ses_admin_pool.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "profile email openid"
    
    # Google OAuth endpoints - should not need to be changed
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    email    = "email"
    username = "sub"
    given_name = "given_name"
    family_name = "family_name"
    picture = "picture"
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
