# SESv2 Admin Interface with AWS Amplify Gen 2

This project provides an admin interface for managing Amazon SESv2 (Simple Email Service) resources including contact lists, contacts, templates, and sending emails. Built with AWS Amplify Gen 2 architecture.

## Features

- **Contact Management**: View, create, edit, and delete contact lists and contacts
- **Template Management**: Create, view, and delete email templates
- **Email Sending**: Send emails using templates or custom content to selected contacts
- **Authentication**: Secure access through Amazon Cognito with Google SSO support

## Technology Stack

- React with TypeScript
- AWS SDK for JavaScript v3
- AWS Amplify Gen 2 for authentication and AWS resource access
- React Router for navigation
- Tailwind CSS for styling
- Terraform for infrastructure-as-code

## Prerequisites

- Node.js and npm installed
- AWS account with SESv2 and Cognito configured
- Google Developer Console project for SSO integration
- Terraform installed (for infrastructure deployment)

## Google SSO Setup

1. Go to the [Google Developer Console](https://console.developers.google.com/)
2. Create a new project or select an existing one
3. Navigate to "Credentials" and create an OAuth 2.0 Client ID
4. Set up the OAuth consent screen with necessary information
5. Add authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://ses-admin-portal.auth.[your-region].amazoncognito.com`
6. Add authorized redirect URIs:
   - `http://localhost:3000/`
   - `https://ses-admin-portal.auth.[your-region].amazoncognito.com/oauth2/idpresponse`
7. Note your Client ID and Client Secret for the next step

## AWS Infrastructure Deployment

1. Update the Terraform variables with your Google Client ID and Secret:
   ```bash
   cd sesv2-admin/terraform
   ```
   
   Edit the `cognito.tf` file and replace:
   ```
   client_id        = "YOUR_GOOGLE_CLIENT_ID"     # Replace with your actual Google OAuth client ID
   client_secret    = "YOUR_GOOGLE_CLIENT_SECRET" # Replace with your actual Google OAuth client secret
   ```

2. Initialize and apply Terraform configuration:
   ```bash
   terraform init
   terraform apply
   ```

3. After successful deployment, note the outputs:
   - `cognito_user_pool_id`
   - `cognito_app_client_id`
   - `cognito_domain`

4. Update the React application configuration in `src/aws-config.ts` with the Cognito details

## React Application Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables:
   ```
   cp .env.example .env
   ```
   
3. Edit the `.env` file with your Cognito information from the Terraform outputs:
   ```
   # Cognito information from the Terraform outputs (required)
   REACT_APP_COGNITO_USER_POOL_ID=your_user_pool_id
   REACT_APP_COGNITO_APP_CLIENT_ID=your_app_client_id
   REACT_APP_COGNITO_DOMAIN=your_domain.auth.region.amazoncognito.com
   ```

   > **NOTE**: The application uses AWS Amplify Gen 2 to obtain credentials automatically from the authenticated user's session. Local AWS credentials are only needed as a fallback for development.

4. Start the development server:
   ```
   npm start
   ```

5. Open your browser to http://localhost:3000 and log in using:
   - Google SSO (if enabled in Terraform)
   - The default admin user credentials created by Terraform

## Folder Structure

```
sesv2-admin/
├── src/                  # React application source code
│   ├── components/       # React components
│   │   ├── auth/         # Authentication components
│   │   ├── contacts/     # Contact management components
│   │   ├── templates/    # Email template components
│   │   └── emails/       # Email sending components
│   ├── utils/            # Utility functions
│   │   └── sesv2.ts      # AWS SESv2 API wrapper
│   ├── aws-config.ts     # AWS configuration
│   └── index.tsx         # Entry point
└── terraform/            # Infrastructure as code
    └── cognito.tf        # Cognito user pool with Google SSO
```

## Authentication Options

The application supports multiple authentication methods:

1. **Google SSO**: Users can sign in with their Google accounts
2. **Username/Password**: Traditional Cognito user pool authentication
3. **Custom Admin User**: An admin user is automatically created during infrastructure deployment

## AWS Permissions Required

The application requires AWS permissions for:

- SESv2 API actions:
  - Managing contact lists and contacts
  - Managing email templates
  - Sending emails
- Cognito user pool access

## AWS Credentials Management with Amplify Gen 2

This application follows AWS security best practices for credential management using Amplify Gen 2:

1. **Amplify Auth Credentials**: The application uses Amplify Gen 2's credential management with `fetchAuthSession()` to securely obtain AWS credentials:
   - Primary method: Cognito Identity Pool provides temporary credentials with appropriate IAM roles
   - Fallback for development: Environment variables (`REACT_APP_AWS_ACCESS_KEY_ID`, `REACT_APP_AWS_SECRET_ACCESS_KEY`)
   - Lazy-loading of AWS service clients to ensure credentials are properly initialized

2. **No hardcoded credentials**: The application never stores access keys or secrets directly in code.

3. **Least privilege principles**: Configure IAM roles with only the permissions required:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:ListContacts",
        "ses:CreateContact",
        "ses:GetContact",
        "ses:DeleteContact",
        "ses:UpdateContact",
        "ses:ListContactLists",
        "ses:CreateContactList",
        "ses:DeleteContactList",
        "ses:GetContactList",
        "ses:ListEmailTemplates",
        "ses:GetEmailTemplate",
        "ses:CreateEmailTemplate",
        "ses:UpdateEmailTemplate",
        "ses:DeleteEmailTemplate",
        "ses:SendEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

## Notes

- Ensure your AWS region is correctly configured
- Email sending requires verified identities in SES
- Contact lists must be created before adding contacts
- For production use, secure the Google client secret and consider using AWS Secrets Manager
