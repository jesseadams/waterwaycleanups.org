// API Endpoint: /api/check-volunteer-waiver
// This endpoint directly checks if a user has already completed a volunteer waiver
// form within the last year by querying DynamoDB.

// For serverless/Netlify/Vercel environments:
// Import AWS SDK for DynamoDB access
const AWS = require('aws-sdk');
const { DateTime } = require('luxon');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Initialize DynamoDB client
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const tableName = process.env.WAIVER_TABLE_NAME || 'volunteer_waivers';
exports.handler = async (event) => {
  // Set up CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }

  // Check if the request method is POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Method Not Allowed'
      })
    };
  }

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Email address is required'
        })
      };
    }

    // Normalize email to lowercase
    const email = requestBody.email.toLowerCase();
    
    console.log(`Checking waiver status for email: ${email}`);
    
    try {
      // Query DynamoDB for this email
      const params = {
        TableName: tableName,
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": email
        }
      };
      
      // Execute the query
      const result = await dynamoDB.query(params).promise();
      const items = result.Items || [];
      
      console.log(`Found ${items.length} waiver records`);
      
      // If no items, user has not signed a waiver
      if (items.length === 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            hasWaiver: false,
            message: 'No waiver found for this email'
          })
        };
      }
      
      // Get the most recent waiver
      items.sort((a, b) => {
        return new Date(b.submission_date) - new Date(a.submission_date);
      });
      
      const latestWaiver = items[0];
      
      // Check if waiver is less than one year old
      if (!latestWaiver.submission_date) {
        console.error("Error: submission_date missing in waiver record");
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            hasWaiver: false,
            message: 'No valid waiver found for this email'
          })
        };
      }
      
      // Parse submission date and handle different formats
      let submissionDate;
      try {
        submissionDate = new Date(latestWaiver.submission_date);
      } catch (e) {
        console.error("Error parsing date:", e);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            hasWaiver: false,
            message: 'Date format error. No valid waiver found.'
          })
        };
      }
      
      // Calculate one year ago
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      
      // Check if waiver is still valid
      if (submissionDate > oneYearAgo) {
        // Calculate expiration date (1 year from submission)
        const expirationDate = new Date(submissionDate);
        expirationDate.setFullYear(submissionDate.getFullYear() + 1);
        
        // Format as YYYY-MM-DD
        const formattedExpirationDate = expirationDate.toISOString().split('T')[0];
        
        // Waiver is valid
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            hasWaiver: true,
            message: `User has a valid waiver until ${formattedExpirationDate}`,
            expirationDate: formattedExpirationDate,
            submissionDate: latestWaiver.submission_date
          })
        };
      } else {
        // Waiver has expired
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            hasWaiver: false,
            message: 'Previous waiver has expired, a new one is required',
            previousWaiverDate: latestWaiver.submission_date
          })
        };
      }
    } catch (dbError) {
      console.error("DynamoDB error:", dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Database error occurred'
        })
      };
    }
  } catch (error) {
    console.error('Error checking volunteer waiver:', error);
    
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
