// API Endpoint: /api/minors-add
// Adds a minor to a volunteer's account (requires authentication)

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

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

// Helper function to calculate age
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

    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'date_of_birth'];
    const missingFields = requiredFields.filter(field => !requestBody[field]);

    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        })
      };
    }

    // Validate date of birth format
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(requestBody.date_of_birth)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid date of birth format. Please use YYYY-MM-DD format.'
        })
      };
    }

    // Calculate age and verify they are a minor
    const age = calculateAge(requestBody.date_of_birth);
    if (age >= 18) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Only minors (under 18 years old) can be added to your account.'
        })
      };
    }

    // Validate email format if provided
    if (requestBody.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(requestBody.email)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Invalid email format'
          })
        };
      }
    }

    console.log(`Adding minor for guardian: ${guardianEmail}`);

    // Create minor record
    const minorId = uuidv4();
    const createdAt = new Date().toISOString();

    const item = {
      guardian_email: guardianEmail,
      minor_id: minorId,
      first_name: requestBody.first_name,
      last_name: requestBody.last_name,
      date_of_birth: requestBody.date_of_birth,
      age: age,
      created_at: createdAt,
      updated_at: createdAt
    };

    // Add optional email if provided
    if (requestBody.email) {
      item.email = requestBody.email.toLowerCase();
    }

    // Save to DynamoDB
    const params = {
      TableName: minorsTableName,
      Item: item
    };

    console.log(`Saving minor record to DynamoDB: ${minorId}`);
    await dynamoDB.put(params).promise();
    console.log(`Minor record saved successfully: ${minorId}`);

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

    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Minor added successfully',
        minor: {
          minor_id: minorId,
          first_name: item.first_name,
          last_name: item.last_name,
          date_of_birth: item.date_of_birth,
          age: age,
          email: item.email || null
        }
      })
    };

  } catch (error) {
    console.error('Error adding minor:', error);
    
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
