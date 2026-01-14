# Event Lifecycle Management Documentation

## Overview

The Event Lifecycle Management system provides automated and manual tools for managing the lifecycle of events in the database-driven events system. This includes automatic status updates, event archiving, categorization, and cancellation workflows with volunteer notifications.

## Features

### 1. Automatic Status Updates

**Purpose**: Automatically update event status from 'active' to 'completed' when events have passed their end time.

**Trigger**: 
- Scheduled execution every hour via CloudWatch Events
- Manual trigger via API call

**API Endpoint**: `POST /events/lifecycle`
```json
{
  "action": "update_completed_events"
}
```

**Response**:
```json
{
  "message": "Updated 3 events to completed status",
  "updated_events": ["event-1", "event-2", "event-3"],
  "success": true
}
```

### 2. Event Archiving

**Purpose**: Archive old events based on date criteria to keep the active event list manageable.

**API Endpoint**: `POST /events/lifecycle`
```json
{
  "action": "archive_events",
  "archive_before_date": "2024-01-01T00:00:00Z",
  "archive_status": "completed"
}
```

**Parameters**:
- `archive_before_date`: ISO 8601 date string - events before this date will be archived
- `archive_status`: Status of events to archive (default: "completed")

**Response**:
```json
{
  "message": "Archived 5 events",
  "archived_events": ["old-event-1", "old-event-2", ...],
  "success": true
}
```

### 3. Event Categorization

**Purpose**: Categorize events into upcoming, current, and past for better organization and display.

**API Endpoint**: `POST /events/lifecycle`
```json
{
  "action": "categorize_events"
}
```

**Response**:
```json
{
  "categories": {
    "upcoming": [
      {
        "event_id": "future-event-1",
        "title": "Future Cleanup",
        "start_time": "2024-06-01T10:00:00Z",
        "end_time": "2024-06-01T14:00:00Z"
      }
    ],
    "current": [],
    "past": [
      {
        "event_id": "past-event-1",
        "title": "Past Cleanup",
        "start_time": "2024-01-15T10:00:00Z",
        "end_time": "2024-01-15T14:00:00Z"
      }
    ]
  },
  "summary": {
    "upcoming_count": 1,
    "current_count": 0,
    "past_count": 1
  },
  "success": true
}
```

### 4. Event Cancellation with Notifications

**Purpose**: Cancel events and automatically notify all registered volunteers via SNS.

**API Endpoint**: `POST /events/lifecycle`
```json
{
  "action": "cancel_event",
  "event_id": "event-to-cancel",
  "reason": "Weather conditions unsafe",
  "notify_volunteers": true
}
```

**Parameters**:
- `event_id`: ID of the event to cancel
- `reason`: Reason for cancellation (will be included in notifications)
- `notify_volunteers`: Boolean - whether to send notifications (default: true)

**Response**:
```json
{
  "message": "Event event-to-cancel cancelled successfully",
  "event_id": "event-to-cancel",
  "notified_volunteers": ["volunteer1@email.com", "volunteer2@email.com"],
  "notification_count": 2,
  "success": true
}
```

**What happens during cancellation**:
1. Event status is updated to 'cancelled'
2. Cancellation reason is stored in the event record
3. All active RSVPs for the event are updated to 'cancelled' status
4. SNS notifications are sent to all registered volunteers
5. RSVP records include the cancellation reason

## Scheduled Operations

### Automatic Lifecycle Management

A CloudWatch Events rule triggers the lifecycle scheduler every hour to:

1. **Update Completed Events**: Check for events that have passed their end time and update their status
2. **Categorize Events**: Refresh event categorization for monitoring and reporting

**Schedule**: Every hour (`rate(1 hour)`)

**Lambda Functions**:
- `events_lifecycle_scheduler`: Orchestrates the scheduled tasks
- `events_lifecycle`: Performs the actual lifecycle operations

## SNS Notifications

### Event Cancellation Notifications

When an event is cancelled, the system publishes messages to the SNS topic with the following structure:

```json
{
  "type": "event_cancellation",
  "event_id": "cancelled-event-id",
  "event_title": "Cleanup Event Title",
  "volunteer_email": "volunteer@email.com",
  "reason": "Weather conditions unsafe",
  "event_start_time": "2024-06-01T10:00:00Z",
  "event_location": "Park Location"
}
```

**SNS Topic**: `events-notifications{resource_suffix}`

## API Authentication

All lifecycle management endpoints require authentication:

- **Method**: Custom Lambda authorizer
- **Header**: `Authorization: Bearer <session-token>`
- **Permissions**: Admin-level access required

## Error Handling

### Common Error Responses

**400 Bad Request**:
```json
{
  "error": "Invalid action. Supported actions: update_completed_events, archive_events, cancel_event, categorize_events"
}
```

**404 Not Found** (for event cancellation):
```json
{
  "error": "Event event-id not found"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Failed to update completed events: <error details>",
  "success": false
}
```

## Testing

### Manual Testing

Use the provided test script:

```bash
# Set environment variables
export EVENTS_API_URL="https://your-api-gateway-url.amazonaws.com/dev"
export EVENTS_API_KEY="your-api-key"

# Run tests
python3 terraform/test_events_lifecycle.py
```

### API Testing with curl

```bash
# Test automatic status updates
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"action": "update_completed_events"}' \
  https://your-api-gateway-url.amazonaws.com/dev/events/lifecycle

# Test event categorization
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"action": "categorize_events"}' \
  https://your-api-gateway-url.amazonaws.com/dev/events/lifecycle
```

## Monitoring

### CloudWatch Logs

Monitor the following log groups:
- `/aws/lambda/events_lifecycle{resource_suffix}`
- `/aws/lambda/events_lifecycle_scheduler{resource_suffix}`

### CloudWatch Metrics

Key metrics to monitor:
- Lambda function duration and error rates
- SNS message delivery success/failure
- DynamoDB read/write capacity usage

## Configuration

### Environment Variables

**events_lifecycle Lambda**:
- `EVENTS_TABLE_NAME`: DynamoDB events table name
- `RSVPS_TABLE_NAME`: DynamoDB RSVPs table name  
- `VOLUNTEERS_TABLE_NAME`: DynamoDB volunteers table name
- `SNS_TOPIC_ARN`: SNS topic ARN for notifications

**events_lifecycle_scheduler Lambda**:
- `LIFECYCLE_FUNCTION_NAME`: Name of the lifecycle management function

### Terraform Resources

Key resources created:
- `aws_lambda_function.events_lifecycle`
- `aws_lambda_function.events_lifecycle_scheduler`
- `aws_cloudwatch_event_rule.events_lifecycle_schedule`
- `aws_api_gateway_resource.events_lifecycle`
- `aws_sns_topic.events_topic`

## Best Practices

1. **Test Cancellations**: Always test event cancellation with `notify_volunteers: false` first
2. **Monitor Notifications**: Set up SNS delivery status logging to track notification success
3. **Archive Regularly**: Run archiving operations during low-traffic periods
4. **Backup Before Bulk Operations**: Consider backing up data before large archiving operations
5. **Rate Limiting**: Be aware of API Gateway and Lambda rate limits for bulk operations

## Troubleshooting

### Common Issues

1. **Notifications Not Sent**: Check SNS topic permissions and subscription configuration
2. **Events Not Updating**: Verify CloudWatch Events rule is enabled and Lambda permissions are correct
3. **Authentication Errors**: Ensure proper session tokens and admin permissions
4. **Timeout Errors**: Large operations may need increased Lambda timeout settings

### Debug Steps

1. Check CloudWatch Logs for detailed error messages
2. Verify DynamoDB table permissions and indexes
3. Test individual operations before running bulk operations
4. Monitor Lambda function metrics for performance issues