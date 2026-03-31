# Shared GitHub Token Parameter
# This parameter is shared across all environments (staging and production)
# Only created/updated when github_token variable is set (typically from local workstation)
# In CI/CD, the parameter should already exist and won't be modified

resource "aws_ssm_parameter" "github_token" {
  count = var.github_token != "" ? 1 : 0
  
  name        = "/waterwaycleanups/shared/github_token"
  description = "GitHub Personal Access Token for triggering workflows (shared across environments)"
  type        = "SecureString"
  value       = var.github_token

  tags = {
    Name        = "github-token-shared"
    Environment = "shared"
    Project     = "waterwaycleanups"
  }

  lifecycle {
    ignore_changes = [value]
  }
}

# Data source to read existing parameter (used in CI/CD)
data "aws_ssm_parameter" "github_token" {
  name = "/waterwaycleanups/shared/github_token"
  
  depends_on = [aws_ssm_parameter.github_token]
}

# Output the parameter name for reference
output "github_token_parameter_name" {
  description = "SSM Parameter name for GitHub token"
  value       = data.aws_ssm_parameter.github_token.name
}
