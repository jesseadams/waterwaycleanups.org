# S3 Bucket Setup for Image Uploads

This guide explains how the S3 bucket for uploading images is set up and managed via Terraform.

## Terraform-Managed Bucket

The S3 bucket `waterway-cleanups-newsletter-photos` is created and configured via Terraform in the `sesv2-admin/terraform/s3.tf` file. To deploy the bucket:

1. Navigate to the `sesv2-admin/terraform` directory
2. Run `terraform init` (if you haven't already)
3. Run `terraform apply`
4. Confirm the changes

The Terraform configuration automatically sets up:
- The bucket with the proper name
- Public read access for objects
- CORS configuration for web uploads
- Required IAM policies and permissions

## Terraform Configuration Details

The S3 bucket is configured with the following settings in the Terraform code:

### CORS Configuration

The following CORS configuration is automatically applied:

```json
{
  "cors_rule": {
    "allowed_headers": ["*"],
    "allowed_methods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "allowed_origins": ["*"],
    "expose_headers": [],
    "max_age_seconds": 3000
  }
}
```

### Bucket Policy

The bucket is configured with a policy to allow public read access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::waterway-cleanups-newsletter-photos/*"
    }
  ]
}
```

### IAM Permissions

The Terraform configuration creates an IAM policy that grants the Lambda role the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::waterway-cleanups-newsletter-photos",
        "arn:aws:s3:::waterway-cleanups-newsletter-photos/*"
      ]
    }
  ]
}
```

## Environment Variables

Ensure the following environment variables are set in your `.env` file:

```
# S3 Configuration 
REACT_APP_S3_BUCKET=waterway-cleanups-newsletter-photos
REACT_APP_S3_REGION=us-east-1
REACT_APP_S3_PREFIX=email-images/

# AWS Region
REACT_APP_AWS_REGION=us-east-1

# Cognito Configuration
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_xxxxxx
REACT_APP_COGNITO_APP_CLIENT_ID=xxxxxxxxxx
REACT_APP_COGNITO_DOMAIN=example.auth.us-east-1.amazoncognito.com
REACT_APP_COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Redirect URL for authentication
REACT_APP_REDIRECT_URL=http://localhost:3000
```

The actual values should be obtained from your AWS Console or through the Terraform outputs after deployment.

## Testing the Setup

1. Start the application
2. Go to the Templates section
3. Create or edit a template
4. Switch to the visual editor mode
5. Click the image icon
6. Upload an image
7. Verify the image is inserted into the template editor

## Authentication

The application uses Cognito authentication to access AWS services:

1. **No Access Keys** - The application never uses AWS access keys directly
2. **Cognito Identity Pool** - All AWS service access is done through Cognito Identity Pool credentials
3. **Temporary Credentials** - The application receives temporary, scoped credentials upon authentication
4. **Required Authentication** - Users must sign in to upload images or access SES features

## Troubleshooting

If you encounter issues with image uploads:

1. Check authentication status - make sure you're signed in with a user that has the correct IAM role assignment
2. Verify CORS settings - incorrect CORS settings can prevent uploads
3. Check browser console for errors - this can provide more details about what's failing
4. Ensure environment variables are loaded correctly - restart your development server after changing them
