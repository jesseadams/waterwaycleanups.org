// API Endpoint: /api/auth-validate-session
// Validates a session token and returns user information

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';

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
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Session token is required' 
        })
      };
    }

    const sessionToken = requestBody.session_token;

    console.log(`Validating session token: ${sessionToken.substring(0, 8)}...`);

    // Query for session by token
    const queryParams = {
      TableName: sessionTableName,
      IndexName: 'session-token-index', // Assuming you have a GSI on session_token
      KeyConditionExpression: 'session_token = :token',
      ExpressionAttributeValues: {
        ':token': sessionToken
      }
    };

    const queryResult = await dynamoDB.query(queryParams).promise();
    const sessions = queryResult.Items || [];

    if (sessions.length === 0) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Invalid session token' 
        })
      };
    }

    const session = sessions[0];

    // Check if session has expired
    if (new Date(session.expires_at) <= new Date()) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Session has expired' 
        })
      };
    }

    // Update last accessed time
    const updateParams = {
      TableName: sessionTableName,
      Key: { session_id: session.session_id },
      UpdateExpression: 'SET last_accessed = :last_accessed',
      ExpressionAttributeValues: {
        ':last_accessed': new Date().toISOString()
      }
    };

    await dynamoDB.update(updateParams).promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Session is valid',
        email: session.email,
        expires_at: session.expires_at,
        session_id: session.session_id
      })
    };

  } catch (error) {
    console.error('Error validating session:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' })
    };
  }
};