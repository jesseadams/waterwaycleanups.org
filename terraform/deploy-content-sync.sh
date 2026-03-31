#!/bin/bash
# Deploy Content Sync Infrastructure
# This script deploys only the content sync components

set -e

echo "🚀 Deploying Content Sync Infrastructure..."
echo ""

# Check if terraform is initialized
if [ ! -d ".terraform" ]; then
  echo "📦 Initializing Terraform..."
  terraform init
  echo ""
fi

# Plan the deployment
echo "📋 Planning deployment..."
terraform plan \
  -target=aws_dynamodb_table.content_edits \
  -target=aws_s3_bucket.content \
  -target=aws_s3_bucket_versioning.content \
  -target=aws_s3_bucket_server_side_encryption_configuration.content \
  -target=aws_s3_bucket_public_access_block.content \
  -target=aws_iam_role.content_sync_lambda_role \
  -target=aws_iam_policy.content_sync_lambda_policy \
  -target=aws_iam_role_policy_attachment.content_sync_lambda_attachment \
  -target=aws_lambda_function.admin_content_sync \
  -target=aws_api_gateway_resource.admin_content_sync \
  -target=aws_api_gateway_method.admin_content_sync_post \
  -target=aws_api_gateway_method.admin_content_sync_options \
  -target=aws_api_gateway_integration.admin_content_sync_integration \
  -target=aws_api_gateway_integration.admin_content_sync_options_integration \
  -target=aws_api_gateway_method_response.admin_content_sync_options_response \
  -target=aws_api_gateway_integration_response.admin_content_sync_options_integration_response \
  -target=aws_lambda_permission.admin_content_sync_api_gateway \
  -target=aws_api_gateway_deployment.volunteer_api_deployment \
  -out=content-sync.tfplan

echo ""
read -p "🤔 Do you want to apply these changes? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "❌ Deployment cancelled"
  rm -f content-sync.tfplan
  exit 0
fi

echo ""
echo "⚙️  Applying changes..."
terraform apply content-sync.tfplan

echo ""
echo "✅ Content Sync Infrastructure deployed successfully!"
echo ""
echo "📊 Outputs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
terraform output content_edits_table_name
terraform output content_bucket_name
terraform output admin_content_sync_function_name
terraform output admin_content_sync_api_endpoint
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next steps:"
echo "1. Update your .env file with the CloudFront Distribution ID:"
echo "   CLOUDFRONT_DISTRIBUTION_ID=\$(terraform output -raw cloudfront_distribution_id)"
echo ""
echo "2. Test the admin interface at: https://waterwaycleanups.org/admin"
echo ""
echo "3. Check CloudWatch logs:"
echo "   aws logs tail /aws/lambda/admin_content_sync --follow"
echo ""

# Clean up plan file
rm -f content-sync.tfplan
