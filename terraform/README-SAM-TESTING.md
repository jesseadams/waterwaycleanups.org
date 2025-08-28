# Testing Scheduled Newsletters Lambda Functions Locally with SAM

This guide shows how to test the scheduled newsletter Lambda functions locally using AWS SAM.

## Prerequisites

1. Install AWS SAM CLI:
   ```bash
   pip install aws-sam-cli
   ```

2. Ensure the Lambda zip files exist:
   ```bash
   cd terraform
   ls -la lambda_scheduled_newsletters*.zip
   ```

## Testing the Process Scheduled Newsletters Lambda

This Lambda is triggered by EventBridge and processes pending newsletters.

```bash
# Test the EventBridge trigger
sam local invoke ProcessScheduledNewsletters \
  --template sam-template.yaml \
  --event test-events/eventbridge-trigger.json \
  --env-vars env.json
```

## Testing the API Lambda

This Lambda handles CRUD operations for scheduled newsletters.

### Test GET all newsletters:
```bash
sam local invoke ScheduledNewslettersApi \
  --template sam-template.yaml \
  --event test-events/api-get-newsletters.json \
  --env-vars env.json
```

### Test CREATE a newsletter:
```bash
sam local invoke ScheduledNewslettersApi \
  --template sam-template.yaml \
  --event test-events/api-create-newsletter.json \
  --env-vars env.json
```

## Environment Variables

Create an `env.json` file for local testing:

```json
{
  "ProcessScheduledNewsletters": {
    "DYNAMODB_TABLE_NAME": "waterway-cleanups-scheduled-newsletters",
    "SOURCE_EMAIL": "Waterway Cleanups <info@waterwaycleanups.org>",
    "REGION": "us-east-1",
    "AWS_SAM_LOCAL": "true"
  },
  "ScheduledNewslettersApi": {
    "DYNAMODB_TABLE_NAME": "waterway-cleanups-scheduled-newsletters",
    "REGION": "us-east-1",
    "AWS_SAM_LOCAL": "true"
  }
}
```

## Starting Local API Gateway

To test the API endpoints interactively:

```bash
# Start local API Gateway
sam local start-api \
  --template sam-template.yaml \
  --env-vars env.json

# In another terminal, test the endpoints:
# GET all newsletters
curl http://localhost:3000/scheduled-newsletters

# POST new newsletter
curl -X POST http://localhost:3000/scheduled-newsletters \
  -H "Content-Type: application/json" \
  -d '{
    "scheduledTime": "2025-08-14T14:00:00Z",
    "templateName": "monthly-newsletter",
    "subject": "Test Newsletter",
    "toAddresses": ["test@example.com"],
    "useTopics": false
  }'
```

## Using Local DynamoDB

For more realistic testing, you can run DynamoDB locally:

1. Start DynamoDB Local:
   ```bash
   docker run -p 8000:8000 amazon/dynamodb-local
   ```

2. Create the table:
   ```bash
   aws dynamodb create-table \
     --table-name waterway-cleanups-scheduled-newsletters \
     --attribute-definitions \
       AttributeName=id,AttributeType=S \
       AttributeName=status,AttributeType=S \
       AttributeName=scheduledTime,AttributeType=S \
     --key-schema AttributeName=id,KeyType=HASH \
     --global-secondary-indexes \
       "IndexName=scheduledTime-index,Keys=[{AttributeName=status,KeyType=HASH},{AttributeName=scheduledTime,KeyType=RANGE}],Projection={ProjectionType=ALL},BillingMode=PAY_PER_REQUEST" \
     --billing-mode PAY_PER_REQUEST \
     --endpoint-url http://localhost:8000
   ```

3. Update env.json to use local DynamoDB:
   ```json
   {
     "ProcessScheduledNewsletters": {
       "DYNAMODB_ENDPOINT": "http://host.docker.internal:8000",
       ...
     }
   }
   ```

## Debugging

To debug Lambda functions:

```bash
# Start debugger on port 5858
sam local invoke ProcessScheduledNewsletters \
  --template sam-template.yaml \
  --event test-events/eventbridge-trigger.json \
  --env-vars env.json \
  --debug-port 5858
```

Then attach your debugger to `localhost:5858`.

## Test Scenarios

1. **Test scheduling logic**: Modify the timestamps in the Lambda code to test different time windows
2. **Test error handling**: Create events with invalid data
3. **Test topic filtering**: Create events with different topic configurations
4. **Test template rendering**: Use different template data payloads

## Notes

- The Lambda functions check for `AWS_SAM_LOCAL` environment variable to mock AWS services when testing locally
- Timestamps in the event files should be in UTC format
- The process Lambda has a 5-minute buffer when checking scheduled times
