const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const volunteersTableName = process.env.VOLUNTEERS_TABLE_NAME || 'volunteers';
const minorsTableName = process.env.MINORS_TABLE_NAME || 'minors';

/**
 * Verify admin access from session context
 */
function verifyAdminAccess(event) {
  const context = event.requestContext?.authorizer;
  
  if (!context || !context.email) {
    throw new Error('Unauthorized: No valid session');
  }
  
  if (context.isAdmin !== 'true') {
    throw new Error('Forbidden: Admin access required');
  }
  
  return context;
}

/**
 * Get all volunteers with their associated minors
 */
async function getVolunteers() {
  // Scan volunteers table
  const volunteersResult = await dynamoDB.scan({
    TableName: volunteersTableName
  }).promise();
  
  const volunteers = volunteersResult.Items || [];
  
  // For each volunteer, fetch their minors
  const volunteersWithMinors = await Promise.all(
    volunteers.map(async (volunteer) => {
      try {
        const minorsResult = await dynamoDB.query({
          TableName: minorsTableName,
          KeyConditionExpression: 'guardian_email = :email',
          ExpressionAttributeValues: {
            ':email': volunteer.email
          }
        }).promise();
        
        return {
          ...volunteer,
          minors: minorsResult.Items || []
        };
      } catch (error) {
        console.error(`Error fetching minors for ${volunteer.email}:`, error);
        return {
          ...volunteer,
          minors: []
        };
      }
    })
  );
  
  return volunteersWithMinors;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Verify admin access
    verifyAdminAccess(event);
    
    // Only support GET method
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }
    
    const volunteers = await getVolunteers();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        volunteers,
        total: volunteers.length
      })
    };
    
  } catch (error) {
    console.error('Error in admin-volunteers:', error);
    
    const statusCode = error.message.includes('Unauthorized') ? 401 :
                       error.message.includes('Forbidden') ? 403 : 500;
    
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
