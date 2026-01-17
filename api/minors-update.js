// API Endpoint: /api/minors-update
// Updates a minor's information (requires authentication)

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

    console.log(`Updating minor ${requestBody.minor_id} for guardian: ${guardianEmail}`);

    // Verify the minor belongs to this guardian
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

    // Build update expression dynamically
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ':updated_at': new Date().toISOString()
    };

    // Update first_name if provided
    if (requestBody.first_name) {
      updateExpressions.push('#first_name = :first_name');
      expressionAttributeNames['#first_name'] = 'first_name';
      expressionAttributeValues[':first_name'] = requestBody.first_name;
    }

    // Update last_name if provided
    if (requestBody.last_name) {
      updateExpressions.push('#last_name = :last_name');
      expressionAttributeNames['#last_name'] = 'last_name';
      expressionAttributeValues[':last_name'] = requestBody.last_name;
    }

    // Update date_of_birth if provided
    if (requestBody.date_of_birth) {
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

      // Validate date of birth is not in the future
      // Parse the date string as UTC to avoid timezone issues
      const dobParts = requestBody.date_of_birth.split('-');
      const dob = new Date(Date.UTC(
        parseInt(dobParts[0]), 
        parseInt(dobParts[1]) - 1, 
        parseInt(dobParts[2])
      ));
      
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day for fair comparison
      
      if (dob.getTime() > today.getTime()) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Date of birth cannot be in the future.'
          })
        };
      }

      const age = calculateAge(requestBody.date_of_birth);
      if (age >= 18) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Only minors (under 18 years old) can be on your account.'
          })
        };
      }
      
      if (age < 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Invalid date of birth.'
          })
        };
      }

      updateExpressions.push('#date_of_birth = :date_of_birth');
      updateExpressions.push('#age = :age');
      expressionAttributeNames['#date_of_birth'] = 'date_of_birth';
      expressionAttributeNames['#age'] = 'age';
      expressionAttributeValues[':date_of_birth'] = requestBody.date_of_birth;
      expressionAttributeValues[':age'] = age;
    }

    // Update email if provided (can be empty string to remove)
    if (requestBody.hasOwnProperty('email')) {
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
        updateExpressions.push('#email = :email');
        expressionAttributeNames['#email'] = 'email';
        expressionAttributeValues[':email'] = requestBody.email.toLowerCase();
      } else {
        // Remove email if empty string provided
        updateExpressions.push('REMOVE #email');
        expressionAttributeNames['#email'] = 'email';
      }
    }

    // Always update updated_at
    updateExpressions.push('#updated_at = :updated_at');
    expressionAttributeNames['#updated_at'] = 'updated_at';

    if (updateExpressions.length === 1) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'No fields to update'
        })
      };
    }

    // Perform update
    const updateParams = {
      TableName: minorsTableName,
      Key: {
        guardian_email: guardianEmail,
        minor_id: requestBody.minor_id
      },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const updateResult = await dynamoDB.update(updateParams).promise();
    const updatedMinor = updateResult.Attributes;

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
        message: 'Minor updated successfully',
        minor: {
          minor_id: updatedMinor.minor_id,
          first_name: updatedMinor.first_name,
          last_name: updatedMinor.last_name,
          date_of_birth: updatedMinor.date_of_birth,
          age: updatedMinor.age,
          email: updatedMinor.email || null,
          updated_at: updatedMinor.updated_at
        }
      })
    };

  } catch (error) {
    console.error('Error updating minor:', error);
    
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
