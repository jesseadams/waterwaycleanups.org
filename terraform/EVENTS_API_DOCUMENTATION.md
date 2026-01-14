# Events Management API Documentation

## Overview

The Events Management API provides CRUD operations for managing cleanup events in the database-driven events system. All endpoints support CORS and return JSON responses.

## Base URL

```
https://{api-gateway-id}.execute-api.{region}.amazonaws.com/{stage}
```

## Endpoints

### 1. List Events

**GET** `/events`

Retrieve a list of events with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by event status (`active`, `cancelled`, `completed`, `archived`)
- `start_date` (optional): Filter events starting from this date (ISO 8601 format)
- `end_date` (optional): Filter events ending before this date (ISO 8601 format)
- `location` (optional): Filter by location name or address (partial match)
- `limit` (optional): Maximum number of events to return (default: 50)

**Response:**
```json
{
  "events": [
    {
      "event_id": "test-cleanup-february-2026",
      "title": "Test Cleanup Event",
      "description": "A test cleanup event",
      "start_time": "2026-02-15T09:00:00Z",
      "end_time": "2026-02-15T12:00:00Z",
      "location": {
        "name": "Test Park",
        "address": "123 Test Street, Test City, VA 22101"
      },
      "attendance_cap": 50,
      "status": "active",
      "created_at": "2026-01-12T15:46:17Z",
      "updated_at": "2026-01-12T15:46:17Z",
      "hugo_config": {
        "tags": ["test", "cleanup"],
        "preheader_is_light": false
      },
      "metadata": {}
    }
  ],
  "count": 1,
  "success": true
}
```

### 2. Get Specific Event

**GET** `/events/{event_id}`

Retrieve details for a specific event.

**Response:**
```json
{
  "event": {
    "event_id": "test-cleanup-february-2026",
    "title": "Test Cleanup Event",
    // ... full event object
  },
  "success": true
}
```

### 3. Create Event

**POST** `/events`

Create a new event.

**Request Body:**
```json
{
  "title": "New Cleanup Event",
  "description": "Description of the cleanup event",
  "start_time": "2026-03-15T09:00:00Z",
  "end_time": "2026-03-15T12:00:00Z",
  "location": {
    "name": "Park Name",
    "address": "Full address"
  },
  "attendance_cap": 50,
  "status": "active",
  "hugo_config": {
    "tags": ["cleanup", "environment"],
    "preheader_is_light": false
  },
  "metadata": {}
}
```

**Response:**
```json
{
  "message": "Event created successfully",
  "event": {
    // ... created event object with generated event_id
  },
  "success": true
}
```

### 4. Update Event

**PUT** `/events/{event_id}`

Update an existing event.

**Request Body:** (partial updates supported)
```json
{
  "title": "Updated Event Title",
  "attendance_cap": 75
}
```

**Response:**
```json
{
  "message": "Event updated successfully",
  "event": {
    // ... updated event object
  },
  "success": true
}
```

### 5. Delete Event

**DELETE** `/events/{event_id}`

Delete an event and all associated RSVPs.

**Response:**
```json
{
  "message": "Event test-cleanup-february-2026 and 5 associated RSVPs deleted successfully",
  "deleted_event": {
    // ... deleted event object
  },
  "deleted_rsvps_count": 5,
  "success": true
}
```

### 6. Get Event RSVPs

**GET** `/events/{event_id}/rsvps`

Retrieve all RSVPs for a specific event with volunteer details.

**Response:**
```json
{
  "event": {
    // ... event object
  },
  "rsvps": [
    {
      "event_id": "test-cleanup-february-2026",
      "email": "volunteer@example.com",
      "status": "active",
      "created_at": "2026-01-10T14:30:00Z",
      "updated_at": "2026-01-10T14:30:00Z",
      "volunteer_name": "John Doe",
      "volunteer_first_name": "John",
      "volunteer_last_name": "Doe",
      "volunteer_phone": "+1234567890",
      "volunteer_emergency_contact": "Jane Doe +0987654321",
      "volunteer_dietary_restrictions": "None",
      "volunteer_experience": "Beginner"
    }
  ],
  "statistics": {
    "total_rsvps": 10,
    "active_rsvps": 8,
    "cancelled_rsvps": 1,
    "no_show_rsvps": 0,
    "attended_rsvps": 1,
    "attendance_cap": 50
  },
  "success": true
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message describing what went wrong",
  "success": false
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created (for POST requests)
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `409` - Conflict (duplicate event_id)
- `500` - Internal Server Error

## Data Validation

### Event Object Validation

**Required Fields:**
- `title` (string)
- `description` (string)
- `start_time` (ISO 8601 datetime string)
- `end_time` (ISO 8601 datetime string)
- `location` (object with `name` and `address` fields)

**Optional Fields:**
- `event_id` (string, auto-generated if not provided)
- `attendance_cap` (number, default: 50)
- `status` (string, default: "active")
- `hugo_config` (object)
- `metadata` (object)

### Location Object

```json
{
  "name": "Location Name",
  "address": "Full Address",
  "coordinates": {  // optional
    "lat": 38.9072,
    "lng": -77.0369
  }
}
```

## Authentication

Currently, all endpoints are publicly accessible. Authentication will be added in a future update for write operations (POST, PUT, DELETE).

## Rate Limiting

API Gateway provides built-in rate limiting. Default limits apply unless configured otherwise.

## Testing

Use the provided `events_api_client.py` script to test the API:

```bash
python3 events_api_client.py https://your-api-gateway-url.execute-api.region.amazonaws.com/stage
```