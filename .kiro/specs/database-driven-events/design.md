# Database-Driven Events System Design

## Overview

The database-driven events system replaces the current file-based event management with a comprehensive solution that stores event data in DynamoDB, provides APIs for event management, and automatically generates Hugo markdown files during deployment. This system will provide better data consistency, enable proper chronological sorting, and create a foundation for advanced event management features.

## Architecture

The system follows a three-tier architecture:

1. **Data Layer**: DynamoDB tables for events, with relationships to existing RSVP data
2. **API Layer**: Lambda functions providing RESTful endpoints for event management
3. **Presentation Layer**: Hugo-generated static pages with React components for dynamic functionality

### High-Level Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Admin UI      │    │  Public Website │    │  API Clients    │
│   (React)       │    │   (Hugo/React)  │    │   (External)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │      API Gateway          │
                    │   (Event Management)      │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │    Lambda Functions       │
                    │  (CRUD + Hugo Generator)  │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      DynamoDB             │
                    │   (Events + RSVPs)        │
                    └───────────────────────────┘
```

## Components and Interfaces

### 1. Events DynamoDB Table

**Table Name**: `events`

**Primary Key**: 
- Partition Key: `event_id` (String)

**Attributes**:
- `event_id`: Unique identifier (e.g., "brooke-road-cleanup-february-2026")
- `title`: Event title
- `description`: Event description
- `start_time`: ISO 8601 datetime string
- `end_time`: ISO 8601 datetime string
- `location`: Event location object
  - `name`: Location name
  - `address`: Full address
  - `coordinates`: Optional lat/lng
- `attendance_cap`: Maximum attendees (Number)
- `status`: Event status (active, cancelled, completed, archived)
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp
- `hugo_config`: Hugo-specific configuration
  - `image`: Featured image path
  - `tags`: Array of tags
  - `preheader_is_light`: Boolean
- `metadata`: Additional event metadata

**Global Secondary Indexes**:
- `status-start_time-index`: Query events by status and sort by start time
- `start_time-index`: Query all events sorted by start time

### 2. Volunteers DynamoDB Table

**Table Name**: `volunteers`

**Primary Key**:
- Partition Key: `email` (String)

**Attributes**:
- `email`: Primary identifier
- `first_name`: Volunteer's first name
- `last_name`: Volunteer's last name
- `full_name`: Computed full name
- `phone`: Phone number (optional)
- `emergency_contact`: Emergency contact info (optional)
- `dietary_restrictions`: Dietary restrictions (optional)
- `volunteer_experience`: Experience level (optional)
- `how_did_you_hear`: How they heard about organization (optional)
- `created_at`: When volunteer first registered
- `updated_at`: Last profile update
- `profile_complete`: Boolean indicating if profile is complete
- `communication_preferences`: Email/SMS preferences
- `volunteer_metrics`: Aggregated metrics
  - `total_rsvps`: Total number of RSVPs
  - `total_cancellations`: Total cancellations across all events
  - `total_no_shows`: Total no-shows across all events
  - `total_attended`: Total events attended
  - `first_event_date`: Date of first event participation
  - `last_event_date`: Date of most recent event

### 3. RSVPs DynamoDB Table (Simplified)

**Table Name**: `rsvps`

**Primary Key**:
- Partition Key: `event_id` (String)
- Sort Key: `email` (String)

**Attributes**:
- `event_id`: Links to Event.event_id
- `email`: Links to Volunteer.email
- `status`: 'active' | 'cancelled' | 'no_show' | 'attended'
- `created_at`: When RSVP was created
- `updated_at`: Last status change
- `cancelled_at`: When cancelled (if applicable)
- `hours_before_event`: Hours before event when cancelled (for analytics)
- `additional_comments`: Event-specific comments from volunteer

**Global Secondary Indexes**:
- `email-created_at-index`: Query RSVPs by volunteer, sorted by creation date
- `status-index`: Query RSVPs by status for reporting

### 4. Event Management API

**Base URL**: `/api/events`

**Event Endpoints**:
- `GET /api/events` - List events with filtering and pagination
- `GET /api/events/{event_id}` - Get specific event details
- `GET /api/events/{event_id}/rsvps` - Get RSVPs for specific event with volunteer details
- `POST /api/events` - Create new event (admin only)
- `PUT /api/events/{event_id}` - Update event (admin only)
- `DELETE /api/events/{event_id}` - Delete event (admin only)
- `POST /api/events/bulk` - Bulk operations (admin only)
- `GET /api/events/export` - Export event data

**Volunteer Management Endpoints**:
- `GET /api/volunteers/{email}` - Get volunteer profile
- `PUT /api/volunteers/{email}` - Update volunteer profile
- `GET /api/volunteers/{email}/rsvps` - Get volunteer's RSVP history with event details
- `GET /api/volunteers/export` - Export volunteer data (admin only)

**Data Joins**:
- Dashboard queries join RSVPs → Volunteers → Events for complete information
- Event RSVP lists join RSVPs → Volunteers for attendee information
- Volunteer profiles include aggregated metrics from RSVP history

### 5. Hugo Generator Service

**Purpose**: Convert database events to Hugo markdown files

**Trigger**: 
- Deployment pipeline
- Event CRUD operations (optional real-time updates)

**Output**: 
- Markdown files in `content/en/events/`
- Proper Hugo frontmatter
- Preserved shortcodes and content structure

### 6. Admin Interface

**Technology**: React SPA integrated into existing volunteer dashboard

**Features**:
- Event creation and editing forms
- Event list with filtering and sorting
- Volunteer management and profiles
- Bulk operations
- Export functionality
- Event status management
- Volunteer analytics and reporting

## Data Models

### Event Model

```typescript
interface Event {
  event_id: string;
  title: string;
  description: string;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  location: {
    name: string;
    address: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  attendance_cap: number;
  status: 'active' | 'cancelled' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
  hugo_config: {
    image?: string;
    tags: string[];
    preheader_is_light: boolean;
  };
  metadata: Record<string, any>;
}
```

### Volunteer Model

```typescript
interface Volunteer {
  email: string; // Primary key
  first_name: string;
  last_name: string;
  full_name: string;
  phone?: string;
  emergency_contact?: string;
  dietary_restrictions?: string;
  volunteer_experience?: string;
  how_did_you_hear?: string;
  created_at: string;
  updated_at: string;
  profile_complete: boolean;
  communication_preferences: {
    email_notifications: boolean;
    sms_notifications: boolean;
  };
  volunteer_metrics: {
    total_rsvps: number;
    total_cancellations: number;
    total_no_shows: number;
    total_attended: number;
    first_event_date?: string;
    last_event_date?: string;
  };
}
```

### RSVP Model (Normalized)

```typescript
interface RSVP {
  // Primary keys
  event_id: string;        // Links to Event.event_id
  email: string;           // Links to Volunteer.email
  
  // RSVP status and lifecycle
  status: 'active' | 'cancelled' | 'no_show' | 'attended';
  created_at: string;
  updated_at: string;
  cancelled_at?: string;   // When RSVP was cancelled
  hours_before_event?: number; // Hours before event when cancelled
  additional_comments?: string; // Event-specific comments
}
```

### Dashboard View Model (Joined Data)

```typescript
interface VolunteerDashboardRSVP {
  // From RSVP table
  event_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  
  // From Event table (joined)
  event_title: string;
  event_start_time: string;
  event_end_time: string;
  event_location: string;
  event_status: string;
  
  // From Volunteer table (joined)
  volunteer_name: string;
  volunteer_email: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Event Creation Generates Unique IDs
*For any* valid event data submitted to the creation API, the system should generate a unique event_id and store the event in the database
**Validates: Requirements 1.2**

### Property 2: Event List Chronological Sorting
*For any* set of events retrieved from the database, they should be sorted chronologically by start_time when displayed
**Validates: Requirements 2.3, 3.2**

### Property 3: Event Update Consistency
*For any* event update operation, both the database record and the generated Hugo file should reflect the same updated information
**Validates: Requirements 1.4**

### Property 4: Event Deletion Cleanup
*For any* event deletion operation, both the database record and the associated Hugo file should be completely removed
**Validates: Requirements 1.5**

### Property 5: Data Type Integrity
*For any* event stored in the database, all fields should maintain their specified data types and constraints
**Validates: Requirements 2.1**

### Property 6: Query Filter Accuracy
*For any* combination of date range, status, and location filters, the query results should include only events that match all specified criteria
**Validates: Requirements 2.2**

### Property 7: Field Name Consistency
*For any* event accessed through different interfaces (API, dashboard, export), the field names and formats should be identical
**Validates: Requirements 2.4**

### Property 8: Data Validation on Updates
*For any* event update attempt with invalid data, the system should reject the update and preserve the existing valid data
**Validates: Requirements 2.5**

### Property 9: Date Format Consistency
*For any* event date displayed across different pages, the formatting should be consistent and properly localized
**Validates: Requirements 3.4**

### Property 10: Timezone Display Accuracy
*For any* event with timezone information, the displayed time should correctly reflect the local timezone
**Validates: Requirements 3.5**

### Property 11: Hugo Generation Completeness
*For any* active event in the database, the Hugo generator should create a corresponding valid markdown file with complete frontmatter
**Validates: Requirements 4.2**

### Property 12: Content Preservation During Generation
*For any* event with existing Hugo shortcodes, the regeneration process should preserve all custom formatting and shortcodes
**Validates: Requirements 4.4**

### Property 13: RSVP-Event Data Integrity
*For any* RSVP record, when joined with its corresponding event record, all event information should be current and consistent
**Validates: Requirements 5.1, 5.2**

### Property 14: RSVP Status Tracking Accuracy
*For any* RSVP status change (active → cancelled → reactivated), the status field and associated timestamps should accurately reflect the current state
**Validates: Requirements 5.1**

### Property 15: RSVP Dashboard Sorting
*For any* volunteer's RSVP list, when joined with event data, the events should be sorted by event start_time in chronological order
**Validates: Requirements 5.3**

### Property 16: Cascading Event Updates
*For any* event that is cancelled or rescheduled, RSVPs should maintain their link to the updated event record without data duplication
**Validates: Requirements 5.4**

### Property 17: RSVP Metrics Accuracy
*For any* volunteer, their cancellation_count and no_show_count should accurately reflect their historical behavior across all events
**Validates: Requirements 8.3**

### Property 16: Automatic Status Updates
*For any* event whose start_time has passed, the system should automatically update its status to 'completed'
**Validates: Requirements 6.1**

### Property 17: Event Categorization by Date
*For any* event list display, upcoming events should appear in the main section and past events should appear in the archive section
**Validates: Requirements 6.2**

### Property 18: API Authentication Enforcement
*For any* write operation to the Event API, authentication and authorization should be validated before processing
**Validates: Requirements 7.2**

### Property 19: API Response Consistency
*For any* API endpoint response, the JSON structure and error handling should follow consistent patterns
**Validates: Requirements 7.3**

### Property 20: Export Data Completeness
*For any* event data export, all requested fields should be included in the specified format (CSV or JSON)
**Validates: Requirements 8.1**

### Property 21: Analytics Calculation Accuracy
*For any* set of event and RSVP data, calculated metrics (attendance rates, cancellation rates) should be mathematically correct
**Validates: Requirements 8.3**

### Property 22: Historical Data Preservation
*For any* archived event, all associated RSVP data should remain accessible through proper joins
**Validates: Requirements 8.4**

## Error Handling

### Database Errors
- Connection failures: Retry with exponential backoff
- Validation errors: Return detailed error messages
- Constraint violations: Prevent data corruption

### API Errors
- Authentication failures: Return 401 with clear message
- Authorization failures: Return 403 with appropriate guidance
- Validation errors: Return 400 with field-specific errors
- Not found errors: Return 404 with helpful suggestions

### Hugo Generation Errors
- Template errors: Log detailed error and use fallback template
- File system errors: Retry with different permissions
- Validation errors: Generate error report for manual review

## Testing Strategy

### Unit Testing
- Database operations (CRUD functions)
- Date/time parsing and formatting
- Hugo template generation
- API endpoint validation
- Authentication and authorization logic

### Property-Based Testing
Using **fast-check** for JavaScript/TypeScript property-based testing:

- **Event Creation Properties**: Generate random valid event data and verify unique ID generation and proper storage
- **Sorting Properties**: Generate events with random dates and verify chronological sorting
- **Data Consistency Properties**: Generate event updates and verify database and file system consistency
- **Validation Properties**: Generate invalid event data and verify proper rejection
- **Date Formatting Properties**: Generate events with various date formats and verify consistent display
- **API Response Properties**: Generate various API requests and verify consistent response structures

### Integration Testing
- End-to-end event creation workflow
- Hugo generation pipeline
- RSVP-event linking functionality
- Admin interface operations
- Export functionality

### Performance Testing
- Database query performance with large datasets
- Hugo generation time with many events
- API response times under load
- Concurrent event operations

## Deployment Strategy

### Phase 1: Database Setup
1. Create Events DynamoDB table with indexes
2. Deploy event management Lambda functions
3. Set up API Gateway endpoints

### Phase 2: Hugo Integration
1. Deploy Hugo generator Lambda
2. Update deployment pipeline to trigger generation
3. Migrate existing events to database

### Phase 3: Admin Interface
1. Deploy admin interface components
2. Integrate with existing volunteer dashboard
3. Enable event management features

### Phase 4: Enhanced Features
1. Add bulk operations
2. Implement advanced filtering
3. Add analytics and reporting

## Migration Plan

### Existing Event Migration
1. **Parse existing markdown files** to extract event data
2. **Create database records** with proper data types
3. **Validate data integrity** and fix any inconsistencies
4. **Generate new markdown files** from database to verify consistency
5. **Update RSVP records** to link to new event structure

### Backward Compatibility
- Maintain existing URLs and file structure during transition
- Preserve all existing event data and RSVPs
- Ensure no disruption to current RSVP functionality