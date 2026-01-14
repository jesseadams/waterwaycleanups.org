# Events API Authentication Guide

## Overview

The Events API uses a custom Lambda authorizer that validates session tokens from the existing authentication system. This provides seamless integration with the current volunteer authentication flow.

## Authentication Flow

### 1. User Authentication
Users authenticate using the existing email-based authentication system:
1. User requests authentication code via `/api/auth-send-code`
2. User verifies code via `/api/auth-verify-code` 
3. System returns a session token
4. Session token is used for Events API access

### 2. API Authorization
The Events API uses a Lambda authorizer that:
1. Extracts the session token from the `Authorization` header
2. Validates the token against the `auth_sessions` DynamoDB table
3. Checks if the session is expired
4. Determines user permissions (admin vs regular user)
5. Returns an IAM policy allowing or denying access

## Permission Levels

### Public Access (No Authentication Required)
- `GET /events` - List all events
- `GET /events/{event_id}` - Get specific event details

### Authenticated User Access
- `GET /volunteers/{email}` - Get own volunteer profile
- `PUT /volunteers/{email}` - Update own volunteer profile  
- `GET /volunteers/{email}/rsvps` - Get own RSVP history

### Admin Access Only
- `POST /events` - Create new events
- `PUT /events/{event_id}` - Update events
- `DELETE /events/{event_id}` - Delete events
- `GET /events/{event_id}/rsvps` - View event RSVPs
- `GET /volunteers` - List all volunteers
- `GET /volunteers/export` - Export volunteer data

## Admin User Configuration

Admin users are currently identified by email address in the Lambda authorizer. To add admin users:

1. Update the `admin_emails` list in `lambda_events_authorizer.py`
2. Redeploy the Lambda function

```python
admin_emails = [
    'admin@waterwaycleanups.org',
    'contact@waterwaycleanups.org',
    # Add more admin emails here
]
```

## Using the API

### Authentication Headers

For authenticated requests, include the session token in the Authorization header:

```javascript
const headers = {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey  // If API key is required
};
```

### Error Responses

The API returns standardized error responses:

```json
{
    "error": "Error message",
    "error_code": "ERROR_CODE",
    "timestamp": "2024-01-15T10:30:00Z"
}
```

Common error codes:
- `UNAUTHORIZED` - Invalid or expired session token
- `FORBIDDEN` - Insufficient permissions
- `VALIDATION_ERROR` - Invalid request data
- `NOT_FOUND` - Resource not found
- `RATE_LIMIT_EXCEEDED` - Too many requests

### Rate Limiting

The API includes rate limiting:
- **Rate Limit**: 100 requests per second
- **Burst Limit**: 200 requests
- **Daily Quota**: 10,000 requests per day

Rate limit headers are included in responses:
- `X-RateLimit-Limit` - Requests per second limit
- `X-RateLimit-Remaining` - Remaining requests in current window
- `X-RateLimit-Reset` - Time when rate limit resets

## Security Considerations

### Session Token Security
- Session tokens are stored in DynamoDB with TTL for automatic expiration
- Tokens should be transmitted over HTTPS only
- Frontend should store tokens securely (localStorage with appropriate precautions)

### API Key Security
- API keys are used for additional rate limiting and monitoring
- Keys should be rotated regularly
- Keys are stored in AWS SSM Parameter Store as SecureString

### CORS Configuration
The API includes CORS headers to allow browser-based access:
- `Access-Control-Allow-Origin: *` (should be restricted in production)
- `Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`
- `Access-Control-Allow-Headers: Content-Type,Authorization,X-Api-Key`

## Monitoring and Logging

### CloudWatch Logs
All Lambda functions log to CloudWatch with structured logging:
- Request details (method, path, user)
- Authentication results
- Error details
- Performance metrics

### API Gateway Metrics
API Gateway provides built-in metrics:
- Request count and latency
- Error rates (4xx, 5xx)
- Cache hit rates
- Throttling metrics

### Custom Metrics
The authorizer publishes custom metrics:
- Authentication success/failure rates
- Admin vs user request patterns
- Session token validation performance

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check session token validity
   - Verify token format (Bearer prefix)
   - Check session expiration

2. **403 Forbidden**
   - Verify user has required permissions
   - Check admin email configuration
   - Validate request method and endpoint

3. **429 Rate Limited**
   - Implement exponential backoff
   - Check usage plan configuration
   - Monitor request patterns

### Debug Steps

1. Check CloudWatch logs for the authorizer Lambda
2. Verify session token in DynamoDB `auth_sessions` table
3. Test with API Gateway test console
4. Use the provided test script: `python test_events_api.py`

## Integration Examples

### JavaScript Frontend
```javascript
// Initialize API client
const eventsAPI = new EventsAPIClient(apiUrl, apiKey);

// Set session token after authentication
eventsAPI.setSessionToken(sessionToken);

// Make authenticated request
try {
    const events = await eventsAPI.getEvents();
    console.log('Events:', events);
} catch (error) {
    if (error.statusCode === 401) {
        // Redirect to login
        window.location.href = '/volunteer';
    }
}
```

### Python Backend
```python
import requests

headers = {
    'Authorization': f'Bearer {session_token}',
    'Content-Type': 'application/json',
    'X-Api-Key': api_key
}

response = requests.get(f'{api_url}/events', headers=headers)
if response.status_code == 200:
    events = response.json()
else:
    print(f'Error: {response.status_code} - {response.text}')
```