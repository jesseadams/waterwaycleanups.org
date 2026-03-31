# Content Sync System Deployment

This document describes the infrastructure for the Content Sync system, which allows admins to create and edit cleanup events through the web UI, queue changes, and publish them to the events database which triggers an automatic site rebuild via GitHub Actions.

## Architecture

### Components

1. **DynamoDB Table** (`content_edits`)
   - Stores pending event edits before publication
   - Partition key: `edit_id`
   - GSI: `status-created_at-index` for querying by status

2. **Lambda Function** (`admin_content_sync`)
   - Handles 5 actions: `save_draft`, `list_edits`, `delete_edit`, `load_event`, `publish`
   - Publishes approved edits to the main `events` DynamoDB table
   - Triggers GitHub Actions workflow to rebuild the site

3. **API Gateway Endpoint** (`/admin-content-sync`)
   - POST endpoint integrated with the main volunteer API
   - CORS enabled for browser access

4. **GitHub Actions Integration**
   - Workflow dispatch triggered after publishing
   - Runs `scripts/hugo-generator.js` to create markdown from database
   - Builds Hugo site and deploys to S3

### Workflow

1. Admin creates/edits event in UI → saved as draft in `content_edits` table
2. Admin reviews pending changes in the queue
3. Admin clicks "Publish" → Lambda writes to `events` table
4. Lambda triggers GitHub Actions `deploy.yml` workflow
5. Workflow runs `hugo-generator.js` to create markdown from `events` table
6. Hugo builds the site
7. Site deployed to S3 with CloudFront invalidation

### Permissions

The Lambda function has permissions to:
- Read/write to `content_edits` DynamoDB table
- Read/write to `events` DynamoDB table
- Query `auth_sessions` table for admin authentication
- Trigger GitHub Actions workflows (via GITHUB_TOKEN)

## Deployment

### Prerequisites

- Terraform >= 1.0
- AWS CLI configured with appropriate credentials
- GitHub personal access token with `workflow` scope
- Existing infrastructure deployed (events table, auth system)

### Setup GitHub Token

You need a GitHub Personal Access Token to trigger workflow dispatches.

#### Fine-Grained Token (Recommended)
1. Go to GitHub Settings → Developer settings → Personal access tokens → **Fine-grained tokens**
2. Click "Generate new token"
3. Configure:
   - **Token name**: `waterwaycleanups-content-sync`
   - **Expiration**: 90 days (or your preference)
   - **Repository access**: Only select repositories → `waterwaycleanups/waterwaycleanups.org`
   - **Permissions**:
     - Repository permissions → **Actions**: `Read and write`
4. Generate token and copy it

#### Classic Token (Alternative)
1. Go to GitHub Settings → Developer settings → Personal access tokens → **Tokens (classic)**
2. Generate new token with **`workflow`** scope
3. Copy the token

#### Security Notes
- Only grant the minimum required permission (`workflow` or `actions:write`)
- Set an expiration date and rotate regularly
- Never commit the token to Git
- Store securely in Terraform variables or secrets manager

### Deploy

```bash
cd terraform

# Set GitHub token (or add to terraform.tfvars)
export TF_VAR_github_token="ghp_your_token_here"

# Initialize Terraform (if not already done)
terraform init

# Review the changes
terraform plan

# Apply the changes
terraform apply
```

### Verify Deployment

```bash
# Check that the table was created
aws dynamodb describe-table --table-name content_edits

# Check that the Lambda function was created
aws lambda get-function --function-name admin_content_sync

# Get the API endpoint
terraform output admin_content_sync_api_endpoint
```

## Environment Variables

The Lambda function uses these environment variables (automatically configured by Terraform):

- `SESSION_TABLE_NAME` - Auth sessions table for admin validation
- `CONTENT_EDITS_TABLE_NAME` - Table storing pending edits
- `EVENTS_TABLE_NAME` - Main events table (source of truth)
- `GITHUB_TOKEN` - GitHub PAT for triggering workflows
- `GITHUB_REPO` - Repository in format `owner/repo`
- `GITHUB_BRANCH` - Branch to trigger workflow on
- `AWS_REGION` - AWS region

## Usage

### Admin Interface

1. Navigate to `/admin` on the website
2. Authenticate with admin credentials
3. Click the "Content Editor" tab
4. Create or edit events using the form
5. Changes are saved as drafts in `content_edits` table
6. Click "Publish All" to:
   - Write events to `events` table
   - Trigger GitHub Actions workflow
   - Rebuild and deploy the site

### API Actions

#### Save Draft
```json
POST /admin-content-sync
{
  "action": "save_draft",
  "session_token": "...",
  "event_data": {
    "title": "Event Title",
    "description": "Event description",
    "start_time": "2026-06-20T09:00:00-04:00",
    "end_time": "2026-06-20T12:00:00-04:00",
    "location_name": "Park Name",
    "location_address": "123 Main St",
    "tags": ["tag1", "tag2"],
    "attendance_cap": 20
  }
}
```

#### List Pending Edits
```json
POST /admin-content-sync
{
  "action": "list_edits",
  "session_token": "...",
  "status": "pending"
}
```

#### Publish Changes
```json
POST /admin-content-sync
{
  "action": "publish",
  "session_token": "...",
  "edit_ids": ["edit_123", "edit_456"]  // Optional, publishes all if omitted
}
```

Response includes workflow trigger status:
```json
{
  "success": true,
  "published": 2,
  "published_events": ["event-id-1", "event-id-2"],
  "workflow": {
    "triggered": true,
    "environment": "staging"
  },
  "message": "Published 2 event(s), site rebuild triggered"
}
```

## Monitoring

### CloudWatch Logs

Lambda logs are available in CloudWatch:
```bash
aws logs tail /aws/lambda/admin_content_sync --follow
```

### GitHub Actions

Monitor workflow runs:
```bash
# Via GitHub CLI
gh run list --workflow=deploy.yml

# Or check the Actions tab in GitHub
https://github.com/waterwaycleanups/waterwaycleanups.org/actions
```

### DynamoDB Metrics

Monitor table operations:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=content_edits \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

## Troubleshooting

### Workflow Not Triggering

If GitHub Actions workflow doesn't trigger:

1. Check GitHub token has `workflow` scope:
   ```bash
   # Test the token
   curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/repos/waterwaycleanups/waterwaycleanups.org
   ```

2. Check Lambda logs for GitHub API errors:
   ```bash
   aws logs tail /aws/lambda/admin_content_sync --follow
   ```

3. Verify workflow file exists and is valid:
   ```bash
   gh workflow list
   ```

### Lambda Timeout

If publishing many events times out, increase the Lambda timeout:
```hcl
resource "aws_lambda_function" "admin_content_sync" {
  timeout = 120  # Increase from 60 to 120 seconds
}
```

### Permission Errors

If Lambda can't access resources, check IAM policy:
```bash
aws iam get-role-policy --role-name content_sync_lambda_role --policy-name content_sync_lambda_policy
```

## Cleanup

To remove all content sync infrastructure:

```bash
cd terraform
terraform destroy -target=aws_lambda_function.admin_content_sync \
                  -target=aws_dynamodb_table.content_edits
```

**Warning:** This will delete all pending edits. Back up data first if needed.

## Security Considerations

1. **Admin Authentication**: Only emails in the admin whitelist can access the content sync API
2. **GitHub Token**: Stored as sensitive variable in Terraform, injected as environment variable
3. **Workflow Scope**: Token only has permission to trigger workflows, not modify code
4. **DynamoDB**: Point-in-time recovery enabled for rollback capability
5. **CORS**: API endpoint has CORS enabled for browser access from the admin UI

## Cost Estimate

Monthly costs (approximate):

- DynamoDB (on-demand): ~$1-5 depending on usage
- Lambda invocations: First 1M requests free, then $0.20 per 1M
- API Gateway: First 1M requests free, then $3.50 per 1M
- GitHub Actions: 2,000 minutes/month free for private repos

Estimated total: **$1-10/month** for typical usage

## Development Workflow

For local testing without triggering workflows:

1. Set `GITHUB_TOKEN=""` in Lambda environment
2. Lambda will log a warning but continue without triggering workflow
3. Manually run `npm run generate-hugo` locally to test markdown generation
4. Run `hugo server` to preview changes
