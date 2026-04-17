// API Endpoint: /api/admin-send-reminder
// Sends a custom email message to all RSVPed attendees for a specific event (admin only)

const AWS = require('aws-sdk');

AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES();
const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';
const rsvpTableName = process.env.RSVP_TABLE_NAME || 'event_rsvps';
const eventsTableName = process.env.EVENTS_TABLE_NAME || 'events';

// Validate admin session (same pattern as admin-events.js)
async function validateAdminSession(sessionToken) {
  const queryParams = {
    TableName: sessionTableName,
    IndexName: 'session-token-index',
    KeyConditionExpression: 'session_token = :token',
    ExpressionAttributeValues: { ':token': sessionToken }
  };

  const queryResult = await dynamoDB.query(queryParams).promise();
  const sessions = queryResult.Items || [];
  if (sessions.length === 0) return null;

  const session = sessions[0];
  if (new Date(session.expires_at) <= new Date()) return null;

  const adminEmails = [
    'admin@waterwaycleanups.org',
    'contact@waterwaycleanups.org',
    'jesse@techno-geeks.org',
    'jesse@waterwaycleanups.org'
  ];

  return adminEmails.includes(session.email.toLowerCase()) ? session : null;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'CORS preflight successful' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
  }

  try {
    const requestBody = JSON.parse(event.body);

    if (!requestBody.session_token) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Session token is required' }) };
    }

    const session = await validateAdminSession(requestBody.session_token);
    if (!session) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'Admin access required' }) };
    }

    const { event_id, subject, message } = requestBody;

    if (!event_id || !subject || !message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'event_id, subject, and message are required' })
      };
    }

    // Fetch event details
    const eventResult = await dynamoDB.get({
      TableName: eventsTableName,
      Key: { event_id }
    }).promise();

    if (!eventResult.Item) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Event not found' }) };
    }

    const eventData = eventResult.Item;
    const eventTitle = eventData.title || event_id;

    // Fetch all RSVPs for this event
    const rsvpResult = await dynamoDB.query({
      TableName: rsvpTableName,
      KeyConditionExpression: 'event_id = :eid',
      ExpressionAttributeValues: { ':eid': event_id }
    }).promise();

    const rsvps = (rsvpResult.Items || []).filter(r =>
      r.status !== 'cancelled' && r.no_show !== true
    );

    if (rsvps.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'No active RSVPs to message', sent: 0 }) };
    }

    // Collect unique emails
    const emails = [...new Set(rsvps.map(r => r.email).filter(Boolean))];

    // Format event date for the email
    let eventDateStr = 'Date TBD';
    if (eventData.start_time) {
      try {
        const d = new Date(eventData.start_time);
        eventDateStr = d.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true
        });
      } catch (e) { /* keep default */ }
    }

    const locationStr = eventData.location
      ? [eventData.location.name, eventData.location.address].filter(Boolean).join(' — ')
      : '';

    const fromEmail = process.env.FROM_EMAIL || 'info@waterwaycleanups.org';

    // Build HTML email
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Waterway Cleanups</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #6b7280; font-size: 14px; margin-top: 0;">
            Regarding: <strong>${eventTitle}</strong><br/>
            ${eventDateStr}${locationStr ? '<br/>' + locationStr : ''}
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <div style="white-space: pre-wrap; line-height: 1.6;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            You're receiving this because you RSVP'd for this event. If you have questions, reply to this email.
          </p>
        </div>
      </div>
    `;

    const textBody = `Waterway Cleanups\n\nRegarding: ${eventTitle}\n${eventDateStr}\n${locationStr}\n\n${message}\n\n---\nYou're receiving this because you RSVP'd for this event.`;

    // Send emails in batches of 50 (SES limit per call)
    let sent = 0;
    let failed = 0;
    const batchSize = 50;

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      try {
        await ses.sendEmail({
          Source: fromEmail,
          Destination: { BccAddresses: batch },
          ReplyToAddresses: [session.email],
          Message: {
            Subject: { Data: `[${eventTitle}] ${subject}` },
            Body: {
              Html: { Data: htmlBody },
              Text: { Data: textBody }
            }
          }
        }).promise();
        sent += batch.length;
      } catch (err) {
        console.error(`Failed to send batch starting at index ${i}:`, err);
        failed += batch.length;
      }
    }

    console.log(`Reminder sent by ${session.email} for event ${event_id}: ${sent} sent, ${failed} failed`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Message sent to ${sent} attendee${sent !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`,
        sent,
        failed,
        total_recipients: emails.length
      })
    };

  } catch (error) {
    console.error('Error sending reminder:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
};
