# Export and Analytics API Documentation

This document describes the export and analytics functionality added to the database-driven events system.

## Overview

The export and analytics features provide comprehensive reporting capabilities for events, volunteers, and RSVPs. These features include:

1. **Events Export** - Export event data in CSV or JSON format
2. **Analytics** - Calculate attendance rates, cancellation patterns, and volunteer metrics
3. **Volunteer Metrics** - Detailed volunteer performance and engagement analytics

## API Endpoints

### Events Export

**Endpoint:** `GET /events/export`

**Authentication:** Required (Admin only)

**Query Parameters:**
- `format` (required): Export format - `json` or `csv`
- `include_rsvp_stats` (optional): Include RSVP statistics - `true` or `false` (default: `true`)
- `status` (optional): Filter by event status - `active`, `completed`, `cancelled`, `archived`
- `start_date` (optional): Filter events from this date (ISO 8601 format)
- `end_date` (optional): Filter events until this date (ISO 8601 format)

**Example Requests:**
```bash
# Export all events as JSON with RSVP stats
GET /events/export?format=json&include_rsvp_stats=true

# Export completed events as CSV
GET /events/export?format=csv&status=completed

# Export events from a date range
GET /events/export?format=json&start_date=2024-01-01T00:00:00Z&end_date=2024-12-31T23:59:59Z
```

**Response (JSON format):**
```json
{
  "success": true,
  "events": [
    {
      "event_id": "cleanup-event-1",
      "title": "Park Cleanup Event",
      "start_time": "2024-02-15T10:00:00Z",
      "location": {
        "name": "Central Park",
        "address": "123 Park Ave"
      },
      "rsvp_stats": {
        "total_rsvps": 25,
        "active_rsvps": 20,
        "cancelled_rsvps": 3,
        "no_show_rsvps": 1,
        "attended_rsvps": 21
      }
    }
  ],
  "count": 1,
  "exported_at": "2024-02-01T12:00:00Z"
}
```

### Analytics

**Endpoint:** `GET /analytics`

**Authentication:** Required (Admin only)

**Query Parameters:**
- `type` (optional): Analytics type - `all`, `attendance`, `cancellation`, `volunteers` (default: `all`)
- `start_date` (optional): Filter data from this date
- `end_date` (optional): Filter data until this date

**Example Requests:**
```bash
# Get all analytics
GET /analytics?type=all

# Get only attendance analytics for a date range
GET /analytics?type=attendance&start_date=2024-01-01T00:00:00Z&end_date=2024-12-31T23:59:59Z

# Get cancellation analytics
GET /analytics?type=cancellation
```

**Response:**
```json
{
  "success": true,
  "generated_at": "2024-02-01T12:00:00Z",
  "attendance_analytics": {
    "overall_stats": {
      "total_events": 10,
      "total_rsvps": 250,
      "total_attended": 200,
      "total_no_shows": 25,
      "overall_attendance_rate": 88.89
    },
    "event_stats": [
      {
        "event_id": "event-1",
        "event_title": "Park Cleanup",
        "total_rsvps": 25,
        "attended": 20,
        "no_shows": 3,
        "attendance_rate": 86.96
      }
    ]
  },
  "cancellation_analytics": {
    "overall_stats": {
      "total_rsvps": 250,
      "total_cancelled": 25,
      "cancellation_rate": 10.0
    },
    "timing_patterns": {
      "same_day": 5,
      "within_24_hours": 8,
      "within_48_hours": 6,
      "within_week": 4,
      "more_than_week": 2
    },
    "event_stats": [
      {
        "event_id": "event-1",
        "total_rsvps": 25,
        "cancelled_rsvps": 3,
        "cancellation_rate": 12.0
      }
    ]
  },
  "volunteer_analytics": {
    "total_volunteers": 150,
    "active_volunteers": 120,
    "repeat_volunteers": 80,
    "retention_rate": 53.33,
    "engagement_distribution": {
      "one_time": 70,
      "occasional": 50,
      "regular": 20,
      "frequent": 10
    }
  }
}
```

### Volunteer Metrics

**Endpoint:** `GET /volunteers/metrics`

**Authentication:** Required (Admin only)

**Query Parameters:**
- `type` (optional): Report type - `leaderboard` (default: `leaderboard`)
- `limit` (optional): Number of results to return (default: 20)

**Example Request:**
```bash
# Get volunteer leaderboard
GET /volunteers/metrics?type=leaderboard&limit=10
```

**Response:**
```json
{
  "success": true,
  "generated_at": "2024-02-01T12:00:00Z",
  "leaderboards": {
    "most_events": [
      {
        "email": "volunteer1@example.com",
        "full_name": "John Doe",
        "total_rsvps": 15,
        "total_attended": 12,
        "attendance_rate": 85.71
      }
    ],
    "highest_attendance_rate": [
      {
        "email": "volunteer2@example.com",
        "full_name": "Jane Smith",
        "total_rsvps": 8,
        "total_attended": 8,
        "attendance_rate": 100.0
      }
    ],
    "most_recent_activity": [
      {
        "email": "volunteer3@example.com",
        "full_name": "Bob Johnson",
        "last_event_date": "2024-01-30T10:00:00Z"
      }
    ],
    "longest_tenure": [
      {
        "email": "volunteer4@example.com",
        "full_name": "Alice Brown",
        "tenure_days": 365
      }
    ]
  }
}
```

### Detailed Volunteer Metrics

**Endpoint:** `GET /volunteers/metrics/{email}`

**Authentication:** Required (Admin only)

**Example Request:**
```bash
# Get detailed metrics for a specific volunteer
GET /volunteers/metrics/volunteer@example.com
```

**Response:**
```json
{
  "success": true,
  "volunteer_metrics": {
    "basic_info": {
      "email": "volunteer@example.com",
      "full_name": "John Doe",
      "created_at": "2024-01-01T00:00:00Z",
      "profile_complete": true
    },
    "rsvp_summary": {
      "total_rsvps": 15,
      "active_rsvps": 2,
      "cancelled_rsvps": 2,
      "no_show_rsvps": 1,
      "attended_rsvps": 10
    },
    "engagement_patterns": {
      "first_event_date": "2024-01-15T10:00:00Z",
      "last_event_date": "2024-01-30T10:00:00Z",
      "average_days_between_events": 15.5,
      "cancellation_rate": 13.33,
      "attendance_rate": 90.91
    },
    "recent_activity": {
      "rsvps_last_30_days": 3,
      "rsvps_last_90_days": 8,
      "cancellations_last_90_days": 1
    }
  }
}
```

## Volunteer Export (Existing)

**Endpoint:** `GET /volunteers/export`

**Authentication:** Required (Admin only)

**Query Parameters:**
- `format` (required): Export format - `json` or `csv`
- `include_metrics` (optional): Include volunteer metrics - `true` or `false` (default: `true`)
- `profile_complete` (optional): Filter by profile completeness - `true` or `false`
- `email_notifications` (optional): Filter by email notification preference - `true` or `false`

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid authentication)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

## Rate Limiting

All API endpoints are subject to rate limiting:
- **Rate Limit:** 100 requests per second
- **Burst Limit:** 200 requests
- **Daily Quota:** 10,000 requests per day

## Authentication

All export and analytics endpoints require admin authentication. Include the session token in the Authorization header:

```
Authorization: Bearer <session_token>
```

## Data Privacy

When exporting volunteer data:
- All personally identifiable information (PII) is handled according to privacy requirements
- Export functionality is restricted to authorized administrators only
- Audit logs are maintained for all export operations

## Usage Examples

### Generate Monthly Report

```bash
# Get analytics for the current month
curl -H "Authorization: Bearer <token>" \
  "https://api.example.com/analytics?type=all&start_date=2024-02-01T00:00:00Z&end_date=2024-02-29T23:59:59Z"

# Export events for the month as CSV
curl -H "Authorization: Bearer <token>" \
  "https://api.example.com/events/export?format=csv&start_date=2024-02-01T00:00:00Z&end_date=2024-02-29T23:59:59Z"
```

### Volunteer Performance Review

```bash
# Get volunteer leaderboard
curl -H "Authorization: Bearer <token>" \
  "https://api.example.com/volunteers/metrics?type=leaderboard&limit=50"

# Get detailed metrics for top volunteer
curl -H "Authorization: Bearer <token>" \
  "https://api.example.com/volunteers/metrics/topvolunteer@example.com"
```

### Event Analysis

```bash
# Get attendance analytics for completed events
curl -H "Authorization: Bearer <token>" \
  "https://api.example.com/analytics?type=attendance"

# Export completed events with RSVP stats
curl -H "Authorization: Bearer <token>" \
  "https://api.example.com/events/export?format=json&status=completed&include_rsvp_stats=true"
```