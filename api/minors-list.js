// API Endpoint: /api/minors-list
// Lists all minors attached to a volunteer's account (requires authentication)

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

// Helper function to calculate current age
function calculateAge(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  return age;
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

    console.log(`Fetching minors for guardian: ${guardianEmail}`);

    // Query minors by guardian email
    const queryParams = {
      TableName: minorsTableName,
      KeyConditionExpression: 'guardian_email = :email',
      ExpressionAttributeValues: {
        ':email': guardianEmail
      }
    };

    const result = await dynamoDB.query(queryParams).promise();
    const minors = result.Items || [];

    // Update ages and format response
    const formattedMinors = minors.map(minor => {
      const currentAge = calculateAge(minor.date_of_birth);
      
      return {
        minor_id: minor.minor_id,
        first_name: minor.first_name,
        last_name: minor.last_name,
        date_of_birth: minor.date_of_birth,
        age: currentAge,
        email: minor.email || null,
        created_at: minor.created_at,
        updated_at: minor.updated_at
      };
    });

    // Sort by creation date (newest first)
    formattedMinors.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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
        minors: formattedMinors,
        count: formattedMinors.length
      })
    };

  } catch (error) {
    console.error('Error listing minors:', error);
    
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
