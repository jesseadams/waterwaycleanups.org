# Multi-Environment Deployment

This project supports multiple deployment environments using Terraform workspaces and environment-specific variable files.

## Environment Structure

- **Production**: `waterwaycleanups.org` - Live production environment
- **Staging**: `staging.waterwaycleanups.org` - Pre-production testing
- **Development**: `dev.waterwaycleanups.org` - Development environment
- **Local**: SAM local development with local API Gateway

## Terraform Workspaces

Each environment uses a separate Terraform workspace for resource isolation:

```bash
# Create and switch to staging workspace
terraform workspace new staging
terraform workspace select staging

# Deploy staging with environment-specific variables
terraform apply -var-file="environments/staging.tfvars"

# Create and switch to dev workspace  
terraform workspace new dev
terraform workspace select dev

# Deploy dev environment
terraform apply -var-file="environments/dev.tfvars"

# Switch back to production (default workspace)
terraform workspace select default
terraform apply -var-file="environments/prod.tfvars"
```

## Resource Naming Strategy

- **Production (default workspace)**: Uses original resource names (e.g., `volunteer_waivers`, `waterwaycleanups.org`)
- **Other environments**: Resources are isolated by workspace, same logical names
- **Domain names**: Environment-specific subdomains (staging.waterwaycleanups.org, dev.waterwaycleanups.org)

## Local Development

Local development uses SAM (Serverless Application Model) for API Gateway and Lambda testing:

```bash
# Start full local development environment
npm run dev:full

# Or start components separately:
npm run dev          # Hugo site on :1313
npm run api:local    # API Gateway on :3000  
npm run db:local     # DynamoDB Local on :8000, Admin on :8001
```

## Environment Variables

Each environment has specific configurations in `environments/`:

- `prod.tfvars` - Production settings
- `staging.tfvars` - Staging settings  
- `dev.tfvars` - Development settings

## Deployment Process

1. **Local Development**: SAM local + Hugo development server
2. **Development**: Deploy to dev environment for integration testing
3. **Staging**: Deploy to staging for pre-production validation
4. **Production**: Deploy to production after staging approval

## DNS Setup Required

For staging and dev environments, you'll need to add DNS records:

- `staging.waterwaycleanups.org` → CloudFront distribution
- `dev.waterwaycleanups.org` → CloudFront distribution

SSL certificates are automatically provisioned by CloudFront for each environment.