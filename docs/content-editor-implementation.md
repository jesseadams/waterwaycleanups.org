# Content Editor Implementation Summary

The Content Editor feature allows admins to create and edit cleanup events through the web UI, queue changes, and publish them to the events database which triggers an automatic site rebuild via GitHub Actions.

## What Was Built

### 1. Backend API (`api/admin-content-sync.js`)

Lambda function with 5 actions:
- `save_draft` - Save event as pending edit in `content_edits` table
- `list_edits` - List all pending edits
- `delete_edit` - Remove a pending edit
- `load_event` - Load existing event from `events` table for editing
- `publish` - Write to `events` table and trigger GitHub Actions workflow

### 2. Frontend UI (`layouts/admin/single.html`)

New "Content Editor" tab in admin dashboard with:
- Event creation/editing form (title, description, dates, location, tags, etc.)
- Pending changes table showing all queued edits
- Individual and bulk publish buttons
- Real-time status updates

### 3. Infrastructure (`terraform/content_sync.tf`)

Terraform configuration for:
- DynamoDB table (`content_edits`) for pending changes
- Lambda function with proper IAM permissions
- API Gateway endpoint (`/admin-content-sync`)
- GitHub Actions workflow trigger integration

### 4. Deployment Tools

- `terraform/deploy-content-sync.sh` - Targeted deployment script
- `terraform/README-CONTENT-SYNC.md` - Deployment documentation
- Updated `terraform/main.tf` - API Gateway deployment triggers
- Updated `terraform/variables.tf` - GitHub token variables

## How It Works

1. Admin navigates to `/admin` and clicks "Content Editor" tab
2. Creates or edits an event using the form
3. Clicks "Save as Draft" - stored in DynamoDB `content_edits` table
4. Reviews pending changes in the table
5. Clicks "Publish All" or "Publish" on individual items
6. Lambda function:
   - Writes event data to `events` DynamoDB table
   - Triggers GitHub Actions `deploy.yml` workflow
   - Marks edits as published in `content_edits` table
7. GitHub Actions workflow:
   - Runs `scripts/hugo-generator.js` to create markdown from `events` table
   - Builds Hugo site with `hugo --minify`
   - Deploys to S3 and invalidates CloudFront cache

## Architecture Flow

```
Admin UI → content_edits (drafts) → Publish → events table
                                              ↓
                                    GitHub Actions Trigger
                                              ↓
                                    hugo-generator.js
                                              ↓
                                    Markdown Files
                                              ↓
                                    Hugo Build
                                              ↓
                                    S3 + CloudFront
```

## Deployment

### Prerequisites

1. GitHub personal access token with `workflow` scope
2. Existing infrastructure (events table, auth system)

### Deploy

```bash
cd terraform

# Set GitHub token
export TF_VAR_github_token="ghp_your_token_here"

# Deploy
terraform init
terraform apply
```

### Configure

After deployment, the system is ready to use. No additional configuration needed.

## File Structure

```
api/
  admin-content-sync.js          # Lambda handler

layouts/admin/
  single.html                    # Admin dashboard (updated)

terraform/
  content_sync.tf                # Infrastructure definition
  deploy-content-sync.sh         # Deployment script
  README-CONTENT-SYNC.md         # Deployment docs
  main.tf                        # Updated API Gateway deployment
  variables.tf                   # Added GitHub variables

docs/
  content-editor-implementation.md  # This file

.env                             # Updated with GitHub variables
```

## Security

- Admin authentication via session token validation
- Email whitelist for admin access
- GitHub token stored as sensitive Terraform variable
- Token only has `workflow` scope (can't modify code)
- DynamoDB point-in-time recovery enabled

## Advantages of This Approach

1. **Single Source of Truth**: Events table is the authoritative source
2. **Existing Workflow**: Leverages existing `hugo-generator.js` and deployment pipeline
3. **No Direct File Management**: No need to manage markdown files or Git commits
4. **Automatic Builds**: GitHub Actions handles the entire build and deploy process
5. **Rollback Capability**: Can revert events in database and rebuild
6. **Audit Trail**: All changes tracked in `content_edits` with timestamps and user info

## Cost Estimate

~$1-10/month for typical usage:
- DynamoDB on-demand: $1-5
- Lambda: First 1M requests free
- API Gateway: First 1M requests free
- GitHub Actions: 2,000 minutes/month free

## Testing

For local testing without triggering workflows:

1. Set `GITHUB_TOKEN=""` in Lambda environment
2. Lambda will log a warning but continue
3. Manually run `npm run generate-hugo` to test markdown generation
4. Run `hugo server` to preview changes
