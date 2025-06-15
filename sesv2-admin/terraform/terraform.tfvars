# Example Terraform variables - copy to terraform.tfvars and customize
# DO NOT commit terraform.tfvars to source control as it may contain sensitive information

# AWS Region
region = "us-east-1"

# Cognito User Pool Configuration
user_pool_name = "ses-admin-user-pool"
app_client_name = "ses-admin-client"
domain_prefix = "ses-admin-portal"

# Application URLs
callback_urls = ["http://localhost:3000", "https://ses-admin.waterwaycleanups.org/"]
logout_urls = ["http://localhost:3000", "https://ses-admin.waterwaycleanups.org/"]

# Admin User
default_admin_email = "jesse@waterwaycleanups.org"
default_admin_temp_password = "ChangeMe123!"  # Change this in your actual tfvars file

# Google SSO Configuration
# Get these values from Google Cloud Console -> APIs & Services -> Credentials
google_client_id = "141168471836-ng9o970t06p0sfjehc1fap1dk31hqjo1.apps.googleusercontent.com"
google_client_secret = "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"

# Optional: Restrict to specific Google Workspace domains
google_authorized_domains = ["waterwaycleanups.org"]
