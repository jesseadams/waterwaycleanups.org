# Database-Driven Events Deployment Pipeline

This document describes the updated deployment pipeline for the database-driven events system, which integrates Hugo generation with database migrations and infrastructure deployment.

## Overview

The deployment pipeline has been enhanced to support the database-driven events system with the following key features:

1. **Database Table Creation**: Automatically creates DynamoDB tables during infrastructure deployment
2. **Migration Management**: Checks migration status and runs migrations when needed
3. **Hugo Generation**: Generates Hugo markdown files from database events
4. **Deployment Validation**: Validates that the deployment was successful

## Pipeline Components

### 1. Infrastructure Deployment (Terraform)

The Terraform configuration now includes:
- DynamoDB tables for events, volunteers, and RSVPs
- Lambda functions for event management
- API Gateway endpoints
- IAM roles and policies
- SSM parameters for configuration

**Key Files:**
- `terraform/database_driven_events.tf` - Main infrastructure configuration
- `terraform/modules/database-events/` - Reusable database module
- `schemas/*.json` - Database table schemas

### 2. Database Migration Scripts

**Migration Scripts:**
- `scripts/run-full-migration.js` - Complete migration orchestrator
- `scripts/data-migration.js` - Core migration logic
- `scripts/migrate-rsvp-data.js` - RSVP-specific migration
- `scripts/check-migration-needed.js` - Migration status checker
- `scripts/migration-status.js` - Detailed migration status report

**NPM Scripts:**
```bash
npm run migrate                    # Run migration (staging)
npm run migrate:prod              # Run migration (production)
npm run migrate:dry-run           # Preview migration changes
npm run migrate:check             # Check if migration is needed
npm run migrate:status            # Show detailed migration status
```

### 3. Hugo Generation

**Hugo Generator:**
- `scripts/hugo-generator.js` - Generates Hugo markdown from database
- Preserves existing custom shortcodes and content
- Handles event lifecycle (active, completed, archived)
- Maintains chronological sorting

**NPM Scripts:**
```bash
npm run generate-hugo             # Generate Hugo files (staging)
npm run generate-hugo:prod       # Generate Hugo files (production)
npm run generate-hugo:dry-run    # Preview generation
```

### 4. Database-Aware Deployment

**Deployment Script:**
- `scripts/deploy-with-database.js` - Orchestrates complete deployment
- Verifies database tables exist
- Checks migration status
- Runs migrations if needed
- Generates Hugo files
- Validates deployment

**NPM Scripts:**
```bash
npm run deploy:database           # Deploy with database (staging)
npm run deploy:database:prod      # Deploy with database (production)
npm run deploy:database:force     # Force migration
npm run validate:deployment       # Validate deployment success
```

## GitHub Actions Workflow

The updated `.github/workflows/deploy.yml` includes:

### 1. Infrastructure Setup
```yaml
- name: Terraform Apply
  run: terraform apply -auto-approve

- name: Verify database tables exist
  run: # Check terraform outputs for table names
```

### 2. Database Migration
```yaml
- name: Check database migration status
  run: npm run migrate:check

- name: Run database-aware deployment
  run: npm run deploy:database -- --verbose
```

### 3. Hugo Build
```yaml
- name: Build Hugo site
  run: hugo --minify
  # Uses generated markdown files from database
```

### 4. Deployment Validation
```yaml
- name: Validate deployment
  run: npm run validate:deployment -- --verbose
```

## Deployment Process

### Automatic Deployment (CI/CD)

1. **Trigger**: Push to `main` branch or manual workflow dispatch
2. **Infrastructure**: Terraform creates/updates AWS resources
3. **Database Check**: Verify tables exist and are accessible
4. **Migration Check**: Determine if migration is needed
5. **Database Deployment**: Run migration and Hugo generation
6. **Hugo Build**: Build static site with generated content
7. **Deploy**: Upload to S3 and invalidate CloudFront
8. **Validate**: Verify deployment was successful

### Manual Deployment

For manual deployments or troubleshooting:

```bash
# 1. Deploy infrastructure
cd terraform
terraform apply

# 2. Check migration status
npm run migrate:status

# 3. Run migration if needed
npm run migrate

# 4. Generate Hugo files
npm run generate-hugo

# 5. Build and deploy
npm run build
# Deploy to your hosting platform

# 6. Validate deployment
npm run validate:deployment
```

## Environment Configuration

### Staging Environment
- Tables: `events-staging`, `volunteers-staging`, `rsvps-staging`
- API: `https://api-staging.waterwaycleanups.org`
- Commands use default environment (staging)

### Production Environment
- Tables: `events`, `volunteers`, `rsvps`
- API: `https://api.waterwaycleanups.org`
- Commands require `:prod` suffix

## Migration Strategy

### Initial Migration
1. Parse existing event markdown files
2. Create database records with proper structure
3. Migrate existing RSVP data to normalized format
4. Generate Hugo files from database
5. Validate data integrity

### Ongoing Operations
- Hugo files are regenerated from database on each deployment
- New events are created via admin interface (stored in database)
- Existing markdown files are preserved during migration
- Custom shortcodes and content are maintained

## Monitoring and Troubleshooting

### Health Checks
```bash
# Check database connectivity
npm run migrate:status

# Validate deployment
npm run validate:deployment

# Test Hugo generation
npm run generate-hugo:dry-run
```

### Common Issues

**Migration Fails:**
1. Check AWS credentials and permissions
2. Verify database tables exist
3. Check for data conflicts
4. Review migration logs

**Hugo Generation Fails:**
1. Check database connectivity
2. Verify events exist in database
3. Check file system permissions
4. Review generator logs

**Deployment Validation Fails:**
1. Check all components are deployed
2. Verify database accessibility
3. Check Hugo files were generated
4. Review validation output

## Security Considerations

1. **Database Access**: Lambda functions use IAM roles with minimal permissions
2. **API Security**: Admin endpoints require authentication
3. **Data Validation**: All inputs are validated before database operations
4. **Backup**: Point-in-time recovery enabled on all tables

## Performance Optimization

1. **Database**: Global secondary indexes for efficient queries
2. **Hugo Generation**: Only regenerates when events change
3. **Caching**: CloudFront caches static content
4. **API**: Rate limiting and throttling configured

## Future Enhancements

1. **Real-time Updates**: WebSocket support for live event updates
2. **Advanced Analytics**: Enhanced reporting and metrics
3. **Multi-region**: Database replication for global deployment
4. **Automated Testing**: Property-based tests for data integrity

## Support

For issues with the deployment pipeline:

1. Check the GitHub Actions logs
2. Review AWS CloudWatch logs
3. Run validation scripts locally
4. Check the troubleshooting sections above
5. Contact the development team

## Related Documentation

- [Database Schema Documentation](../schemas/README.md)
- [API Documentation](./api-documentation.md)
- [Hugo Generator Documentation](./hugo-generator.md)
- [Migration Guide](./migration-guide.md)