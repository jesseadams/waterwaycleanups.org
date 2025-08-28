#!/bin/bash

# Test the scheduled newsletter processing Lambda locally with SAM

echo "Testing Process Scheduled Newsletters Lambda..."
echo "============================================"

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo "SAM CLI is not installed. Please install it with: pip install aws-sam-cli"
    exit 1
fi

# Check if Lambda zip exists
if [ ! -f "lambda_scheduled_newsletters.zip" ]; then
    echo "Lambda zip not found. Please run terraform apply first."
    exit 1
fi

# Run the test
echo "Invoking Lambda with EventBridge trigger event..."
sam local invoke ProcessScheduledNewsletters \
  --template sam-template.yaml \
  --event test-events/eventbridge-trigger.json \
  --env-vars env.json

echo ""
echo "Test complete!"
echo ""
echo "To test the API endpoints, run:"
echo "  sam local start-api --template sam-template.yaml --env-vars env.json"
echo ""
echo "Then in another terminal:"
echo "  curl http://localhost:3000/scheduled-newsletters"
