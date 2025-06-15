# Volunteer Form AWS Infrastructure

This Terraform configuration creates an AWS API Gateway and Lambda function to handle volunteer form submissions and add contacts to an Amazon SES contact list.

## Prerequisites

1. [AWS CLI](https://aws.amazon.com/cli/) installed and configured with appropriate credentials
2. [Terraform](https://www.terraform.io/downloads.html) installed (v1.0.0 or later)
3. Amazon SES configured in your AWS account
   - SES must be out of sandbox mode or you must verify all recipient email addresses

## Infrastructure Components

This configuration creates the following resources:
- Lambda function to process form submissions
- API Gateway endpoint to accept form submissions
- SES Contact List for storing volunteer information
- IAM roles and permissions for Lambda to access SES
- S3 bucket for storing Terraform state (with versioning and encryption)
- DynamoDB table for Terraform state locking

## Remote State Management

This project uses Terraform remote state management with:
- **S3 Bucket** for storing the Terraform state files securely
- **DynamoDB Table** for state locking to prevent concurrent modifications

The state resources are defined in `state_resources.tf` and the backend configuration is in `backend.tf`.

## Deployment Instructions

### First Deployment (Setting Up Remote State)

On first deployment, you need to create the state management infrastructure:

1. Navigate to the terraform directory:
   ```bash
   cd terraform
   ```

2. Initialize Terraform (without remote backend):
   ```bash
   terraform init -backend=false
   ```

3. Create state resources first:
   ```bash
   terraform apply -auto-approve -target=aws_s3_bucket.terraform_state -target=aws_s3_bucket_versioning.terraform_state_versioning -target=aws_s3_bucket_server_side_encryption_configuration.terraform_state_encryption -target=aws_s3_bucket_public_access_block.terraform_state_public_access_block -target=aws_dynamodb_table.terraform_locks
   ```

4. Initialize Terraform with remote backend:
   ```bash
   terraform init -force-copy
   ```

5. Apply the entire configuration:
   ```bash
   terraform apply
   ```

6. After successful deployment, Terraform will output the API Gateway endpoint URL.

### Subsequent Deployments

For all subsequent deployments (after remote state is set up):

1. Navigate to the terraform directory:
   ```bash
   cd terraform
   ```

2. Initialize Terraform (will use the S3 backend):
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

## Troubleshooting

### CloudWatch Logs IAM Role Issue

If you encounter this error:
```
Error: updating API Gateway Stage: operation error API Gateway: BadRequestException: CloudWatch Logs role ARN must be set in account settings to enable logging
```

This happens because we configured logging but your AWS account doesn't have the CloudWatch Logs role set up. Solutions:

1. **Easiest Solution**: We've fixed this in the latest configuration by disabling CloudWatch logs.

2. **Alternative Solution**: If you want logs enabled:
   - Configure your AWS account with a CloudWatch Logs role. In the AWS Console, go to API Gateway > Settings > CloudWatch log role ARN
   - Select an existing role or create a new one with permissions to write CloudWatch logs
   - Then re-run `terraform apply`

### SES Permission Issues (500 Internal Server Error)

If the form submission fails with a 500 error, there could be issues with SES permissions or configuration:

1. **Verify SES region**:
   - Ensure the AWS region in `variables.tf` is the same as where your SES is verified
   - SES is region-specific; you must use the region where you have verified domains/email addresses

2. **SES verification status**: 
   - If your account is in SES Sandbox mode, you must verify both sender and recipient email addresses
   - Check your SES console to see if your domain is verified

3. **Check Lambda execution role**:
   - Verify the Lambda role has proper SES permissions
   - Our configuration includes a policy with `ses:CreateContact`, `ses:PutContactList`, etc.
   - If running into issues, you may need to add more granular SES permissions

4. **Review CloudWatch logs**:
   - Our Lambda code includes detailed error tracing
   - Check CloudWatch Logs for the specific Lambda function to see detailed error information

## Integrating with the Website

1. In your website's JavaScript, update the API endpoint URL:

   ```javascript
   // Create a script tag to set the API URL globally
   const apiScript = document.createElement('script');
   apiScript.textContent = `window.VOLUNTEER_API_URL = "YOUR_API_GATEWAY_URL";`;
   document.head.appendChild(apiScript);
   ```

   Replace `YOUR_API_GATEWAY_URL` with the value from Terraform's `api_endpoint_url` output.

2. The volunteer form's JavaScript is already configured to use this URL when submitting the form.

## SESv2 Contact List

- The contact list is created with the name "WaterwayCleanups" (configurable via variables)
- The topic name is "volunteer" (configurable via variables) 
- Each contact includes:
  - Email Address
  - First Name (stored as attribute)
  - Last Name (stored as attribute)
  - Subscription status (OPT_IN for the volunteer topic)

**Important Note:** This implementation uses SESv2 (not the older SES API). Make sure your AWS account has access to SESv2 and your permissions include sesv2:* actions.

## Cleaning Up

To remove all created resources:

```bash
terraform destroy
```

## Customization

Edit `variables.tf` to customize:
- AWS region
- SES contact list name
- Topic name
- API stage name
