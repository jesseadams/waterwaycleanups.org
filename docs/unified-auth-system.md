# Unified Authentication System

This document describes the consolidated authentication system for volunteers that handles both event RSVPs and volunteer waivers.

## Overview

The new system replaces separate registration flows with a unified email-based authentication system where:

1. **Authentication**: Users log in with email + validation code (no passwords)
2. **Session Management**: 24-hour sessions with automatic expiry
3. **Unified Dashboard**: Single interface for waivers and RSVPs
4. **Security**: Validation codes expire after 15 minutes

## Architecture

### Authentication Flow

1. User enters email address
2. System sends 6-digit validation code via email
3. User enters code within 15 minutes
4. System creates 24-hour session
5. User accesses unified dashboard

### API Endpoints

#### Authentication
- `POST /api/auth-send-code` - Send validation code to email
- `POST /api/auth-verify-code` - Verify code and create session
- `POST /api/auth-validate-session` - Validate existing session

#### User Management
- `POST /api/user-dashboard` - Get user's waivers and RSVPs
- `POST /api/submit-volunteer-waiver` - Submit waiver (requires auth)
- `POST /api/submit-event-rsvp` - Submit RSVP (requires auth)

### Database Tables

#### auth_codes
- `code_id` (PK) - Unique code identifier
- `email` (GSI) - User's email address
- `validation_code` - 6-digit code
- `expires_at` - Code expiration (15 minutes)
- `used` - Whether code has been used

#### user_sessions
- `session_id` (PK) - Unique session identifier
- `session_token` (GSI) - Session token for API calls
- `email` - User's email address
- `expires_at` - Session expiration (24 hours)
- `last_accessed` - Last activity timestamp

#### volunteer_waivers (existing)
- Enhanced with session-based authentication
- Email comes from authenticated session

#### event_rsvps (existing/new)
- `event_id` (PK) - Event identifier
- `rsvp_id` (SK) - Unique RSVP identifier
- `email` (GSI) - User's email from session
- `first_name`, `last_name` - User details
- `submission_date` - When RSVP was submitted

## Frontend Integration

### JavaScript Client
- `static/js/auth-client.js` - Authentication client library
- Handles session storage in localStorage
- Provides methods for all API interactions

### React Dashboard
- `layouts/volunteer/single.html` - Volunteer dashboard page
- Unified interface for authentication and management
- Real-time session validation

### Usage Example

```javascript
// Send validation code
await window.authClient.sendValidationCode('user@example.com');

// Verify code and authenticate
await window.authClient.verifyCode('user@example.com', '123456');

// Submit RSVP (requires authentication)
await window.authClient.submitEventRsvp('event-123', 'John', 'Doe');

// Get dashboard data
const dashboard = await window.authClient.getDashboard();
```

## Security Features

1. **No Passwords**: Email-based authentication only
2. **Short-lived Codes**: 15-minute validation code expiry
3. **Session Expiry**: 24-hour automatic session timeout
4. **Single Use Codes**: Validation codes can only be used once
5. **Session Validation**: All protected endpoints validate sessions

## Migration Notes

### From Old System
- Existing waiver data remains unchanged
- New submissions require authentication
- Old RSVP system (if any) replaced with authenticated version

### Environment Variables
New variables added to `.env` and `.env.development`:
- `AUTH_TABLE_NAME` - Authentication codes table
- `SESSION_TABLE_NAME` - User sessions table
- `RSVP_TABLE_NAME` - Event RSVPs table
- `FROM_EMAIL` - Email sender address

## Deployment Requirements

### AWS Resources
1. **DynamoDB Tables**:
   - `auth_codes` with GSI on `email`
   - `user_sessions` with GSI on `session_token`
   - `event_rsvps` with GSI on `email`

2. **Lambda Functions**:
   - All new API endpoints need deployment
   - Update existing waiver/RSVP endpoints

3. **SES Configuration**:
   - Verify sender email address
   - Ensure sending permissions

### Infrastructure Updates
- Update Terraform configurations for new tables
- Deploy new Lambda functions
- Update API Gateway routes
- Configure SES permissions

## User Experience

### For Volunteers
1. Visit `/volunteer` page
2. Enter email address
3. Check email for validation code
4. Enter code to access dashboard
5. View waiver status and RSVPs
6. Complete waiver or RSVP for events as needed

### Session Management
- Sessions last 24 hours
- Automatic logout on expiry
- Manual logout option available
- Session status visible in dashboard

## Benefits

1. **Simplified UX**: Single login for all volunteer activities
2. **Better Security**: No password management, short-lived sessions
3. **Unified Data**: All volunteer activities in one place
4. **Mobile Friendly**: Email-based auth works well on mobile
5. **Maintainable**: Centralized authentication logic