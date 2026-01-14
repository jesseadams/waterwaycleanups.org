# Cancel Event RSVP Implementation

## Overview

This document describes the implementation of the cancel-event-rsvp API endpoint, which allows volunteers to cancel RSVPs for themselves or their minors.

## Implementation Summary

### Lambda Function: `lambda_event_rsvp_cancel.py`

**Location**: `terraform/lambda_event_rsvp_cancel.py`

**Purpose**: Handles RSVP cancellation requests with proper authentication and authorization.

### Key Features

1. **Session Validation** (Requirement 6.1, 6.2, 6.3)
   - Validates session token before processing cancellation
   - Checks session expiration
   - Returns appropriate error messages for invalid/expired sessions

2. **Ownership Verification** (Requirement 6.3)
   - Volunteers can cancel their own RSVPs
   - Volunteers can cancel their minors' RSVPs
   - Prevents cancellation of other volunteers' RSVPs
   - Prevents cancellation of other guardians' minors' RSVPs

3. **RSVP Deletion** (Requirement 6.1, 6.2)
   - Deletes RSVP record from event_rsvps table
   - Uses DynamoDB composite key (event_id, attendee_id)

4. **Attendance Count Decrement** (Requirement 6.4)
   - Attendance is calculated dynamically by counting RSVP records
   - Deleting an RSVP automatically decrements the count by 1
   - No separate counter field to maintain

5. **Cancellation Confirmation** (Requirement 6.5)
   - Returns attendee_id and attendee_type
   - Calculates hours_before_event if event time is available
   - Provides clear success/error messages

### API Endpoint

**Endpoint**: `POST /cancel-event-rsvp`

**Request Format**:
```json
{
  "session_token": "string",
  "event_id": "string",
  "attendee_id": "string",
  "attendee_type": "volunteer" | "minor"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "message": "RSVP cancelled successfully",
  "attendee_id": "string",
  "attendee_type": "string",
  "hours_before_event": 48.5  // Optional, if event time available
}
```

**Error Responses**:
- 400: Missing required parameters or invalid attendee_type
- 401: Invalid or expired session token
- 403: Unauthorized cancellation attempt
- 404: RSVP not found
- 500: Internal server error

### Infrastructure Changes

#### Terraform Configuration (`event_rsvp.tf`)

1. **IAM Policy Updates**:
   - Added access to `auth_sessions` table for session validation
   - Added access to `minors` table for ownership verification

2. **Lambda Environment Variables**:
   - `EVENTS_TABLE_NAME`: For event lookup and hours calculation
   - `EVENT_RSVPS_TABLE_NAME`: For RSVP deletion
   - `SESSIONS_TABLE_NAME`: For session validation
   - `MINORS_TABLE_NAME`: For minor ownership verification

3. **API Gateway Integration**:
   - Already configured in existing infrastructure
   - POST method with CORS support
   - OPTIONS method for preflight requests

### Testing

**Test File**: `terraform/test_cancel_rsvp.py`

**Test Coverage**:
- ✓ Session validation logic (valid and expired sessions)
- ✓ Ownership verification (volunteer own RSVP, minor RSVP, unauthorized attempts)
- ✓ Hours before event calculation (future, near-term, and past events)
- ✓ Response format validation
- ✓ Attendance decrement logic

All tests pass successfully.

## Requirements Validation

### Requirement 6.1: Cancel Own RSVP
✓ Implemented in `verify_rsvp_ownership()` and `delete_rsvp_record()`

### Requirement 6.2: Cancel Minor's RSVP
✓ Implemented in `verify_rsvp_ownership()` with guardian_email check

### Requirement 6.3: Prevent Unauthorized Cancellation
✓ Implemented in `verify_rsvp_ownership()` with proper authorization checks

### Requirement 6.4: Decrement Attendance Count
✓ Automatic through RSVP record deletion (dynamic counting)

### Requirement 6.5: Cancellation Confirmation
✓ Implemented in response with attendee_id, attendee_type, and hours_before_event

## Security Considerations

1. **Authentication**: Session token validation ensures only authenticated users can cancel RSVPs
2. **Authorization**: Ownership verification prevents unauthorized cancellations
3. **Data Integrity**: Uses DynamoDB atomic operations for reliable deletion
4. **CORS**: Properly configured for cross-origin requests

## Deployment Notes

1. The Lambda function is already integrated into the existing API Gateway
2. IAM policies have been updated to grant necessary permissions
3. Environment variables are configured in Terraform
4. No database schema changes required (uses existing tables)

## Next Steps

The following optional property-based tests are defined in the tasks but not yet implemented:
- 4.2: Write property test for RSVP cancellation
- 4.3: Write property test for unauthorized cancellation
- 4.5: Write property test for attendance decrement
- 4.7: Write property test for cancellation confirmation

These tests can be implemented later if comprehensive property-based testing is desired.
