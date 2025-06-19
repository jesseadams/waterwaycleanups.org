# Cognito Identity Pool for SES Admin app
# This connects authenticated users to IAM roles for AWS services

# Create an Identity Pool
resource "aws_cognito_identity_pool" "ses_admin_identity_pool" {
  identity_pool_name               = "SES Admin Identity Pool"
  allow_unauthenticated_identities = false
  allow_classic_flow               = false

  # Connect to our User Pool - using hardcoded values to match AWS exactly
  cognito_identity_providers {
    client_id               = "6jta1gje9aigo1v4svcd6f9ft7"
    provider_name           = "cognito-idp.us-east-1.amazonaws.com/us-east-1_bI0nXjMKy"
    server_side_token_check = false
  }
}

# IAM Role for authenticated users
resource "aws_iam_role" "ses_admin_auth_role" {
  name = "ses_admin_authenticated_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.ses_admin_identity_pool.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })
}

# IAM Policy for SES v2 operations
resource "aws_iam_policy" "sesv2_policy" {
  name        = "sesv2_admin_policy"
  description = "Policy for SES v2 operations"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:*",
          "sesv2:*"
        ]
        Resource = "*"
      }
    ]
  })
}

# Separate IAM Policy for S3 access
resource "aws_iam_policy" "s3_access_policy" {
  name        = "ses_admin_s3_access_policy"
  description = "Policy for accessing S3 bucket for email images"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObjectAcl"
        ]
        Resource = [
          "arn:aws:s3:::waterway-cleanups-newsletter-photos",
          "arn:aws:s3:::waterway-cleanups-newsletter-photos/*"
        ]
      }
    ]
  })
}

# Attach the SES and S3 policies to the authenticated role
resource "aws_iam_role_policy_attachment" "sesv2_policy_attachment" {
  role       = aws_iam_role.ses_admin_auth_role.name
  policy_arn = aws_iam_policy.sesv2_policy.arn
}

resource "aws_iam_role_policy_attachment" "s3_policy_attachment" {
  role       = aws_iam_role.ses_admin_auth_role.name
  policy_arn = aws_iam_policy.s3_access_policy.arn
}

# Connect roles to the Identity Pool
resource "aws_cognito_identity_pool_roles_attachment" "identity_pool_role_attach" {
  identity_pool_id = aws_cognito_identity_pool.ses_admin_identity_pool.id
  
  roles = {
    "authenticated" = aws_iam_role.ses_admin_auth_role.arn
  }
}

# Output the Identity Pool ID
output "identity_pool_id" {
  description = "ID of the Cognito Identity Pool"
  value       = aws_cognito_identity_pool.ses_admin_identity_pool.id
}
