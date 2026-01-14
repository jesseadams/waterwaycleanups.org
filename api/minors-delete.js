// API Endpoint: /api/minors-delete
// Deletes a minor from a volunteer's account (requires authentication)

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';
const minorsTableName = process.env.MINORS_TABLE_NAME || 'minors';

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

    // Validate session token
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

    const guardianEmail = session.email;

    // Validate minor_id
    if (!requestBody.minor_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'minor_id is required'
        })
      };
    }

    console.log(`Deleting minor ${requestBody.minor_id} for guardian: ${guardianEmail}`);

    // Verify the minor exists and belongs to this guardian before deleting
    const getParams = {
      TableName: minorsTableName,
      Key: {
        guardian_email: guardianEmail,
        minor_id: requestBody.minor_id
      }
    };

    const existingMinor = await dynamoDB.get(getParams).promise();
    
    if (!existingMinor.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Minor not found or does not belong to your account'
        })
      };
    }

    // Delete the minor
    const deleteParams = {
      TableName: minorsTableName,
      Key: {
        guardian_email: guardianEmail,
        minor_id: requestBody.minor_id
      }
    };

    await dynamoDB.delete(deleteParams).promise();
    console.log(`Minor deleted successfully: ${requestBody.minor_id}`);

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
        message: 'Minor deleted successfully',
        minor_id: requestBody.minor_id
      })
    };

  } catch (error) {
    console.error('Error deleting minor:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Internal server error'
      })
    };
  }
};
