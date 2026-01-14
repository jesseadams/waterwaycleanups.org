# Multi-Person RSVP Cancellation Flow

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Multi-Person RSVP Selector UI                              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ☑ You (Volunteer)                        [Cancel] │    │
│  │   test@example.com                                 │    │
│  │   ✓ Already Registered                             │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ☑ Alice Smith (Minor)                    [Cancel] │    │
│  │   Age: 12                                          │    │
│  │   ✓ Already Registered                             │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ☐ Bob Smith (Minor)                                │    │
│  │   Age: 10                                          │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ User clicks [Cancel] button
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Confirmation Dialog                                         │
│                                                              │
│  Are you sure you want to cancel the registration for       │
│  Alice Smith (Minor)?                                        │
│                                                              │
│  This action cannot be undone.                               │
│                                                              │
│  [Cancel]  [OK]                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ User confirms
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  handleIndividualCancellation()                              │
│                                                              │
│  1. Hide previous messages                                  │
│  2. Call cancelIndividualRsvp()                             │
│  3. Handle response                                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  cancelIndividualRsvp()                                      │
│                                                              │
│  POST /cancel-event-rsvp                                    │
│  {                                                           │
│    session_token: "...",                                    │
│    event_id: "test-event-123",                              │
│    attendee_id: "minor-1",                                  │
│    attendee_type: "minor"                                   │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Lambda: lambda_event_rsvp_cancel.py                        │
│                                                              │
│  1. Validate session token                                  │
│  2. Verify RSVP ownership (guardian check for minors)       │
│  3. Delete RSVP record from DynamoDB                        │
│  4. Calculate hours_before_event                            │
│  5. Return confirmation                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Response                                                    │
│  {                                                           │
│    success: true,                                           │
│    message: "RSVP cancelled successfully",                  │
│    attendee_id: "minor-1",                                  │
│    attendee_type: "minor",                                  │
│    hours_before_event: 48.5                                 │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  UI Updates                                                  │
│                                                              │
│  1. Show success message:                                   │
│     "✅ Registration cancelled for Alice Smith (Minor)      │
│      (48.5 hours before event)"                             │
│                                                              │
│  2. Remove cancelled attendee from UI                       │
│                                                              │
│  3. Update RSVP count (decremented by 1)                    │
│                                                              │
│  4. Refresh multi-person selector                           │
│                                                              │
│  5. Auto-hide success message after 5 seconds               │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### Frontend (static/js/event-rsvp.js)

1. **buildMultiPersonSelectorHtml()**
   - Renders cancel buttons for registered attendees
   - Buttons only appear for already-registered attendees
   - Includes data attributes for attendee identification

2. **initializeMultiPersonSelector()**
   - Attaches click handlers to cancel buttons
   - Shows confirmation dialog
   - Manages button state during processing

3. **handleIndividualCancellation()**
   - Orchestrates the cancellation flow
   - Calls API
   - Updates UI based on response
   - Handles errors

4. **cancelIndividualRsvp()**
   - Makes POST request to API
   - Handles authentication
   - Returns parsed response

### Backend (terraform/lambda_event_rsvp_cancel.py)

1. **validate_session()**
   - Checks session token validity
   - Returns volunteer email

2. **verify_rsvp_ownership()**
   - Validates volunteer can cancel this RSVP
   - Checks guardian relationship for minors
   - Prevents unauthorized cancellations

3. **delete_rsvp_record()**
   - Removes RSVP from DynamoDB
   - Atomic operation

4. **calculate_hours_before_event()**
   - Calculates time until event
   - Returns hours for user feedback

## Error Handling

### Frontend Errors
- Invalid session → "Not authenticated. Please log in and try again."
- API failure → "Failed to cancel RSVP. Please try again."
- Network error → Generic error message with retry option

### Backend Errors
- Invalid session → 401 Unauthorized
- Not RSVP owner → 403 Forbidden
- RSVP not found → 404 Not Found
- Database error → 500 Internal Server Error

## Security

1. **Authentication Required**
   - Session token validated on every request
   - Expired sessions rejected

2. **Authorization Checks**
   - Volunteers can only cancel own RSVPs
   - Volunteers can only cancel their minors' RSVPs
   - Cannot cancel other volunteers' RSVPs

3. **Data Validation**
   - attendee_type must be "volunteer" or "minor"
   - All required parameters validated
   - SQL injection prevention (using DynamoDB)

## Performance

1. **Optimistic UI Updates**
   - UI updates immediately after API success
   - No unnecessary re-renders

2. **Efficient API Calls**
   - Single API call per cancellation
   - Minimal payload size

3. **Caching**
   - Minors list cached in session storage
   - Reduces API calls on re-render

## Accessibility

1. **Keyboard Navigation**
   - Cancel buttons are focusable
   - Confirmation dialog accessible

2. **Screen Readers**
   - Buttons have descriptive labels
   - Success/error messages announced

3. **Visual Feedback**
   - Button state changes (disabled during processing)
   - Clear success/error messages
   - Color-coded buttons (red for destructive action)
