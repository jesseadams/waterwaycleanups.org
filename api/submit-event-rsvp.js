// API Endpoint: /api/submit-event-rsvp
// Submits an RSVP for an event (requires authentication)

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';
const rsvpTableName = process.env.RSVP_TABLE_NAME || 'event_rsvps';

// Helper function to validate session
async function validateSession(sessionToken) {
  const queryParams = {
    TableName: sessionTableName,
    IndexName: 'session-token-index',
    KeyConditionExpression: 'session_token = :token',
    ExpressionAttributeValues: {
      ':token': sessionToken
    }
  };

  const queryResult = await dynamoDB.query(queryParams).promise();
  const sessions = queryResult.Items || [];

  if (sessions.length === 0) {
    return null;
  }

  const session = sessions[0];

  // Check if session has expired
  if (new Date(session.expires_at) <= new Date()) {
    return null;
  }

  return session;
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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
    };
  }

  try {
    const requestBody = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.session_token || !requestBody.event_id || !requestBody.first_name || !requestBody.last_name) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Session token, event ID, first name, and last name are required'
        })
      };
    }

    // Validate session
    const session = await validateSession(requestBody.session_token);
    if (!session) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Invalid or expired session' 
        })
      };
    }

    const email = session.email;
    const eventId = requestBody.event_id;
    const firstName = requestBody.first_name;
    const lastName = requestBody.last_name;
    const attendanceCap = requestBody.attendance_cap || 15;

    console.log(`Processing RSVP for event ${eventId} by ${email}`);

    // Check if user already has an RSVP for this event
    const existingRsvpParams = {
      TableName: rsvpTableName,
      Key: {
        event_id: eventId,
        email: email
      }
    };

    try {
      const existingRsvpResult = await dynamoDB.get(existingRsvpParams).promise();
      
      if (existingRsvpResult.Item) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'You have already RSVP\'d for this event'
          })
        };
      }
    } catch (error) {
      console.error('Error checking existing RSVP:', error);
    }

    // Check current attendance count
    const attendanceParams = {
      TableName: rsvpTableName,
      KeyConditionExpression: 'event_id = :event_id',
      ExpressionAttributeValues: {
        ':event_id': eventId
      }
    };

    const attendanceResult = await dynamoDB.query(attendanceParams).promise();
    const currentAttendance = attendanceResult.Items ? attendanceResult.Items.length : 0;

    if (currentAttendance >= attendanceCap) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'This event is at capacity'
        })
      };
    }

    // Create RSVP record compatible with existing table structure
    const submissionDate = new Date().toISOString();

    const rsvpItem = {
      event_id: eventId,
      email: email,  // Use email as sort key to match existing structure
      first_name: firstName,
      last_name: lastName,
      created_at: submissionDate,
      submission_date: submissionDate,
      updated_at: submissionDate
    };

    const putParams = {
      TableName: rsvpTableName,
      Item: rsvpItem
    };

    await dynamoDB.put(putParams).promise();

    // Update session last accessed time
    const updateSessionParams = {
      TableName: sessionTableName,
      Key: { session_id: session.session_id },
      UpdateExpression: 'SET last_accessed = :last_accessed',
      ExpressionAttributeValues: {
        ':last_accessed': new Date().toISOString()
      }
    };

    await dynamoDB.update(updateSessionParams).promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'RSVP submitted successfully',
        event_id: eventId,
        email: email,
        current_attendance: currentAttendance + 1,
        attendance_cap: attendanceCap
      })
    };

  } catch (error) {
    console.error('Error submitting event RSVP:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' })
    };
  }
};
