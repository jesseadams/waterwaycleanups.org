// API Endpoint: /api/auth-send-code
// Sends a validation code to the user's email for authentication

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES();
const authTableName = process.env.AUTH_TABLE_NAME || 'auth_codes';

// Generate a 6-digit validation code
function generateValidationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

    if (!requestBody.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Email address is required' })
      };
    }

    const email = requestBody.email.toLowerCase();
    const validationCode = generateValidationCode();
    const codeId = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    console.log(`Generating validation code for email: ${email}`);

    // Store validation code in DynamoDB
    const params = {
      TableName: authTableName,
      Item: {
        code_id: codeId,
        email: email,
        validation_code: validationCode,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        used: false
      }
    };

    await dynamoDB.put(params).promise();

    // Send email with validation code
    const emailParams = {
      Source: process.env.FROM_EMAIL || 'noreply@waterwaycleanups.org',
      Destination: {
        ToAddresses: [email]
      },
      Message: {
        Subject: {
          Data: 'Your Waterway Cleanups Validation Code'
        },
        Body: {
          Html: {
            Data: `
              <h2>Your Validation Code</h2>
              <p>Your validation code is: <strong>${validationCode}</strong></p>
              <p>This code will expire in 15 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            `
          },
          Text: {
            Data: `Your validation code is: ${validationCode}\n\nThis code will expire in 15 minutes.\n\nIf you didn't request this code, please ignore this email.`
          }
        }
      }
    };

    await ses.sendEmail(emailParams).promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Validation code sent to your email',
        code_id: codeId
      })
    };

  } catch (error) {
    console.error('Error sending validation code:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' })
    };
  }
};