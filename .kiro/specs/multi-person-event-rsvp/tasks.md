# Implementation Plan

- [x] 1. Update database schema and create migration
  - Add new fields to event_rsvps table schema: attendee_type, attendee_id (as new sort key), guardian_email, age
  - Create GSI for guardian_email queries
  - Write migration script to backfill existing records with attendee_type="volunteer" and attendee_id=email
  - _Requirements: 7.5, 8.3_

- [x] 2. Enhance backend API for multi-person RSVP submission
- [x] 2.1 Update submit-event-rsvp Lambda to handle both legacy and new request formats
  - Parse legacy format (first_name, last_name) and convert to single-attendee format
  - Parse new format with attendees array
  - Validate attendee selection is not empty
  - _Requirements: 2.1, 2.2, 8.1_

- [ ]* 2.2 Write property test for request format handling
  - **Property 19: Backward compatible request processing**
  - **Validates: Requirements 8.1**

- [x] 2.3 Implement duplicate attendee detection and filtering
  - Query existing RSVPs for each attendee
  - Filter out already-registered attendees
  - Return error if all attendees are duplicates
  - _Requirements: 3.1, 3.2, 3.3_

- [ ]* 2.4 Write property test for duplicate filtering
  - **Property 7: Duplicate attendee filtering**
  - **Validates: Requirements 3.1, 3.3**

- [x] 2.5 Implement capacity validation for multi-person submissions
  - Count current attendance
  - Validate requested attendees don't exceed remaining capacity
  - Count volunteers and minors equally
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [ ]* 2.6 Write property test for capacity enforcement
  - **Property 9: Capacity enforcement**
  - **Validates: Requirements 4.2, 4.3**

- [ ]* 2.7 Write property test for equal attendee counting
  - **Property 11: Equal attendee counting**
  - **Validates: Requirements 4.5**

- [x] 2.8 Implement atomic multi-record RSVP creation
  - Use DynamoDB TransactWriteItems for atomic batch insert
  - Create individual RSVP record for each attendee
  - Store complete attendee information (denormalized)
  - Set guardian_email for minor RSVPs
  - _Requirements: 2.3, 2.4, 2.5, 7.5_

- [ ]* 2.9 Write property test for individual record creation
  - **Property 4: Individual RSVP record creation**
  - **Validates: Requirements 2.3**

- [ ]* 2.10 Write property test for minor data completeness
  - **Property 5: Minor RSVP data completeness**
  - **Validates: Requirements 2.4, 2.5**

- [ ]* 2.11 Write property test for volunteer data completeness
  - **Property 6: Volunteer RSVP data completeness**
  - **Validates: Requirements 2.5**

- [x] 2.12 Implement error responses with detailed information
  - Return list of duplicate attendees when applicable
  - Return remaining capacity when capacity exceeded
  - Ensure backward compatible response format
  - _Requirements: 3.5, 4.4, 8.2_

- [ ]* 2.13 Write property test for error messages
  - **Property 8: Duplicate rejection error message**
  - **Validates: Requirements 3.5**
  - **Property 10: Capacity error message**
  - **Validates: Requirements 4.4**

- [ ]* 2.14 Write property test for backward compatible responses
  - **Property 20: Backward compatible response format**
  - **Validates: Requirements 8.2**

- [x] 3. Enhance check-event-rsvp API for guardian queries
- [x] 3.1 Update check-event-rsvp Lambda to query by guardian email
  - Query RSVPs where email matches (volunteer RSVPs)
  - Query RSVPs using guardian-email-index (minor RSVPs)
  - Combine and return all RSVPs for the volunteer and their minors
  - _Requirements: 5.1, 5.2, 5.3, 7.4_

- [ ]* 3.2 Write property test for guardian query completeness
  - **Property 12: Guardian RSVP query completeness**
  - **Validates: Requirements 5.1, 5.2, 5.3, 7.4**

- [x] 3.3 Format RSVP response with complete attendee information
  - Include attendee_id, attendee_type, first_name, last_name
  - Include age for minor attendees
  - Include submission timestamp
  - _Requirements: 5.4, 5.5_

- [ ]* 3.4 Write property test for RSVP display information
  - **Property 13: RSVP display information**
  - **Validates: Requirements 5.4, 5.5**

- [x] 3.5 Handle legacy RSVP records without attendee_type
  - Default attendee_type to "volunteer" if missing
  - Default attendee_id to email if missing
  - _Requirements: 8.4, 8.5_

- [ ]* 3.6 Write property test for legacy record interpretation
  - **Property 21: Legacy record interpretation**
  - **Validates: Requirements 8.4, 8.5**

- [x] 4. Implement cancel-event-rsvp API endpoint
- [x] 4.1 Create new Lambda function for RSVP cancellation
  - Validate session token
  - Accept attendee_id and attendee_type parameters
  - Verify RSVP belongs to requesting volunteer or their minor
  - Delete RSVP record from database
  - _Requirements: 6.1, 6.2, 6.3_

- [ ]* 4.2 Write property test for RSVP cancellation
  - **Property 14: RSVP cancellation removes record**
  - **Validates: Requirements 6.1, 6.2**

- [ ]* 4.3 Write property test for unauthorized cancellation
  - **Property 15: Unauthorized cancellation rejection**
  - **Validates: Requirements 6.3**

- [x] 4.2 Implement attendance count decrement
  - Ensure cancellation decrements event attendance by 1
  - _Requirements: 6.4_

- [ ]* 4.5 Write property test for attendance decrement
  - **Property 16: Cancellation attendance decrement**
  - **Validates: Requirements 6.4**

- [x] 4.6 Return cancellation confirmation
  - Include attendee_id, attendee_type in response
  - Calculate hours_before_event if event time available
  - _Requirements: 6.5_

- [ ]* 4.7 Write property test for cancellation confirmation
  - **Property 17: Cancellation confirmation**
  - **Validates: Requirements 6.5**

- [x] 5. Update frontend RSVP widget initialization
- [x] 5.1 Add minors list fetching on widget initialization
  - Check if user is authenticated
  - Fetch minors list via minors-list API
  - Cache minors list in session storage
  - _Requirements: 1.1, 1.2_

- [x] 5.2 Implement conditional UI rendering logic
  - If minors.length > 0, render multi-person selector
  - If minors.length === 0, render existing single-person form
  - _Requirements: 1.2, 9.1, 9.2, 9.3_

- [ ]* 5.3 Write property test for UI conditional rendering
  - **Property 1: Multi-person UI conditional rendering**
  - **Validates: Requirements 1.1, 1.3, 1.4**
  - **Property 2: Single-person UI preservation**
  - **Validates: Requirements 1.2, 9.1, 9.2, 9.3**

- [x] 6. Create multi-person attendee selector component
- [x] 6.1 Build attendee list UI with checkboxes
  - Display volunteer with name and email
  - Display each minor with name and age
  - Add checkbox for each attendee
  - Show selected count and remaining capacity
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 6.2 Implement attendee selection state management
  - Track selected attendees in array
  - Update selected count on checkbox change
  - Validate at least one attendee selected before submission
  - _Requirements: 1.5, 2.1, 2.2_

- [ ]* 6.3 Write property test for non-empty selection
  - **Property 3: Non-empty attendee selection**
  - **Validates: Requirements 2.1**

- [x] 6.4 Disable already-registered attendees
  - Fetch existing RSVPs on component mount
  - Disable checkboxes for already-registered attendees
  - Show "Already Registered" badge for disabled attendees
  - _Requirements: 3.1_

- [x] 7. Implement multi-person RSVP submission handler
- [x] 7.1 Build attendees array from selection
  - Map selected checkboxes to attendee objects
  - Include type, id, name, and age (for minors)
  - _Requirements: 2.3_

- [x] 7.2 Submit multi-person RSVP request
  - Call enhanced submit-event-rsvp API with attendees array
  - Handle success response with per-attendee results
  - Handle error responses (duplicates, capacity, validation)
  - _Requirements: 2.1, 3.5, 4.4_

- [x] 7.3 Update UI based on submission result
  - Show success message with registered attendees
  - Show error message with specific details
  - Refresh RSVP status and attendance count
  - _Requirements: 2.3, 3.5, 4.4_

- [x] 8. Implement multi-person RSVP cancellation
- [x] 8.1 Add cancellation UI for each registered attendee
  - Show "Cancel" button next to each registered attendee
  - Confirm cancellation with dialog
  - _Requirements: 6.1, 6.2_

- [x] 8.2 Implement individual cancellation handler
  - Call cancel-event-rsvp API with attendee_id and attendee_type
  - Handle success and error responses
  - Update UI to remove cancelled attendee
  - Refresh attendance count
  - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [x] 9. Add data persistence verification
- [ ]* 9.1 Write property test for denormalized data persistence
  - **Property 18: Denormalized data persistence**
  - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Deploy and test in staging environment
  - Deploy Lambda functions to staging
  - Run database migration on staging
  - Test multi-person RSVP flow end-to-end
  - Test backward compatibility with existing RSVPs
  - Test cancellation flow
  - Verify capacity enforcement
  - _Requirements: All_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
