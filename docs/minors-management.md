# Minors Management System

## Overview

The minors management system allows volunteers to add minors (children under 18) to their account. When a volunteer signs a waiver, it covers both themselves and all minors attached to their account, simplifying the registration process for families.

## Features

- Add minors to volunteer accounts
- Update minor information
- Remove minors from accounts
- Automatic age calculation
- Guardian waiver coverage for all attached minors
- Optional email addresses for minors

## Database Schema

### Minors Table

**Table Name:** `minors`

**Primary Key:**
- Hash Key: `guardian_email` (String)
- Range Key: `minor_id` (String - UUID)

**Attributes:**
- `guardian_email` - Email of the guardian volunteer
- `minor_id` - Unique identifier for the minor
- `first_name` - Minor's first name
- `last_name` - Minor's last name
- `date_of_birth` - Date of birth in YYYY-MM-DD format
- `age` - Calculated age (updated on each query)
- `email` - Optional email address for the minor
- `created_at` - ISO timestamp when minor was added
- `updated_at` - ISO timestamp of last update

## API Endpoints

### 1. Add Minor

**Endpoint:** `POST /api/minors-add`

**Authentication:** Required (session token)

**Request Body:**
```json
{
  "session_token": "user-session-token",
  "first_name": "John",
  "last_name": "Doe",
  "date_of_birth": "2010-05-15",
  "email": "john.doe@example.com"
}
```

**Required Fields:**
- `session_token` - Valid session token
- `first_name` - Minor's first name
- `last_name` - Minor's last name
- `date_of_birth` - Date in YYYY-MM-DD format

**Optional Fields:**
- `email` - Email address for the minor

**Validation:**
- Date of birth must be in YYYY-MM-DD format
- Calculated age must be under 18
- Email must be valid format if provided

**Success Response (200):**
```json
{
  "success": true,
  "message": "Minor added successfully",
  "minor": {
    "minor_id": "uuid-here",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "2010-05-15",
    "age": 13,
    "email": "john.doe@example.com"
  }
}
```

**Error Responses:**
- `400` - Missing required fields or validation errors
- `401` - Invalid or expired session
- `500` - Internal server error

### 2. List Minors

**Endpoint:** `POST /api/minors-list`

**Authentication:** Required (session token)

**Request Body:**
```json
{
  "session_token": "user-session-token"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "minors": [
    {
      "minor_id": "uuid-1",
      "first_name": "John",
      "last_name": "Doe",
      "date_of_birth": "2010-05-15",
      "age": 13,
      "email": "john.doe@example.com",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    {
      "minor_id": "uuid-2",
      "first_name": "Jane",
      "last_name": "Doe",
      "date_of_birth": "2012-08-20",
      "age": 11,
      "email": null,
      "created_at": "2024-01-14T09:15:00Z",
      "updated_at": "2024-01-14T09:15:00Z"
    }
  ],
  "count": 2
}
```

**Notes:**
- Ages are calculated dynamically based on current date
- Minors are sorted by creation date (newest first)
- Email field is null if not provided

### 3. Update Minor

**Endpoint:** `POST /api/minors-update`

**Authentication:** Required (session token)

**Request Body:**
```json
{
  "session_token": "user-session-token",
  "minor_id": "uuid-here",
  "first_name": "Jonathan",
  "last_name": "Doe",
  "date_of_birth": "2010-05-15",
  "email": "jonathan.doe@example.com"
}
```

**Required Fields:**
- `session_token` - Valid session token
- `minor_id` - ID of the minor to update

**Optional Fields (at least one required):**
- `first_name` - Updated first name
- `last_name` - Updated last name
- `date_of_birth` - Updated date of birth (must still be under 18)
- `email` - Updated email (empty string to remove)

**Validation:**
- Minor must belong to the authenticated guardian
- Date of birth must result in age under 18
- Email must be valid format if provided

**Success Response (200):**
```json
{
  "success": true,
  "message": "Minor updated successfully",
  "minor": {
    "minor_id": "uuid-here",
    "first_name": "Jonathan",
    "last_name": "Doe",
    "date_of_birth": "2010-05-15",
    "age": 13,
    "email": "jonathan.doe@example.com",
    "updated_at": "2024-01-16T14:20:00Z"
  }
}
```

**Error Responses:**
- `400` - No fields to update or validation errors
- `401` - Invalid or expired session
- `404` - Minor not found or doesn't belong to guardian
- `500` - Internal server error

### 4. Delete Minor

**Endpoint:** `POST /api/minors-delete`

**Authentication:** Required (session token)

**Request Body:**
```json
{
  "session_token": "user-session-token",
  "minor_id": "uuid-here"
}
```

**Required Fields:**
- `session_token` - Valid session token
- `minor_id` - ID of the minor to delete

**Success Response (200):**
```json
{
  "success": true,
  "message": "Minor deleted successfully",
  "minor_id": "uuid-here"
}
```

**Error Responses:**
- `400` - Missing minor_id
- `401` - Invalid or expired session
- `404` - Minor not found or doesn't belong to guardian
- `500` - Internal server error

### 5. User Dashboard (Updated)

**Endpoint:** `POST /api/user-dashboard`

The user dashboard endpoint has been updated to include minors information.

**Success Response (200):**
```json
{
  "success": true,
  "email": "guardian@example.com",
  "waiver": {
    "hasWaiver": true,
    "expirationDate": "2025-01-15",
    "submissionDate": "2024-01-15T10:00:00Z"
  },
  "minors": [
    {
      "minor_id": "uuid-1",
      "first_name": "John",
      "last_name": "Doe",
      "date_of_birth": "2010-05-15",
      "age": 13,
      "email": "john.doe@example.com",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "rsvps": [...],
  "session_expires_at": "2024-01-17T10:00:00Z"
}
```

## Waiver Coverage

When a volunteer (guardian) signs a waiver:
- The waiver covers the guardian
- The waiver automatically covers all minors attached to the guardian's account
- Minors do not need to sign separate waivers
- The waiver expiration applies to both guardian and all minors

## Frontend Integration

### Adding a Minor Form

```html
<form id="add-minor-form">
  <input type="text" name="first_name" placeholder="First Name" required>
  <input type="text" name="last_name" placeholder="Last Name" required>
  <input type="date" name="date_of_birth" required>
  <input type="email" name="email" placeholder="Email (optional)">
  <button type="submit">Add Minor</button>
</form>

<script>
document.getElementById('add-minor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const sessionToken = localStorage.getItem('session_token');
  
  const response = await fetch('/api/minors-add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_token: sessionToken,
      first_name: formData.get('first_name'),
      last_name: formData.get('last_name'),
      date_of_birth: formData.get('date_of_birth'),
      email: formData.get('email') || undefined
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    alert('Minor added successfully!');
    // Refresh minors list
  } else {
    alert('Error: ' + result.message);
  }
});
</script>
```

### Displaying Minors List

```javascript
async function loadMinors() {
  const sessionToken = localStorage.getItem('session_token');
  
  const response = await fetch('/api/minors-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_token: sessionToken })
  });
  
  const result = await response.json();
  
  if (result.success) {
    const minorsList = document.getElementById('minors-list');
    minorsList.innerHTML = '';
    
    result.minors.forEach(minor => {
      const minorCard = document.createElement('div');
      minorCard.className = 'minor-card';
      minorCard.innerHTML = `
        <h3>${minor.first_name} ${minor.last_name}</h3>
        <p>Age: ${minor.age}</p>
        <p>Date of Birth: ${minor.date_of_birth}</p>
        ${minor.email ? `<p>Email: ${minor.email}</p>` : ''}
        <button onclick="editMinor('${minor.minor_id}')">Edit</button>
        <button onclick="deleteMinor('${minor.minor_id}')">Remove</button>
      `;
      minorsList.appendChild(minorCard);
    });
  }
}
```

## Environment Variables

Add to your `.env` file:

```bash
MINORS_TABLE_NAME=minors
```

## Terraform/Infrastructure

To create the DynamoDB table, use the schema file:

```bash
# Using AWS CLI
aws dynamodb create-table --cli-input-json file://schemas/minors-table.json

# Or include in your Terraform configuration
```

## Security Considerations

1. **Authentication Required:** All endpoints require valid session tokens
2. **Guardian Verification:** Minors can only be accessed/modified by their guardian
3. **Age Validation:** System enforces that only minors (under 18) can be added
4. **Data Privacy:** Email addresses are optional and stored securely
5. **Session Management:** Session tokens are validated and updated on each request

## Best Practices

1. **Age Calculation:** Ages are calculated dynamically to ensure accuracy
2. **Data Validation:** All inputs are validated before database operations
3. **Error Handling:** Comprehensive error messages for debugging
4. **Audit Trail:** Created and updated timestamps for all records
5. **Soft Deletes:** Consider implementing soft deletes for compliance

## Future Enhancements

- Add photo upload for minors
- Emergency contact information
- Medical information/allergies
- Attendance tracking per minor
- Age-appropriate event filtering
- Bulk import/export functionality
