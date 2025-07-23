# Multi-Environment Deployment Guide

This document describes the multi-environment deployment setup for the Waterway Cleanups website.

## 🏗️ Architecture Overview

### Environments

- **🔴 Production**: `waterwaycleanups.org` - Live production environment
- **🟡 Staging**: `staging.waterwaycleanups.org` - Pre-production testing and PR previews
- **🟢 Development**: `dev.waterwaycleanups.org` - Development environment  
- **💻 Local**: SAM local development environment

### Technology Stack

- **Frontend**: Hugo static site generator with Tailwind CSS and React components
- **Backend APIs**: AWS Lambda functions with API Gateway
- **Database**: DynamoDB for volunteer waivers and event RSVPs
- **Email**: Amazon SES v2 for contact management
- **CDN**: CloudFront distributions per environment
- **Storage**: S3 buckets for static site hosting
- **Infrastructure**: Terraform with workspace isolation
- **CI/CD**: GitHub Actions with environment-specific deployments

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start full development environment (Hugo + APIs)
npm run dev:full

# Or start components separately:
npm run dev          # Hugo site on http://localhost:1313
npm run api:local    # API Gateway on http://localhost:3000
npm run db:local     # DynamoDB Local on http://localhost:8000
```

**Available locally:**
- Website: http://localhost:1313
- API endpoints: http://localhost:3000/api/
- DynamoDB Admin: http://localhost:8001

### API Endpoints

All environments support these API endpoints:

- `POST /api/submit-volunteer-waiver` - Submit volunteer waiver form
- `POST /api/check-volunteer-waiver` - Check existing waiver status
- `POST /api/submit-event-rsvp` - Submit event RSVP
- `POST /api/check-event-rsvp` - Check RSVP status

## 📦 Deployment Process

### Automatic Deployments

**Production:**
- Triggers: Push to `main` branch
- Environment: `prod`
- URL: https://waterwaycleanups.org
- Terraform workspace: `default`

**Staging:**
- Triggers: Pull requests to `main`, push to `develop` branch
- Environment: `staging` 
- URL: https://staging.waterwaycleanups.org
- Terraform workspace: `staging`
- PR comments include preview links

**Development:**
- Manual deployment via workflow dispatch
- Environment: `dev`
- URL: https://dev.waterwaycleanups.org
- Terraform workspace: `dev`

### Manual Deployment

```bash
# Deploy to staging
gh workflow run "Multi-Environment Deployment" --field environment=staging

# Deploy to production
gh workflow run "Multi-Environment Deployment" --field environment=prod
```

## 🔧 Infrastructure Management

### Terraform Workspaces

Each environment uses isolated Terraform workspaces:

```bash
# Production (uses default workspace)
terraform workspace select default
terraform apply -var-file="environments/prod.tfvars"

# Staging environment
terraform workspace new staging
terraform workspace select staging
terraform apply -var-file="environments/staging.tfvars"

# Development environment  
terraform workspace new dev
terraform workspace select dev
terraform apply -var-file="environments/dev.tfvars"
```

### Environment Variables

Environment-specific configurations are stored in `terraform/environments/`:

- `prod.tfvars` - Production settings
- `staging.tfvars` - Staging settings
- `dev.tfvars` - Development settings

### Resource Isolation

- **Terraform workspaces** provide complete resource isolation
- **Same logical names** for resources across environments (e.g., `volunteer_waivers` table)
- **Environment-specific domains** and S3 bucket names
- **Separate SES contact lists** per environment

## 🔐 Security & Access

### AWS Permissions

- **GitHub Actions** uses OIDC role: `arn:aws:iam::767072126027:role/github-actions-oidc`
- **Environment-specific** IAM policies for Lambda functions
- **Least privilege** access for each environment

### Secrets Management

Required GitHub Secrets:
- AWS OIDC configuration (automatic)
- `SLACK_WEBHOOK_URL` (optional, for notifications)

Environment-specific secrets are managed via GitHub Environment protection rules.

## 📊 Monitoring & Logging

### CloudWatch Integration

- **Lambda logs** automatically sent to CloudWatch
- **Environment-specific** log groups
- **Error tracking** via SNS notifications

### Deployment Status

- **Slack notifications** for production deployments
- **PR comments** with staging preview URLs
- **GitHub Actions** status checks

## 🧪 Testing Strategy

### Local Testing

```bash
# Test APIs locally
npm run api:local

# Test with local DynamoDB
npm run db:local

# Full integration testing
npm run dev:full
```

### Environment Progression

1. **Local Development** - Feature development and testing
2. **Staging** - Integration testing and PR reviews
3. **Production** - Final deployment after staging validation

## 📝 Development Workflow

### Feature Development

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Develop locally
npm run dev:full

# 3. Create PR (auto-deploys to staging)
gh pr create

# 4. Review staging preview
# URL provided in PR comment

# 5. Merge to main (auto-deploys to production)
```

### Environment-Specific Features

- **Base URL** automatically adjusted per environment
- **SES contact lists** separated by environment
- **DynamoDB tables** isolated by Terraform workspace
- **API endpoints** environment-aware

## 🆘 Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Clean and rebuild
npm run clean
npm run build
```

**Local API Issues:**
```bash
# Check SAM CLI installation
sam --version

# Rebuild SAM application
npm run api:build
```

**Terraform State Issues:**
```bash
# Check current workspace
terraform workspace show

# List all workspaces
terraform workspace list
```

### Support Resources

- **Local Development**: Check `scripts/local-dev.sh`
- **Environment Config**: See `terraform/environments/README.md`
- **API Documentation**: Available in `CLAUDE.md`
- **SAM Templates**: Configure in `template.yaml` and `samconfig.toml`

## 🔄 Migration Notes

### From Single Environment

The multi-environment setup preserves all existing production resources:

- ✅ **Production URLs** unchanged
- ✅ **DynamoDB tables** keep same names  
- ✅ **S3 buckets** maintain current naming
- ✅ **CloudFront distributions** preserved
- ✅ **DNS settings** remain the same

### New Environments

Staging and development environments get:

- 🆕 **Separate S3 buckets** (`staging-waterwaycleanups-org`, `dev-waterwaycleanups-org`)
- 🆕 **Isolated DynamoDB tables** (same names, different workspaces)
- 🆕 **Dedicated CloudFront distributions**
- 🆕 **Environment-specific SES contact lists**

**DNS Setup Required:** Add CNAME records for `staging.waterwaycleanups.org` and `dev.waterwaycleanups.org` pointing to their respective CloudFront distributions.