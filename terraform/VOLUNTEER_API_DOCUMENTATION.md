# Volunteer Management API Documentation

This document describes the volunteer management endpoints in the database-driven events system.

## Base URL

```
https://{api-gateway-id}.execute-api.{region}.amazonaws.com/{stage}
```

## Authentication

Currently, the volunteer endpoints use basic authentication. Future versions will implement proper authentication and authorization.

## Endpoints

### 1. List Volunteers

**GET** `/volunteers`

Retrieve a list of all volunteers with optional filtering and pagination.

#### Query Parameters

- `limit` (integer, optional): Maximum number of volunteers to return (default: 50, max: 100)
- `last_key` (string, optional): Pagination key for retrieving next page
- `profile_complete` (boolean, optional): Filter by profile completeness
- `email_notifications` (boolean, optional): Filter by email notification preference
- `include_metrics` (boolean, optional): Include calculated volunteer metrics (default: false)

#### Response

```json
{
  "volunteers": [
    {
      "email": "john.doe@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "full_name": "John Doe",
      "phone": "555-123-4567",
      "emergency_contact": "Jane Doe - 555-987-6543",
      "dietary_restrictions": "None",
      "volunteer_experience": "First time volunteer",
      "how_did_you_hear": "Website",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z",
      "profile_complete": true,
      "communication_preferences": {
        "email_notifications": true,
        "sms_notifications": false
      },
      "volunteer_metrics": {
        "total_rsvps": 5,
        "total_cancellations": 1,
        "total_no_shows": 0,
        "total_attended": 4,
        "first_event_date": "2024-01-15T10:00:00Z",
        "last_event_date": "2024-12-15T10:00:00Z"
      }
    }
  ],
  "count": 1,
  "last_key": "eyJlbWFpbCI6ImpvaG4uZG9lQGV4YW1wbGUuY29tIn0="
}
```

### 2. Get Volunteer Profile

**GET** `/volunteers/{email}`

Retrieve a specific volunteer's profile by email address.

#### Path Parameters

- `email` (string, required): The volunteer's email address (URL encoded)

#### Response

```json
{
  "email": "john.doe@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "full_name": "John Doe",
  "phone": "555-123-4567",
  "emergency_contact": "Jane Doe - 555-987-6543",
  "dietary_restrictions": "None",
  "volunteer_experience": "First time volunteer",
  "how_did_you_hear": "Website",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z",
  "profile_complete": true,
  "communication_preferences": {
    "email_notifications": true,
    "sms_notifications": false
  },
  "volunteer_metrics": {
    "total_rsvps": 5,
    "total_cancellations": 1,
    "total_no_shows": 0,
    "total_attended": 4,
    "first_event_date": "2024-01-15T10:00:00Z",
    "last_event_date": "2024-12-15T10:00:00Z"
  }
}
```

### 3. Update Volunteer Profile

**PUT** `/volunteers/{email}`

Create or update a volunteer's profile.

#### Path Parameters

- `email` (string, required): The volunteer's email address (URL encoded)

#### Request Body

```json
{
  "first_name": "John",
  "last_name": "Doe",
  "phone": "555-123-4567",
  "emergency_contact": "Jane Doe - 555-987-6543",
  "dietary_restrictions": "None",
  "volunteer_experience": "First time volunteer",
  "how_did_you_hear": "Website",
  "communication_preferences": {
    "email_notifications": true,
    "sms_notifications": false
  }
}
```

#### Response

```json
{
  "success": true,
  "message": "Volunteer profile updated successfully",
  "volunteer": {
    "email": "john.doe@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "full_name": "John Doe",
    "phone": "555-123-4567",
    "emergency_contact": "Jane Doe - 555-987-6543",
    "dietary_restrictions": "None",
    "volunteer_experience": "First time volunteer",
    "how_did_you_hear": "Website",
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-01-15T10:00:00Z",
    "profile_complete": true,
    "communication_preferences": {
      "email_notifications": true,
      "sms_notifications": false
    },
    "volunteer_metrics": {
      "total_rsvps": 0,
      "total_cancellations": 0,
      "total_no_shows": 0,
      "total_attended": 0,
      "first_event_date": null,
      "last_event_date": null
    }
  }
}
```

### 4. Get Volunteer RSVP History

**GET** `/volunteers/{email}/rsvps`

Retrieve a volunteer's RSVP history with event details.

#### Path Parameters

- `email` (string, required): The volunteer's email address (URL encoded)

#### Query Parameters

- `status` (string, optional): Filter by RSVP status (active, cancelled, no_show, attended)
- `limit` (integer, optional): Maximum number of RSVPs to return (default: 50, max: 100)

#### Response

```json
{
  "success": true,
  "email": "john.doe@example.com",
  "rsvps": [
    {
      "event_id": "brooke-road-cleanup-february-2026",
      "email": "john.doe@example.com",
      "status": "active",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z",
      "cancelled_at": null,
      "hours_before_event": null,
      "additional_comments": "Looking forward to helping!",
      "event_title": "Brooke Road Cleanup",
      "event_description": "Community cleanup event at Brooke Road",
      "event_start_time": "2026-02-15T09:00:00Z",
      "event_end_time": "2026-02-15T12:00:00Z",
      "event_location": {
        "name": "Brooke Road",
        "address": "123 Brooke Road, Stafford, VA"
      },
      "event_status": "active",
      "event_attendance_cap": 50,
      "event_date": "2026-02-15T09:00:00Z",
      "event_display_date": "February 15, 2026 at 09:00 AM",
      "event_sort_timestamp": 1739620800
    }
  ],
  "summary": {
    "total_rsvps": 1,
    "total_cancellations": 0,
    "total_no_shows": 0,
    "total_attended": 0,
    "total_all_rsvps": 1
  },
  "count": 1
}
```

### 5. Export Volunteer Data

**GET** `/volunteers/export`

Export volunteer data in CSV or JSON format.

#### Query Parameters

- `format` (string, optional): Export format - "json" or "csv" (default: "json")
- `include_metrics` (boolean, optional): Include calculated volunteer metrics (default: true)
- `profile_complete` (boolean, optional): Filter by profile completeness
- `email_notifications` (boolean, optional): Filter by email notification preference

#### Response (JSON format)

```json
{
  "success": true,
  "volunteers": [
    {
      "email": "john.doe@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "full_name": "John Doe",
      "phone": "555-123-4567",
      "emergency_contact": "Jane Doe - 555-987-6543",
      "dietary_restrictions": "None",
      "volunteer_experience": "First time volunteer",
      "how_did_you_hear": "Website",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z",
      "profile_complete": true,
      "communication_preferences": {
        "email_notifications": true,
        "sms_notifications": false
      },
      "volunteer_metrics": {
        "total_rsvps": 5,
        "total_cancellations": 1,
        "total_no_shows": 0,
        "total_attended": 4,
        "first_event_date": "2024-01-15T10:00:00Z",
        "last_event_date": "2024-12-15T10:00:00Z"
      }
    }
  ],
  "count": 1,
  "exported_at": "2024-01-15T10:00:00Z",
  "include_metrics": true
}
```

#### Response (CSV format)

Returns CSV file with headers:
- Content-Type: text/csv
- Content-Disposition: attachment; filename="volunteers_export_YYYYMMDD_HHMMSS.csv"

## Data Models

### Volunteer Profile

```typescript
interface Volunteer {
  email: string;                    // Primary key
  first_name: string;
  last_name: string;
  full_name: string;               // Computed: first_name + last_name
  phone?: string;
  emergency_contact?: string;
  dietary_restrictions?: string;
  volunteer_experience?: string;
  how_did_you_hear?: string;
  created_at: string;              // ISO 8601 timestamp
  updated_at: string;              // ISO 8601 timestamp
  profile_complete: boolean;       // Computed based on required fields
  communication_preferences: {
    email_notifications: boolean;
    sms_notifications: boolean;
  };
  volunteer_metrics: {
    total_rsvps: number;
    total_cancellations: number;
    total_no_shows: number;
    total_attended: number;
    first_event_date?: string;     // ISO 8601 timestamp
    last_event_date?: string;      // ISO 8601 timestamp
  };
}
```

### Volunteer RSVP (with Event Details)

```typescript
interface VolunteerRSVP {
  // RSVP data
  event_id: string;
  email: string;
  status: 'active' | 'cancelled' | 'no_show' | 'attended';
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
  hours_before_event?: number;
  additional_comments?: string;
  
  // Event data (joined)
  event_title: string;
  event_description: string;
  event_start_time?: string;
  event_end_time?: string;
  event_location: object;
  event_status: string;
  event_attendance_cap?: number;
  
  // Computed fields
  event_date?: string;
  event_display_date: string;
  event_sort_timestamp: number;
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "details": ["Specific error details if applicable"]
}
```

### Common HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request data or parameters
- `404 Not Found`: Volunteer not found
- `500 Internal Server Error`: Server error

## Validation Rules

### Volunteer Profile Validation

- `first_name`: Required, non-empty string
- `last_name`: Required, non-empty string
- `email`: Must be valid email format (when provided)
- `phone`: Must be 10-15 digits (when provided)

### Profile Completeness

A profile is considered complete when:
1. All required fields are present (`first_name`, `last_name`, `email`)
2. At least one optional field is provided (`phone` or `emergency_contact`)

## Metrics Calculation

Volunteer metrics are calculated from RSVP history:

- `total_rsvps`: Total number of RSVP records (all statuses)
- `total_cancellations`: Number of RSVPs with status 'cancelled'
- `total_no_shows`: Number of RSVPs with status 'no_show'
- `total_attended`: Number of RSVPs with status 'attended'
- `first_event_date`: Date of earliest RSVP
- `last_event_date`: Date of most recent RSVP

Metrics are automatically calculated and updated when retrieving volunteer profiles.