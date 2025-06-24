# Event RSVP System

This document outlines how to use the Event RSVP system for Waterway Cleanups.

## Overview

The Event RSVP system allows participants to sign up for cleanup events through the website. It tracks registrations for each event and limits the number of participants based on a configurable attendance cap (default: 15).

Key features:
- User-friendly sign-up form embedded on event pages
- Real-time tracking of registrant count
- Configurable attendance cap for each event
- Automatic full/spots remaining indicators
- Email collection for participant communication

## System Components

1. **DynamoDB Table**: Stores RSVP data with event_id as the primary key
2. **Lambda Functions**:
   - `event_rsvp_check`: Queries current RSVP count for an event
   - `event_rsvp_submit`: Processes new RSVP submissions
3. **API Gateway Endpoints**:
   - `/check-event-rsvp`: Gets current registration count
   - `/submit-event-rsvp`: Submits a new registration
4. **Frontend Components**:
   - API client JavaScript modules
   - RSVP form and UI components
   - Hugo shortcode for easy embedding

## How to Use

### Adding an RSVP Form to an Event Page

To add an RSVP form to an event page, simply include the `event_rsvp` shortcode in your event's markdown file:

```markdown
---
title: Your Event Title
# other frontmatter fields
---

Event description and details...

{{< event_rsvp >}}
```

### Configuring the Attendance Cap

By default, each event has a maximum attendance of 15 participants. To customize this limit:

```markdown
{{< event_rsvp attendance_cap="25" >}}
```

### How it Works

The RSVP system uses the event's filename (without the `.md` extension) as the unique identifier for tracking RSVPs. For example, if your event file is named `beach-cleanup-july-2025.md`, the system will use `beach-cleanup-july-2025` as the event ID in the database.

When users submit the RSVP form:
1. The system checks if the event has reached its attendance cap
2. If space is available, the registration is saved to the database
3. A notification is sent via SNS
4. The user receives confirmation on the webpage

## Infrastructure Details

The system is deployed using Terraform and integrates with:

- AWS DynamoDB for data storage
- AWS Lambda for serverless processing
- AWS API Gateway for API endpoints
- AWS SNS for notifications

All required resources are defined in `terraform/event_rsvp.tf` and can be deployed along with the rest of the infrastructure.

### API Endpoints

The RSVP system uses the following API endpoints:

- **Check RSVP status**: `https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/prod/check-event-rsvp`
- **Submit RSVP**: `https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/prod/submit-event-rsvp`

These endpoints are hardcoded in the JavaScript file for simplicity, but you can update them by modifying the `static/js/event-rsvp.js` file after running `terraform apply` and getting the actual endpoint URLs from the outputs:

```bash
terraform output check_rsvp_url
terraform output submit_rsvp_url
```

## Customization

### Modifying the RSVP Form

The RSVP form template is located at `layouts/shortcodes/event_rsvp.html`. You can modify this file to change the form's appearance or add additional fields.

### Extending the Backend

If you need to extend the RSVP system with additional features:

1. Update the Lambda functions in `terraform/lambda_event_rsvp_check.py` and `terraform/lambda_event_rsvp_submit.py`
2. Update the frontend API clients in `api/check-event-rsvp.js` and `api/submit-event-rsvp.js`
3. Update the JavaScript integration in `static/js/event-rsvp.js`

## Troubleshooting

### Common Issues

1. **RSVP Count Not Updating**: Ensure the event_id is correctly derived from the filename and matches in the database.
2. **Form Not Appearing**: Check that the shortcode is correctly included in the event markdown file.
3. **Submission Errors**: Check the browser console for error messages from the JavaScript client.
4. **CORS Errors**: The API endpoints have comprehensive CORS headers configured to allow requests from any origin. If you're experiencing CORS issues:
   - Make sure your fetch requests use the correct CORS mode and credentials settings:
     ```javascript
     const requestOptions = {
       method: 'POST',
       mode: 'cors',
       cache: 'no-cache',
       credentials: 'omit',  // Important for cross-origin requests
       headers: {
         'Content-Type': 'application/json',
       }
     };
     ```
   - Check the browser console for specific CORS error messages
   - Verify that OPTIONS preflight requests are completing successfully
   - The API Gateway includes Gateway Responses with CORS headers for error cases
   - If issues persist after deploying, run `terraform apply` to ensure all CORS settings are applied
5. **404 Errors for JavaScript Files**: Ensure your Hugo static file serving is properly configured:
   - Make sure the files are in the `static/js/` directory
   - If using a custom baseURL, adjust the path in the shortcode accordingly
   - If needed, add a custom output format in your `config.yaml` for JavaScript files
   - For debugging, try accessing the file directly via the browser to see if it's being served

### File Structure

```
waterwaycleanups.org/
├── static/
│   ├── js/
│   │   └── event-rsvp.js
│   └── api/
│       ├── check-event-rsvp.js
│       └── submit-event-rsvp.js
└── layouts/
    └── shortcodes/
        └── event_rsvp.html
```

### Hugo Configuration

If you're experiencing issues with static file serving, you may need to add the following to your `config.yaml`:

```yaml
mediaTypes:
  application/javascript:
    suffixes: ["js"]

outputFormats:
  JS:
    mediaType: application/javascript
    isPlainText: true
    isHTML: false
```

### Getting Support

For assistance with the RSVP system, contact the website administrator or submit an issue to the repository.
