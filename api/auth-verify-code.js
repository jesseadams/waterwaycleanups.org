// API Endpoint: /api/auth-verify-code
// Verifies the validation code and creates an authenticated session

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const authTableName = process.env.AUTH_TABLE_NAME || 'auth_codes';
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

    if (!requestBody.email || !requestBody.validation_code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Email and validation code are required' 
        })
      };
    }

    const email = requestBody.email.toLowerCase();
    const validationCode = requestBody.validation_code;

    console.log(`Verifying validation code for email: ${email}`);

    // Query for validation codes for this email
    const queryParams = {
      TableName: authTableName,
      IndexName: 'email-index', // Assuming you have a GSI on email
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      },
      ScanIndexForward: false // Get most recent first
    };

    const queryResult = await dynamoDB.query(queryParams).promise();
    const codes = queryResult.Items || [];

    // Find a valid, unused code that matches
    const validCode = codes.find(code => 
      code.validation_code === validationCode &&
      !code.used &&
      new Date(code.expires_at) > new Date()
    );

    if (!validCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Invalid or expired validation code' 
        })
      };
    }

    // Mark the code as used
    const updateParams = {
      TableName: authTableName,
      Key: { code_id: validCode.code_id },
      UpdateExpression: 'SET used = :used, used_at = :used_at',
      ExpressionAttributeValues: {
        ':used': true,
        ':used_at': new Date().toISOString()
      }
    };

    await dynamoDB.update(updateParams).promise();

    // Create a new session
    const sessionId = uuidv4();
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const sessionParams = {
      TableName: sessionTableName,
      Item: {
        session_id: sessionId,
        session_token: sessionToken,
        email: email,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        last_accessed: new Date().toISOString()
      }
    };

    await dynamoDB.put(sessionParams).promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Authentication successful',
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
        email: email
      })
    };

  } catch (error) {
    console.error('Error verifying validation code:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' })
    };
  }
};