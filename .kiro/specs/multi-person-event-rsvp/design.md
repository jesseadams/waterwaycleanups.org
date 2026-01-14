# Design Document: Multi-Person Event RSVP System

## Overview

This design enhances the existing event RSVP system to support multi-person registrations. Currently, volunteers can only RSVP for themselves (one RSVP per email per event). This enhancement allows volunteers with minors on their account to RSVP for any combination of themselves and their minors in a single submission flow, while preserving the existing simple UX for volunteers without minors.

The system maintains backward compatibility with existing RSVP records and API contracts while introducing new capabilities for managing group attendance.

## Architecture

### System Components

1. **Frontend RSVP Interface** (`static/js/event-rsvp.js`)
   - Detects if volunteer has minors
   - Conditionally renders single-person or multi-person UI
   - Handles attendee selection and submission
   - Manages RSVP cancellation for multiple attendees

2. **Backend API Endpoints**
   - `submit-event-rsvp` (enhanced): Processes multi-person RSVP submissions
   - `check-event-rsvp` (enhanced): Returns all RSVPs for a volunteer and their minors
   - `cancel-event-rsvp` (new): Cancels individual RSVP records

3. **Data Layer**
   - DynamoDB `event_rsvps` table (schema enhanced)
   - DynamoDB `minors` table (read-only for RSVP flow)
   - Session management via `user_sessions` table

### Data Flow

```
User initiates RSVP
  ↓
Check authentication
  ↓
Fetch minors list (if authenticated)
  ↓
Determine UI mode (single vs multi-person)
  ↓
User selects attendees
  ↓
Submit RSVP with attendee list
  ↓
Backend validates and creates individual RSVP records
  ↓
Update UI with confirmation
```

## Components and Interfaces

### Frontend Components

#### 1. RSVP Widget Initializer
```javascript
function initializeRsvpWidget(widget)
```
- Checks authentication status
- Fetches minors list if authenticated
- Determines which UI to render based on minors count
- Attaches event handlers

#### 2. Multi-Person Attendee Selector (New)
```javascript
function renderMultiPersonSelector(widget, volunteer, minors)
```
- Displays volunteer as first option (with name and email)
- Lists all minors with name and age
- Provides checkboxes for selection
- Shows selected count and capacity remaining
- Validates at least one attendee is selected

#### 3. RSVP Submission Handler (Enhanced)
```javascript
async function handleMultiPersonRsvp(widget, eventId, selectedAttendees, attendanceCap)
```
- Validates selection (at least one attendee)
- Checks capacity for all selected attendees
- Submits batch RSVP request
- Handles partial success scenarios
- Updates UI with results

#### 4. RSVP Status Checker (Enhanced)
```javascript
async function checkUserRsvpStatus(widget, eventId)
```
- Fetches all RSVPs for volunteer and their minors
- Updates UI to show who is already registered
- Disables already-registered attendees in selector
- Shows cancellation options for registered attendees

### Backend API Interfaces

#### Enhanced: Submit Event RSVP
```
POST /submit-event-rsvp
```

**Request (Backward Compatible)**:
```json
{
  "session_token": "string",
  "event_id": "string",
  "first_name": "string",
  "last_name": "string",
  "attendance_cap": 15
}
```

**Request (New Multi-Person)**:
```json
{
  "session_token": "string",
  "event_id": "string",
  "attendees": [
    {
      "type": "volunteer",
      "email": "volunteer@example.com",
      "first_name": "John",
      "last_name": "Doe"
    },
    {
      "type": "minor",
      "minor_id": "uuid",
      "first_name": "Jane",
      "last_name": "Doe",
      "age": 12
    }
  ],
  "attendance_cap": 15
}
```

**Response**:
```json
{
  "success": true,
  "message": "RSVP submitted successfully",
  "results": [
    {
      "attendee_id": "volunteer@example.com",
      "status": "registered",
      "attendee_type": "volunteer"
    },
    {
      "attendee_id": "uuid",
      "status": "registered",
      "attendee_type": "minor"
    }
  ],
  "current_attendance": 17,
  "attendance_cap": 15
}
```

#### Enhanced: Check Event RSVP
```
POST /check-event-rsvp
```

**Request**:
```json
{
  "event_id": "string",
  "email": "string" // optional, if provided checks for this volunteer and their minors
}
```

**Response**:
```json
{
  "success": true,
  "rsvp_count": 25,
  "user_registered": true,
  "user_rsvps": [
    {
      "attendee_id": "volunteer@example.com",
      "attendee_type": "volunteer",
      "first_name": "John",
      "last_name": "Doe",
      "created_at": "2025-01-14T10:00:00Z"
    },
    {
      "attendee_id": "uuid",
      "attendee_type": "minor",
      "first_name": "Jane",
      "last_name": "Doe",
      "age": 12,
      "created_at": "2025-01-14T10:00:00Z"
    }
  ]
}
```

#### New: Cancel Event RSVP
```
POST /cancel-event-rsvp
```

**Request**:
```json
{
  "session_token": "string",
  "event_id": "string",
  "attendee_id": "string", // email for volunteer, minor_id for minor
  "attendee_type": "volunteer" | "minor"
}
```

**Response**:
```json
{
  "success": true,
  "message": "RSVP cancelled successfully",
  "attendee_id": "string",
  "attendee_type": "string",
  "hours_before_event": 48.5
}
```

## Data Models

### Enhanced RSVP Record Schema

The `event_rsvps` table will be enhanced to support both volunteer and minor attendees:

```json
{
  "event_id": "string (partition key)",
  "attendee_id": "string (sort key)", // email for volunteers, minor_id for minors
  "attendee_type": "volunteer" | "minor",
  "first_name": "string",
  "last_name": "string",
  "email": "string", // volunteer's email (for both volunteer and minor RSVPs)
  "guardian_email": "string", // only for minor RSVPs
  "age": "number", // only for minor RSVPs, captured at RSVP time
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp",
  "submission_date": "ISO8601 timestamp"
}
```

**Key Design Decisions**:
- `attendee_id` is the sort key: email for volunteers, minor_id for minors
- This allows unique identification of each attendee per event
- `email` field always contains the volunteer's email (for queries)
- `guardian_email` is populated for minor RSVPs to support queries
- Minor information (name, age) is denormalized to preserve data if minor is deleted
- Backward compatible: existing records have `attendee_id` = `email` and `attendee_type` = "volunteer"

### GSI for Guardian Queries

Add a Global Secondary Index to efficiently query all RSVPs by guardian:

```json
{
  "index_name": "guardian-email-index",
  "partition_key": "guardian_email",
  "sort_key": "created_at",
  "projection": "ALL"
}
```

This enables efficient queries like "show all RSVPs for this volunteer and their minors".

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After analyzing all acceptance criteria, several redundancies were identified:

**Redundant Properties**:
- 1.2 and 9.1 are identical (volunteers with zero minors use single-person interface)
- 5.2 and 5.3 are subsumed by 5.1 (returning all RSVPs includes both volunteer and minor RSVPs)
- 1.3 and 1.4 can be combined into a single property about displaying complete attendee information

**Combined Properties**:
- Capacity enforcement (4.2 and 4.3) can be combined into one property about capacity validation
- RSVP cancellation (6.1 and 6.2) can be combined into one property about removing RSVP records
- Data persistence (7.1, 7.2, 7.3) can be combined into one property about denormalized data preservation

The following correctness properties represent the unique, non-redundant validation requirements:

### Correctness Properties

Property 1: Multi-person UI conditional rendering
*For any* authenticated volunteer, if they have one or more minors, the RSVP interface should display a multi-person selector showing the volunteer and all their minors with complete information (names and ages)
**Validates: Requirements 1.1, 1.3, 1.4**

Property 2: Single-person UI preservation
*For any* authenticated volunteer with zero minors, the RSVP interface should display the existing single-person RSVP form without multi-person selection UI
**Validates: Requirements 1.2, 9.1, 9.2, 9.3**

Property 3: Non-empty attendee selection
*For any* RSVP submission with one or more attendees selected, the system should accept the selection and proceed with processing
**Validates: Requirements 2.1**

Property 4: Individual RSVP record creation
*For any* RSVP submission with N attendees, the system should create exactly N individual RSVP records in the database
**Validates: Requirements 2.3**

Property 5: Minor RSVP data completeness
*For any* RSVP record where attendee_type is "minor", the record should contain guardian_email, first_name, last_name, age, and submission timestamp
**Validates: Requirements 2.4, 2.5**

Property 6: Volunteer RSVP data completeness
*For any* RSVP record where attendee_type is "volunteer", the record should contain email, first_name, last_name, and submission timestamp
**Validates: Requirements 2.5**

Property 7: Duplicate attendee filtering
*For any* RSVP submission, if an attendee is already registered for the event, that attendee should be excluded from the new submission
**Validates: Requirements 3.1, 3.3**

Property 8: Duplicate rejection error message
*For any* RSVP submission rejected due to all attendees being duplicates, the error message should list which attendees are already registered
**Validates: Requirements 3.5**

Property 9: Capacity enforcement
*For any* RSVP submission, if current_attendance + requested_attendees > capacity, the entire submission should be rejected; otherwise all attendees should be registered
**Validates: Requirements 4.2, 4.3**

Property 10: Capacity error message
*For any* RSVP submission rejected due to capacity, the error message should include the remaining capacity
**Validates: Requirements 4.4**

Property 11: Equal attendee counting
*For any* event capacity calculation, each attendee (whether volunteer or minor) should contribute exactly 1 to the attendance count
**Validates: Requirements 4.5**

Property 12: Guardian RSVP query completeness
*For any* volunteer email, querying RSVPs for an event should return all RSVP records where email matches (volunteer RSVPs) or guardian_email matches (minor RSVPs)
**Validates: Requirements 5.1, 5.2, 5.3, 7.4**

Property 13: RSVP display information
*For any* RSVP record displayed to a user, the output should include attendee name, attendee type (volunteer or minor), and submission timestamp
**Validates: Requirements 5.4, 5.5**

Property 14: RSVP cancellation removes record
*For any* RSVP cancellation request by an authenticated volunteer, if the RSVP belongs to the volunteer or their minor, the RSVP record should be removed from the database
**Validates: Requirements 6.1, 6.2**

Property 15: Unauthorized cancellation rejection
*For any* RSVP cancellation request, if the RSVP does not belong to the requesting volunteer or their minors, the cancellation should be rejected
**Validates: Requirements 6.3**

Property 16: Cancellation attendance decrement
*For any* successful RSVP cancellation, the event's attendance count should decrease by exactly 1
**Validates: Requirements 6.4**

Property 17: Cancellation confirmation
*For any* successful RSVP cancellation, the response should confirm the cancellation with attendee_id and attendee_type
**Validates: Requirements 6.5**

Property 18: Denormalized data persistence
*For any* RSVP record, the attendee information (name, age for minors) should be stored in the RSVP record itself, and should remain accessible even if the minor profile or guardian account is deleted
**Validates: Requirements 7.1, 7.2, 7.3**

Property 19: Backward compatible request processing
*For any* RSVP request in the legacy single-person format (with first_name, last_name fields), the system should process it correctly as a single-attendee multi-person RSVP
**Validates: Requirements 8.1**

Property 20: Backward compatible response format
*For any* RSVP API response, the response should include all fields expected by existing clients (success, message, event_id, email, current_attendance, attendance_cap)
**Validates: Requirements 8.2**

Property 21: Legacy record interpretation
*For any* existing RSVP record without attendee_type field, the system should interpret it as a volunteer RSVP with attendee_id equal to email
**Validates: Requirements 8.4, 8.5**

## Error Handling

### Validation Errors

1. **Empty Attendee Selection**
   - Trigger: User submits RSVP with no attendees selected
   - Response: 400 Bad Request with message "Please select at least one attendee"
   - UI: Show inline error message, keep form open

2. **All Attendees Already Registered**
   - Trigger: All selected attendees have existing RSVPs
   - Response: 400 Bad Request with list of already-registered attendees
   - UI: Show which attendees are registered, suggest canceling to re-register

3. **Capacity Exceeded**
   - Trigger: Requested attendees would exceed event capacity
   - Response: 400 Bad Request with remaining capacity
   - UI: Show remaining spots, allow user to reduce selection

4. **Invalid Session**
   - Trigger: Session token expired or invalid
   - Response: 401 Unauthorized
   - UI: Redirect to login with return URL

5. **Unauthorized Cancellation**
   - Trigger: User attempts to cancel RSVP they don't own
   - Response: 403 Forbidden
   - UI: Show error message, refresh RSVP status

### System Errors

1. **Database Unavailable**
   - Fallback: Show cached RSVP count if available
   - UI: Display generic capacity message, allow RSVP attempt
   - Retry: Exponential backoff for status checks

2. **Partial RSVP Failure**
   - Scenario: Some attendees registered, others failed
   - Response: 207 Multi-Status with per-attendee results
   - UI: Show which attendees succeeded, allow retry for failures

3. **Minors List Fetch Failure**
   - Fallback: Show single-person RSVP interface
   - UI: Display notice that minors couldn't be loaded
   - Allow: User can still RSVP for themselves

## Testing Strategy

### Unit Testing

Unit tests will verify specific examples and edge cases:

1. **UI Rendering Tests**
   - Volunteer with 0 minors shows single-person UI
   - Volunteer with 1 minor shows multi-person UI with 2 options
   - Volunteer with 3 minors shows multi-person UI with 4 options
   - Already-registered attendees are disabled in selector

2. **Validation Tests**
   - Empty attendee list is rejected
   - Single attendee is accepted
   - Multiple attendees are accepted
   - Duplicate attendees are filtered

3. **Capacity Tests**
   - Submission within capacity succeeds
   - Submission at exact capacity succeeds
   - Submission exceeding capacity fails
   - Capacity calculation counts all attendee types equally

4. **Authorization Tests**
   - Volunteer can cancel own RSVP
   - Volunteer can cancel minor's RSVP
   - Volunteer cannot cancel other volunteer's RSVP

### Property-Based Testing

Property-based tests will verify universal properties across all inputs using **fast-check** (JavaScript property testing library). Each test will run a minimum of 100 iterations.

**Test Configuration**:
```javascript
import fc from 'fast-check';

// Configure to run 100+ iterations per property
const testConfig = { numRuns: 100 };
```

**Property Test Implementations**:

Each property-based test will be tagged with a comment explicitly referencing the correctness property from this design document using the format:
`// Feature: multi-person-event-rsvp, Property N: [property text]`

The property tests will generate random:
- Volunteers with varying numbers of minors (0-5)
- Event capacities (5-50)
- Current attendance levels (0 to capacity)
- Attendee selections (various combinations)
- Existing RSVP states
- Legacy and new format requests

Tests will verify that the properties hold across all generated inputs, catching edge cases that unit tests might miss.

## Implementation Notes

### Frontend Considerations

1. **Progressive Enhancement**: The multi-person UI should load after checking for minors, with a loading state
2. **Accessibility**: Checkboxes must have proper labels, keyboard navigation must work
3. **Mobile Responsive**: Attendee list should stack vertically on small screens
4. **Performance**: Minors list should be cached for the session to avoid repeated API calls

### Backend Considerations

1. **Atomic Operations**: Use DynamoDB transactions for multi-record RSVP submissions
2. **Idempotency**: Support retry of failed submissions without creating duplicates
3. **Rate Limiting**: Prevent abuse of RSVP submission endpoint
4. **Audit Trail**: Log all RSVP submissions and cancellations with timestamps

### Database Migration

1. **Add New Fields**: Add `attendee_type`, `attendee_id`, `guardian_email`, `age` to schema
2. **Backfill Existing Records**: Set `attendee_type` = "volunteer" and `attendee_id` = `email` for existing records
3. **Create GSI**: Add `guardian-email-index` for efficient guardian queries
4. **No Downtime**: Migration can be done online, new code handles both old and new formats

### Deployment Strategy

1. **Phase 1**: Deploy backend changes with backward compatibility
2. **Phase 2**: Migrate existing RSVP records
3. **Phase 3**: Deploy frontend changes (feature flag controlled)
4. **Phase 4**: Enable feature for all users
5. **Phase 5**: Remove legacy code paths after monitoring period
