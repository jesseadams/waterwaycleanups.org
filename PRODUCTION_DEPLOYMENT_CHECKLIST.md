# Production Deployment Checklist

## Pre-Deployment Verification

### 1. Environment Configuration

- [ ] **Environment Variables**
  - [ ] `.env` file configured with production values
  - [ ] `STRIPE_SECRET_KEY` set to live key (starts with `sk_live_`)
  - [ ] AWS credentials configured for production
  - [ ] All API URLs point to production endpoints

- [ ] **Hugo Configuration** (`config.yaml`)
  - [ ] `baseURL` set to `https://waterwaycleanups.org/`
  - [ ] `stripe_publishable_key` using live key (`pk_live_...`)
  - [ ] API URLs configured for production:
    - `base_url`: Production API Gateway URL
    - `base_url_volunteer`: Production volunteer API URL
    - `events_api_url`: Production events API URL

### 2. Infrastructure (Terraform)

- [ ] **DynamoDB Tables** (Production)
  - [ ] `events` table exists and accessible
  - [ ] `volunteers` table exists and accessible
  - [ ] `rsvps` table exists and accessible
  - [ ] `minors` table exists and accessible
  - [ ] `user_sessions` table exists and accessible
  - [ ] `waivers` table exists and accessible
  - [ ] `validation_codes` table exists and accessible

- [ ] **API Gateway**
  - [ ] All Lambda functions deployed to production
  - [ ] API Gateway endpoints configured
  - [ ] CORS settings properly configured
  - [ ] Rate limiting configured
  - [ ] Custom domain configured (if applicable)

- [ ] **CloudFront & S3**
  - [ ] S3 bucket for static hosting configured
  - [ ] CloudFront distribution created
  - [ ] SSL certificate configured
  - [ ] Cache invalidation strategy in place

- [ ] **IAM Permissions**
  - [ ] Lambda execution roles have correct permissions
  - [ ] DynamoDB access policies configured
  - [ ] SES permissions for email sending
  - [ ] S3 bucket policies configured

### 3. Data Migration

- [ ] **Staging to Production Migration**
  - [ ] Run migration dry-run: `npm run migrate:prod:dry-run`
  - [ ] Review migration plan
  - [ ] Execute migration: `npm run migrate:prod`
  - [ ] Validate migration: `npm run migrate:validate:prod`
  - [ ] Verify data integrity

- [ ] **Hugo Content Generation**
  - [ ] Generate Hugo files from database: `npm run generate-hugo:prod`
  - [ ] Verify event markdown files created in `content/en/events/`
  - [ ] Check frontmatter is correct
  - [ ] Ensure all active events are included

### 4. Build & Assets

- [ ] **Frontend Assets**
  - [ ] Run production build: `npm run build:prod`
  - [ ] Verify CSS compiled correctly (`static/css/tailwind-output.css`)
  - [ ] Verify JavaScript bundles created
  - [ ] Check React components built properly

- [ ] **Merchandise System**
  - [ ] Products synced to Stripe: `npm run sync-products`
  - [ ] Merchandise app built: `npm run build:merch`
  - [ ] Product data file exists: `public/data/products.json`
  - [ ] Test Stripe checkout flow

- [ ] **Hugo Site**
  - [ ] Site builds without errors
  - [ ] All pages render correctly
  - [ ] Images load properly
  - [ ] Links work correctly

### 5. Testing

- [ ] **Functional Testing**
  - [ ] Homepage loads correctly
  - [ ] Events page displays all events
  - [ ] Individual event pages work
  - [ ] Contact form submits
  - [ ] Merchandise page loads
  - [ ] Stripe checkout works

- [ ] **Authentication & Authorization**
  - [ ] Phone authentication works
  - [ ] Session management works
  - [ ] User dashboard accessible
  - [ ] Protected routes require authentication

- [ ] **RSVP System**
  - [ ] Can submit RSVP for events
  - [ ] Can view RSVPs in dashboard
  - [ ] Can cancel RSVPs
  - [ ] Multi-person RSVPs work
  - [ ] Minor RSVPs work

- [ ] **Waiver System**
  - [ ] Can submit waiver
  - [ ] Waiver status checked correctly
  - [ ] Minors covered by guardian waiver

- [ ] **Minors Management**
  - [ ] Can add minors
  - [ ] Can edit minor information
  - [ ] Can delete minors
  - [ ] Age validation works (under 18)

- [ ] **End-to-End Tests**
  - [ ] Run Playwright tests: `npm run test:e2e`
  - [ ] All critical paths pass
  - [ ] No console errors

### 6. Performance & Optimization

- [ ] **Asset Optimization**
  - [ ] Images optimized and compressed
  - [ ] CSS minified
  - [ ] JavaScript minified
  - [ ] Unused code removed

- [ ] **Caching**
  - [ ] CloudFront cache settings configured
  - [ ] Browser caching headers set
  - [ ] API responses cached where appropriate

- [ ] **Load Testing**
  - [ ] Test with expected traffic load
  - [ ] Verify DynamoDB can handle load
  - [ ] Check Lambda concurrency limits

### 7. Security

- [ ] **SSL/TLS**
  - [ ] HTTPS enforced
  - [ ] Valid SSL certificate
  - [ ] HTTP redirects to HTTPS

- [ ] **API Security**
  - [ ] Authentication required for protected endpoints
  - [ ] Session tokens validated
  - [ ] CORS properly configured
  - [ ] Rate limiting enabled
  - [ ] Input validation in place

- [ ] **Data Protection**
  - [ ] PII handled securely
  - [ ] DynamoDB encryption at rest enabled
  - [ ] Sensitive data not logged
  - [ ] Backup strategy in place

- [ ] **Secrets Management**
  - [ ] No secrets in code
  - [ ] Environment variables secured
  - [ ] AWS credentials rotated
  - [ ] Stripe keys secured

### 8. Monitoring & Logging

- [ ] **CloudWatch**
  - [ ] Lambda function logs enabled
  - [ ] API Gateway logs enabled
  - [ ] DynamoDB metrics monitored
  - [ ] Alarms configured for errors

- [ ] **Error Tracking**
  - [ ] Error logging configured
  - [ ] Alert notifications set up
  - [ ] Error reporting dashboard

- [ ] **Analytics**
  - [ ] Google Analytics configured (if used)
  - [ ] Event tracking set up
  - [ ] Conversion tracking enabled

### 9. Backup & Recovery

- [ ] **Database Backups**
  - [ ] DynamoDB point-in-time recovery enabled
  - [ ] Backup schedule configured
  - [ ] Restore procedure documented

- [ ] **Code Backups**
  - [ ] Git repository backed up
  - [ ] Production branch protected
  - [ ] Deployment history tracked

- [ ] **Rollback Plan**
  - [ ] Previous version tagged
  - [ ] Rollback procedure documented
  - [ ] Database rollback strategy

### 10. Documentation

- [ ] **Deployment Documentation**
  - [ ] Deployment steps documented
  - [ ] Environment setup documented
  - [ ] Troubleshooting guide created

- [ ] **API Documentation**
  - [ ] API endpoints documented
  - [ ] Authentication flow documented
  - [ ] Error codes documented

- [ ] **User Documentation**
  - [ ] User guide updated
  - [ ] FAQ updated
  - [ ] Help content reviewed

## Deployment Steps

### Step 1: Final Staging Verification
```bash
# Validate staging environment
npm run validate:deployment

# Run full test suite
npm run test:e2e

# Check migration status
npm run migrate:status
```

### Step 2: Infrastructure Deployment
```bash
cd terraform

# Review production plan
terraform workspace select prod
terraform plan -out=prod.tfplan

# Apply infrastructure changes
terraform apply prod.tfplan
```

### Step 3: Data Migration
```bash
# Dry run first
npm run migrate:prod:dry-run

# Review output, then execute
npm run migrate:prod

# Validate migration
npm run migrate:validate:prod
```

### Step 4: Generate Hugo Content
```bash
# Generate event pages from database
npm run generate-hugo:prod

# Verify files created
ls -la content/en/events/
```

### Step 5: Build Production Assets
```bash
# Build with production environment
npm run build:prod

# Verify build output
ls -la public/
```

### Step 6: Deploy to Hosting
```bash
# Deploy to S3 (example)
aws s3 sync public/ s3://waterwaycleanups.org/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### Step 7: Post-Deployment Validation
```bash
# Validate production deployment
npm run validate:deployment:prod

# Check all systems
curl https://waterwaycleanups.org/
curl https://api.waterwaycleanups.org/health
```

### Step 8: Smoke Testing
- [ ] Visit homepage
- [ ] Check events page
- [ ] Test RSVP flow
- [ ] Test authentication
- [ ] Test merchandise checkout
- [ ] Verify user dashboard

## Post-Deployment

### Immediate Actions
- [ ] Monitor CloudWatch logs for errors
- [ ] Check error rates in API Gateway
- [ ] Verify DynamoDB metrics
- [ ] Test critical user flows
- [ ] Announce deployment to team

### First 24 Hours
- [ ] Monitor user feedback
- [ ] Watch for error spikes
- [ ] Check performance metrics
- [ ] Verify email delivery
- [ ] Monitor Stripe transactions

### First Week
- [ ] Review analytics data
- [ ] Check for any issues
- [ ] Gather user feedback
- [ ] Optimize based on metrics
- [ ] Document any issues

## Rollback Procedure

If critical issues occur:

1. **Immediate Rollback**
   ```bash
   # Revert to previous S3 version
   aws s3 sync s3://waterwaycleanups.org-backup/ s3://waterwaycleanups.org/
   
   # Invalidate CloudFront
   aws cloudfront create-invalidation --distribution-id ID --paths "/*"
   ```

2. **Database Rollback** (if needed)
   ```bash
   # Use DynamoDB point-in-time recovery
   # Follow AWS documentation for restore
   ```

3. **Infrastructure Rollback**
   ```bash
   cd terraform
   git checkout previous-version
   terraform apply
   ```

## Validation Commands

```bash
# Validate deployment
npm run validate:deployment:prod

# Check migration status
npm run migrate:status:prod

# Test API endpoints
curl https://api.waterwaycleanups.org/health

# Check database connectivity
npm run migrate:check:prod
```

## Troubleshooting

### Common Issues

**Build Fails**
- Check Node.js version
- Clear `node_modules` and reinstall
- Check for syntax errors
- Review build logs

**API Errors**
- Check Lambda logs in CloudWatch
- Verify IAM permissions
- Check DynamoDB table names
- Verify environment variables

**Database Issues**
- Check table exists
- Verify IAM permissions
- Check AWS credentials
- Review CloudWatch logs

**Asset Loading Issues**
- Check S3 bucket permissions
- Verify CloudFront distribution
- Check CORS settings
- Invalidate cache

## Support Contacts

- AWS Support: [AWS Console](https://console.aws.amazon.com/support/)
- Stripe Support: [Stripe Dashboard](https://dashboard.stripe.com/)
- Hugo Documentation: [gohugo.io](https://gohugo.io/documentation/)

## Notes

- Always test in staging first
- Keep backups of production data
- Document any manual changes
- Update this checklist as needed
- Communicate with team during deployment
