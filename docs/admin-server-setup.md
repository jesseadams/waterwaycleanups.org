# Admin Server Setup

## Problem
During localhost development, the admin interface can only show events that you have RSVPs for, not ALL events in the database.

## Solution
Run a local admin server that directly queries DynamoDB to get ALL events.

## Setup

### 1. Start the Admin Server
```bash
npm run admin-server
```

This starts a local server on `http://localhost:3001` that provides ALL events from the database.

### 2. Use the Admin Interface
1. Go to `http://localhost:1313/admin/`
2. Log in with your admin credentials
3. The interface will automatically detect and use the local admin server
4. You'll see a green success message: "✅ Connected to local admin server - showing ALL events from database"

## What It Does

The admin server:
- **Connects directly to DynamoDB** using your AWS credentials
- **Returns ALL events** from the events table (not just your RSVPs)
- **Supports filtering** by status and location
- **Handles CORS** for localhost development
- **Converts DynamoDB Decimal objects** to regular numbers

## Troubleshooting

### Server Won't Start
- Make sure you have AWS credentials configured
- Check that the `EVENTS_TABLE_NAME` environment variable is set (defaults to 'events')
- Ensure port 3001 is available

### Admin Interface Still Shows Limited Events
- Check the browser console for connection errors
- Make sure the admin server is running on port 3001
- Refresh the admin page after starting the server

### AWS Permissions
The server needs DynamoDB read permissions for the events table:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:Scan",
                "dynamodb:Query"
            ],
            "Resource": "arn:aws:dynamodb:*:*:table/events*"
        }
    ]
}
```

## Production
In production, the admin interface automatically uses the deployed admin API endpoints, so this local server is only needed for development.