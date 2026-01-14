// API Endpoint: /api/admin-events
// Returns all events for admin interface

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';
const eventsTableName = process.env.EVENTS_TABLE_NAME || 'events';

// Helper function to validate session and check admin status
async function validateAdminSession(sessionToken) {
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

  // Check if user is admin
  const adminEmails = [
    'admin@waterwaycleanups.org',
    'contact@waterwaycleanups.org',
    'jesse@techno-geeks.org',
    'jesse@waterwaycleanups.org'
  ];

  const isAdmin = adminEmails.includes(session.email.toLowerCase());
  
  return isAdmin ? session : null;
}

// Helper function to convert DynamoDB Decimal objects
function convertDecimals(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'object' && obj.constructor && obj.constructor.name === 'Decimal') {
    return obj % 1 === 0 ? parseInt(obj) : parseFloat(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertDecimals);
  }
  
  if (typeof obj === 'object') {
    const converted = {};
    for (const key in obj) {
      converted[key] = convertDecimals(obj[key]);
    }
    return converted;
  }
  
  return obj;
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

    if (!requestBody.session_token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Session token is required' 
        })
      };
    }

    // Validate admin session
    const session = await validateAdminSession(requestBody.session_token);
    if (!session) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Admin access required' 
        })
      };
    }

    console.log(`Loading all events for admin: ${session.email}`);

    // Get all events from the events table
    const scanParams = {
      TableName: eventsTableName
    };

    // Apply filters if provided
    if (requestBody.status) {
      scanParams.FilterExpression = '#status = :status';
      scanParams.ExpressionAttributeNames = { '#status': 'status' };
      scanParams.ExpressionAttributeValues = { ':status': requestBody.status };
    }

    const result = await dynamoDB.scan(scanParams).promise();
    let events = result.Items || [];

    // Apply additional filters
    if (requestBody.location) {
      const locationFilter = requestBody.location.toLowerCase();
      events = events.filter(event => {
        const location = event.location || {};
        return (location.name || '').toLowerCase().includes(locationFilter) ||
               (location.address || '').toLowerCase().includes(locationFilter);
      });
    }

    // Sort events by start_time (chronological order)
    events.sort((a, b) => {
      const dateA = new Date(a.start_time || 0);
      const dateB = new Date(b.start_time || 0);
      return dateA - dateB;
    });

    // Convert Decimal objects to regular numbers
    events = convertDecimals(events);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        events: events,
        count: events.length,
        admin_email: session.email
      })
    };

  } catch (error) {
    console.error('Error loading admin events:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' })
    };
  }
};