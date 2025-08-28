# Scheduled Newsletters Implementation

This document describes the scheduled newsletter feature that allows emails to be scheduled for future delivery.

## Overview

The scheduled newsletter feature allows users to:
- Schedule newsletters to be sent at a specific date and time
- View all scheduled newsletters
- Cancel pending newsletters
- Automatically send newsletters at the scheduled time

## Architecture

### Components

1. **DynamoDB Table** (`waterway-cleanups-scheduled-newsletters`)
   - Stores scheduled newsletter information
   - Global Secondary Index on status and scheduledTime for efficient querying

2. **Lambda Functions**
   - `process_scheduled_newsletters.py` - Processes and sends scheduled newsletters
   - `scheduled_newsletters_api.py` - CRUD API for managing scheduled newsletters

3. **EventBridge Schedule**
   - Triggers the processing Lambda hourly between 9 AM and 4 PM ET
   - Uses cron expression: `cron(0 13-20 * * ? *)` (UTC times)

4. **Frontend Components**
   - `ScheduledNewsletters.tsx` - View and manage scheduled newsletters
   - `EmailSender.tsx` - Enhanced with scheduling capabilities
   - `scheduledNewsletters.ts` - API utility functions

## Scheduling Rules

- Newsletters can only be scheduled between **9 AM and 4 PM Eastern Time**
- The processing Lambda runs hourly during these times
- The Lambda has a 5-minute buffer to catch newsletters scheduled near the hour mark
- Weekends are supported (you can schedule for Saturday/Sunday)

## Usage

### Scheduling a Newsletter

1. Go to "Send Emails" in the SESv2 Admin app
2. Configure your email (template, recipients, etc.)
3. Check "Schedule for later"
4. Select date and time (only 9 AM - 4 PM ET hours available)
5. Click "Schedule Email"

### Managing Scheduled Newsletters

1. Go to "Scheduled Newsletters" from the dashboard
2. View all scheduled newsletters with their status
3. Cancel pending newsletters if needed
4. View details of sent/failed newsletters

## Deployment

1. Deploy with Terraform (it will automatically package the Lambda functions):
   ```bash
   cd terraform
   terraform apply
   ```

2. Update the SESv2 Admin app with the API Gateway URL:
   - Add `REACT_APP_API_GATEWAY_URL` to your environment variables
   - This should point to your API Gateway base URL

## Lambda Function Details

### Process Scheduled Newsletters Lambda

- Runs hourly between 9 AM - 4 PM ET
- Queries for newsletters scheduled within a 5-minute window
- Sends emails using the same logic as immediate sends
- Updates DynamoDB with success/failure status
- Supports topic filtering and template variables

### API Lambda

Provides endpoints for:
- `POST /scheduled-newsletters` - Create a scheduled newsletter
- `GET /scheduled-newsletters` - List all scheduled newsletters
- `GET /scheduled-newsletters/{id}` - Get specific newsletter
- `PUT /scheduled-newsletters/{id}` - Update pending newsletter
- `DELETE /scheduled-newsletters/{id}` - Cancel/delete newsletter

## Monitoring

- CloudWatch Logs for both Lambda functions
- CloudWatch Alarm for processing errors
- DynamoDB table includes status tracking:
  - `pending` - Waiting to be sent
  - `sent` - Successfully sent
  - `failed` - Failed to send (error details stored)
  - `cancelled` - Manually cancelled

## Time Zone Handling

- All scheduled times are stored in UTC in DynamoDB
- Frontend converts between ET and UTC automatically
- Display times show "ET" suffix for clarity
- The Lambda checks ET hours before processing

## Error Handling

- Failed newsletters are marked with status `failed`
- Error messages are stored in the DynamoDB record
- Individual recipient failures don't stop the entire batch
- CloudWatch alarms notify of repeated failures

## Security

- API Gateway requires AWS IAM authentication
- Lambda functions have least-privilege IAM roles
- DynamoDB encryption at rest enabled
- Point-in-time recovery enabled for the table
