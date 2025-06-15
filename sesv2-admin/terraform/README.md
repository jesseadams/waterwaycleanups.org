# SESv2 Admin AWS Infrastructure

This Terraform configuration creates the AWS infrastructure required for the SESv2 Admin application.

## Remote State Management

This project uses Terraform remote state management with:
- **S3 Bucket** for storing the Terraform state files securely
- **DynamoDB Table** for state locking to prevent concurrent modifications

The remote state resources are defined in the main project's `terraform/state_resources.tf`, and the backend configuration for this module is in `backend.tf`.

The state for this module is stored in the same S3 bucket as the main project but with a different state file key: `waterwaycleanups/sesv2-admin/terraform.tfstate`.

## Deployment Instructions

### First-time Deployment

The remote state infrastructure should already be provisioned by the main project's terraform deployment. You can simply initialize and apply:

1. Navigate to the sesv2-admin terraform directory:
   ```bash
   cd sesv2-admin/terraform
   ```

2. Initialize Terraform with remote backend:
   ```bash
   terraform init
   ```

3. Review the planned changes:
   ```bash
   terraform plan
   ```

4. Apply the configuration:
   ```bash
   terraform apply
   ```

## Infrastructure Components

This configuration creates the following resources:
- Cognito User Pool and Identity Pool for authentication
- S3 bucket for application files
- IAM roles and policies for secure access

## CI/CD Integration

This module is integrated with GitHub Actions for continuous deployment:
- Changes to files in the `sesv2-admin/` directory trigger the deployment workflow
- Terraform is automatically initialized with the S3 backend
- The GitHub workflow applies any infrastructure changes
- The application is built and deployed to S3

## Customization

Configuration can be customized through the `variables.tf` file or by creating a `terraform.tfvars` file.
