# Events API Gateway Setup

This document describes the API Gateway and authentication setup for the database-driven events system.

## Overview

The Events API provides RESTful endpoints for managing events and volunteers, with proper authentication, authorization, and rate limiting. It integrates seamlessly with the existing volunteer authentication system.

## Architecture Components

### 1. API Gateway (`aws_api_gateway_rest_api.events_api`)
- **Name**: `events-api{resource_suffix}`
- **Type**: Regional API Gateway
- **Base URL**: `https://{api_id}.execute-api.{region}.amazonaws.com/{stage}`

### 2. Lambda Authorizer (`aws_lambda_function.events_authorizer`)
- **Purpose**: Validates session tokens and enforces permissions
- **Type**: TOKEN authorizer
- **Cache TTL**: 300 seconds (5 minutes)
- **Identity Source**: `method.request.header.Authorization`

### 3. Lambda Functions
All Lambda functions use the shared utilities layer for consistent error handling:

#### Event Management
- `events_create` - Create new events (admin only)
- `events_get` - List/retrieve events (public for list, auth for details)
- `events_update` - Update events (admin only)
- `events_delete` - Delete events (admin only)
- `events_list_rsvps` - Get event RSVPs (admin only)

#### Volunteer Management
- `volunteers_get` - Get volunteer profiles (auth required)
- `volunteers_update` - Update volunteer profiles (self or admin)
- `volunteers_rsvps` - Get volunteer RSVP history (self or admin)
- `volunteers_export` - Export volunteer data (admin only)

### 4. Shared Utilities Layer (`aws_lambda_layer_version.events_api_layer`)
- **Purpose**: Common utilities for error handling, validation, and responses
- **Runtime**: Python 3.9
- **Contents**: `events_api_utils.py`

### 5. Rate Limiting (`aws_api_gateway_usage_plan.events_api_usage_plan`)
- **Rate Limit**: 100 requests/second
- **Burst Limit**: 200 requests
- **Daily Quota**: 10,000 requests
- **API Key**: Required for tracking and additional security

## API Endpoints

### Public Endpoints (No Authentication)
```
GET /events                    # List all events
GET /events/{event_id}         # Get specific event
```

### Authenticated Endpoints
```
GET /volunteers/{email}        # Get volunteer profile (self or admin)
PUT /volunteers/{email}        # Update volunteer profile (self or admin)
GET /volunteers/{email}/rsvps  # Get volunteer RSVPs (self or admin)
```

### Admin-Only Endpoints
```
POST /events                   # Create event
PUT /events/{event_id}         # Update event
DELETE /events/{event_id}      # Delete event
GET /events/{event_id}/rsvps   # Get event RSVPs
GET /volunteers                # List all volunteers
GET /volunteers/export         # Export volunteer data
```

## Authentication Flow

### 1. Session Token Validation
The Lambda authorizer validates session tokens by:
1. Extracting token from `Authorization: Bearer {token}` header
2. Looking up token in `auth_sessions` DynamoDB table
3. Checking expiration time
4. Determining user permissions (admin vs regular user)

### 2. Permission Levels
- **Public**: No authentication required
- **User**: Valid session token required
- **Admin**: Valid session token + admin email address

### 3. Admin Configuration
Admin users are configured in the authorizer Lambda function:
```python
admin_emails = [
    'admin@waterwaycleanups.org',
    'contact@waterwaycleanups.org'
]
```

## Error Handling

### Standardized Error Responses
All endpoints return consistent error responses:
```json
{
    "error": "Error message",
    "error_code": "ERROR_CODE", 
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common Error Codes
- `UNAUTHORIZED` (401) - Invalid/expired session token
- `FORBIDDEN` (403) - Insufficient permissions
- `VALIDATION_ERROR` (400) - Invalid request data
- `NOT_FOUND` (404) - Resource not found
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `INTERNAL_ERROR` (500) - Server error

### CORS Support
All endpoints include proper CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type,Authorization,X-Api-Key
```

## Deployment

### Prerequisites
1. Existing authentication system (auth_sessions table)
2. DynamoDB tables (events, volunteers, rsvps)
3. Proper IAM roles and policies

### Terraform Resources
The setup includes these key Terraform resources:
- `aws_api_gateway_rest_api.events_api`
- `aws_api_gateway_authorizer.events_authorizer`
- `aws_lambda_function.events_authorizer`
- `aws_lambda_layer_version.events_api_layer`
- `aws_api_gateway_usage_plan.events_api_usage_plan`
- `aws_api_gateway_api_key.events_api_key`

### Configuration Parameters
Key configuration is stored in SSM Parameter Store:
- `/waterwaycleanups{suffix}/events_api_url` - API Gateway URL
- `/waterwaycleanups{suffix}/events_api_key` - API key (SecureString)
- `/waterwaycleanups{suffix}/events_table_name` - Events table name
- `/waterwaycleanups{suffix}/volunteers_table_name` - Volunteers table name
- `/waterwaycleanups{suffix}/rsvps_table_name` - RSVPs table name

### Validation
Use the validation script to verify deployment:
```bash
python validate_events_api_deployment.py us-east-1 -dev
```

## Frontend Integration

### JavaScript Client
The API includes a JavaScript client library:
- `static/js/events-api-client.js` - Main client class
- `static/js/events-api-init.js` - Initialization script

### Usage Example
```javascript
// Wait for API to be ready
await window.waitForEventsAPI();

// Get events (public)
const events = await window.eventsAPI.getEvents();

// Create event (admin only)
const newEvent = await window.eventsAPI.createEvent({
    title: "Beach Cleanup",
    description: "Monthly beach cleanup event",
    start_time: "2024-02-15T09:00:00Z",
    end_time: "2024-02-15T12:00:00Z",
    location: {
        name: "Sunset Beach",
        address: "123 Beach Rd, Coastal City, CC 12345"
    }
});
```

## Monitoring

### CloudWatch Logs
All Lambda functions log to CloudWatch with structured logging:
- Request details (method, path, user email)
- Authentication results
- Validation errors
- Performance metrics

### API Gateway Metrics
Built-in metrics available in CloudWatch:
- Request count and latency
- Error rates (4xx, 5xx)
- Cache hit rates (for authorizer)
- Throttling events

### Custom Metrics
The authorizer publishes custom metrics:
- Authentication success/failure rates
- Admin vs user request distribution
- Session validation performance

## Security Considerations

### Session Token Security
- Tokens stored in DynamoDB with automatic TTL expiration
- Tokens transmitted via HTTPS only
- Frontend stores tokens in localStorage (consider httpOnly cookies for production)

### API Key Management
- Keys stored as SecureString in SSM Parameter Store
- Keys should be rotated regularly
- Keys provide additional rate limiting and request tracking

### Network Security
- API Gateway uses TLS 1.2+ for all communications
- Lambda functions run in AWS managed VPC
- DynamoDB access restricted by IAM policies

### Input Validation
- All inputs validated using shared utility functions
- SQL injection not applicable (NoSQL DynamoDB)
- XSS prevention through proper JSON encoding

## Troubleshooting

### Common Issues

1. **401 Unauthorized Errors**
   - Check session token validity in `auth_sessions` table
   - Verify Authorization header format: `Bearer {token}`
   - Check token expiration

2. **403 Forbidden Errors**
   - Verify user has required permissions
   - Check admin email configuration in authorizer
   - Validate HTTP method matches endpoint requirements

3. **429 Rate Limited**
   - Check usage plan configuration
   - Implement exponential backoff in client
   - Monitor request patterns

4. **500 Internal Errors**
   - Check CloudWatch logs for Lambda functions
   - Verify DynamoDB table permissions
   - Check Lambda function configuration

### Debug Tools

1. **API Gateway Test Console**
   - Test endpoints directly in AWS console
   - Verify request/response formats
   - Check authorizer behavior

2. **CloudWatch Logs**
   - Lambda function logs: `/aws/lambda/{function_name}`
   - API Gateway logs: Enable in stage settings

3. **Test Scripts**
   - `test_events_api.py` - Comprehensive API testing
   - `validate_events_api_deployment.py` - Deployment validation

### Performance Optimization

1. **Authorizer Caching**
   - 5-minute cache TTL reduces DynamoDB calls
   - Cache key based on session token
   - Invalidated automatically on token changes

2. **Lambda Cold Starts**
   - Shared layer reduces deployment package size
   - Consider provisioned concurrency for high-traffic endpoints

3. **DynamoDB Performance**
   - Use appropriate indexes for query patterns
   - Monitor consumed capacity units
   - Consider DynamoDB Accelerator (DAX) for read-heavy workloads

## Future Enhancements

### Planned Improvements
1. **Enhanced Authorization**
   - Role-based access control (RBAC)
   - Resource-level permissions
   - API key scoping

2. **Advanced Rate Limiting**
   - Per-user rate limits
   - Endpoint-specific limits
   - Adaptive throttling

3. **Monitoring Enhancements**
   - Custom dashboards
   - Alerting on error rates
   - Performance analytics

4. **Security Hardening**
   - IP whitelisting
   - Request signing
   - Enhanced audit logging