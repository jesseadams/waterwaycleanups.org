# Minors Management System - Deployment Guide

## Overview

This guide walks you through deploying the minors management system that allows volunteers to add minors (children under 18) to their accounts. The guardian's waiver automatically covers all attached minors.

## Prerequisites

- AWS Account with DynamoDB access
- Existing volunteer authentication system
- Node.js and npm installed
- AWS CLI configured (optional)

## Step 1: Create DynamoDB Table

### Option A: Using AWS CLI

```bash
aws dynamodb create-table \
  --table-name minors \
  --attribute-definitions \
    AttributeName=guardian_email,AttributeType=S \
    AttributeName=minor_id,AttributeType=S \
  --key-schema \
    AttributeName=guardian_email,KeyType=HASH \
    AttributeName=minor_id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Option B: Using AWS Console

1. Go to DynamoDB in AWS Console
2. Click "Create table"
3. Set table name: `minors`
4. Partition key: `guardian_email` (String)
5. Sort key: `minor_id` (String)
6. Use default settings (On-demand capacity)
7. Click "Create table"

### Option C: Using Terraform

Add to your Terraform configuration:

```hcl
resource "aws_dynamodb_table" "minors" {
  name           = "minors"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "guardian_email"
  range_key      = "minor_id"

  attribute {
    name = "guardian_email"
    type = "S"
  }

  attribute {
    name = "minor_id"
    type = "S"
  }

  tags = {
    Name        = "Minors Table"
    Environment = "production"
  }
}
```

Then run:
```bash
terraform plan
terraform apply
```

## Step 2: Deploy API Endpoints

### For Netlify Functions

1. Copy API files to your functions directory:
```bash
cp api/minors-*.js netlify/functions/
```

2. Update your `netlify.toml`:
```toml
[build]
  functions = "netlify/functions"

[build.environment]
  MINORS_TABLE_NAME = "minors"
  SESSION_TABLE_NAME = "user_sessions"
  AWS_REGION = "us-east-1"
```

3. Deploy:
```bash
netlify deploy --prod
```

### For AWS Lambda

1. Create Lambda functions for each endpoint:
   - `minors-add`
   - `minors-list`
   - `minors-update`
   - `minors-delete`

2. Set environment variables:
   - `MINORS_TABLE_NAME`: `minors`
   - `SESSION_TABLE_NAME`: `user_sessions`
   - `AWS_REGION`: `us-east-1`

3. Attach IAM role with DynamoDB permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/minors",
        "arn:aws:dynamodb:us-east-1:*:table/user_sessions",
        "arn:aws:dynamodb:us-east-1:*:table/user_sessions/index/*"
      ]
    }
  ]
}
```

4. Configure API Gateway routes:
   - `POST /api/minors-add` → minors-add Lambda
   - `POST /api/minors-list` → minors-list Lambda
   - `POST /api/minors-update` → minors-update Lambda
   - `POST /api/minors-delete` → minors-delete Lambda

### For Vercel

1. Copy API files to `api/` directory (already done)

2. Update `vercel.json`:
```json
{
  "env": {
    "MINORS_TABLE_NAME": "minors",
    "SESSION_TABLE_NAME": "user_sessions",
    "AWS_REGION": "us-east-1"
  }
}
```

3. Deploy:
```bash
vercel --prod
```

## Step 3: Update User Dashboard API

The `api/user-dashboard.js` file has been updated to include minors information. Redeploy this endpoint using your deployment method.

## Step 4: Install Dependencies

Ensure the `uuid` package is installed:

```bash
npm install uuid
```

Update your `package.json` if needed:
```json
{
  "dependencies": {
    "uuid": "^9.0.0",
    "aws-sdk": "^2.1000.0"
  }
}
```

## Step 5: Frontend Integration

### Option A: Using React Component

1. The React component is already created at `static/js/react-components/MinorsManagement.jsx`

2. Import and use in your dashboard:
```jsx
import MinorsManagement from './MinorsManagement';

function UserDashboard() {
  const sessionToken = localStorage.getItem('session_token');
  
  return (
    <div>
      <h1>My Dashboard</h1>
      <MinorsManagement sessionToken={sessionToken} />
    </div>
  );
}
```

3. Build the React components:
```bash
npm run build:assets
```

### Option B: Using Plain HTML/JavaScript

Use the test page as a template:
```bash
cp test-minors-management.html static/dashboard-minors.html
```

Then customize the styling and integrate with your existing dashboard.

## Step 6: Testing

### Local Testing

1. Start your development server:
```bash
npm run dev
```

2. Open the test page:
```
http://localhost:1313/test-minors-management.html
```

3. Test all operations:
   - Add a minor
   - List minors
   - Update minor information
   - Delete a minor

### API Testing with curl

```bash
# Set your session token
SESSION_TOKEN="your-session-token-here"

# Add a minor
curl -X POST http://localhost:8888/api/minors-add \
  -H "Content-Type: application/json" \
  -d '{
    "session_token": "'$SESSION_TOKEN'",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "2010-05-15",
    "email": "john.doe@example.com"
  }'

# List minors
curl -X POST http://localhost:8888/api/minors-list \
  -H "Content-Type: application/json" \
  -d '{
    "session_token": "'$SESSION_TOKEN'"
  }'

# Update a minor
curl -X POST http://localhost:8888/api/minors-update \
  -H "Content-Type: application/json" \
  -d '{
    "session_token": "'$SESSION_TOKEN'",
    "minor_id": "uuid-here",
    "first_name": "Jonathan"
  }'

# Delete a minor
curl -X POST http://localhost:8888/api/minors-delete \
  -H "Content-Type: application/json" \
  -d '{
    "session_token": "'$SESSION_TOKEN'",
    "minor_id": "uuid-here"
  }'
```

## Step 7: Update Documentation

1. Add minors section to your user guide
2. Update waiver language to mention coverage of minors
3. Add FAQ about minors management

## Environment Variables

Ensure these are set in your deployment environment:

```bash
# Required
MINORS_TABLE_NAME=minors
SESSION_TABLE_NAME=user_sessions
AWS_REGION=us-east-1

# Optional (if using different table names)
WAIVER_TABLE_NAME=volunteer_waivers
RSVP_TABLE_NAME=rsvps
EVENTS_TABLE_NAME=events
```

## Security Checklist

- [ ] DynamoDB table created with proper permissions
- [ ] API endpoints require authentication (session token)
- [ ] Session validation is working correctly
- [ ] Minors can only be accessed by their guardian
- [ ] Age validation prevents adults from being added
- [ ] Email validation is working (if provided)
- [ ] CORS headers are properly configured
- [ ] Rate limiting is in place (recommended)
- [ ] Error messages don't leak sensitive information

## Monitoring

### CloudWatch Metrics to Monitor

1. **API Errors**
   - Monitor 4xx and 5xx responses
   - Set alarms for error rate spikes

2. **DynamoDB Metrics**
   - Read/Write capacity (if using provisioned)
   - Throttled requests
   - System errors

3. **Lambda Metrics** (if using Lambda)
   - Invocation count
   - Error count
   - Duration

### Logging

Enable CloudWatch Logs for:
- API endpoint invocations
- DynamoDB operations
- Authentication failures
- Validation errors

## Troubleshooting

### Common Issues

**Issue: "Session token is required" error**
- Solution: Ensure session token is being passed in request body
- Check: `localStorage.getItem('session_token')` returns a value

**Issue: "Invalid or expired session" error**
- Solution: User needs to log in again
- Check: Session hasn't expired (default 24 hours)

**Issue: "Minor not found" error**
- Solution: Verify minor_id is correct
- Check: Minor belongs to the authenticated guardian

**Issue: "Only minors (under 18 years old) can be added"**
- Solution: Check date of birth calculation
- Verify: Date format is YYYY-MM-DD

**Issue: DynamoDB access denied**
- Solution: Check IAM permissions
- Verify: Lambda/Function has correct role attached

## Rollback Plan

If issues occur after deployment:

1. **Disable new endpoints** (if using API Gateway):
```bash
aws apigateway update-stage \
  --rest-api-id YOUR_API_ID \
  --stage-name prod \
  --patch-operations op=replace,path=/deploymentId,value=PREVIOUS_DEPLOYMENT_ID
```

2. **Revert code changes**:
```bash
git revert HEAD
git push origin main
```

3. **Keep DynamoDB table** - data is safe and can be used when fixed

## Next Steps

1. Add minors section to user dashboard UI
2. Update waiver form to show covered minors
3. Add event RSVP for specific minors
4. Implement minor attendance tracking
5. Add emergency contact information
6. Consider adding medical information fields

## Support

For issues or questions:
- Check logs in CloudWatch
- Review API responses for error messages
- Consult `docs/minors-management.md` for API details
- Test with `test-minors-management.html`

## Additional Resources

- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [Lambda Function Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [API Gateway CORS Configuration](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html)
