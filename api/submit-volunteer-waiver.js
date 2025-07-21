// API Endpoint: /api/submit-volunteer-waiver
// This endpoint directly submits volunteer waiver form data to DynamoDB

// For serverless/Netlify/Vercel environments:
// Import AWS SDK for DynamoDB and SES access
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Initialize DynamoDB and SESv2 clients
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sesv2 = new AWS.SESv2();
const tableName = process.env.WAIVER_TABLE_NAME || 'volunteer_waivers';

// SES configuration - these should be environment variables
const CONTACT_LIST_NAME = process.env.SES_CONTACT_LIST_NAME || 'volunteers';
const TOPIC_NAME = process.env.SES_TOPIC_NAME || 'general';

// Helper function to check if contact exists in SES
const checkContactExists = async (contactListName, emailAddress) => {
  try {
    const command = {
      ContactListName: contactListName,
      EmailAddress: emailAddress
    };
    
    await sesv2.getContact(command).promise();
    return true; // Contact exists
  } catch (error) {
    if (error.code === 'NotFoundException') {
      return false; // Contact doesn't exist
    }
    throw error; // Other error
  }
};

// Helper function to add contact to SES
const addContactToSES = async (contactListName, emailAddress, fullName, attributes = {}, topicName = null) => {
  try {
    // Include name and other attributes
    const contactAttributes = {
      full_name: fullName,
      ...attributes
    };
    
    // Prepare topic preferences if topic name is provided
    const topicPreferences = topicName ? [
      {
        TopicName: topicName,
        SubscriptionStatus: 'OPT_IN'
      }
    ] : [];
    
    const command = {
      ContactListName: contactListName,
      EmailAddress: emailAddress,
      AttributesData: JSON.stringify(contactAttributes),
      TopicPreferences: topicPreferences
    };
    
    await sesv2.createContact(command).promise();
    return true;
  } catch (error) {
    console.error(`Error adding contact ${emailAddress} to SES:`, error);
    throw error;
  }
};
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
    const requiredFields = ['email', 'full_legal_name', 'phone_number', 'date_of_birth', 'waiver_acknowledgement'];
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

    // Normalize email to lowercase
    requestBody.email = requestBody.email.toLowerCase();
    
    console.log(`Processing waiver submission for email: ${requestBody.email}`);
    
    // Determine if adult or minor based on date of birth
    let isAdult = false;
    try {
      const dateOfBirth = new Date(requestBody.date_of_birth);
      const today = new Date();
      const age = today.getFullYear() - dateOfBirth.getFullYear() - 
                 ((today.getMonth() < dateOfBirth.getMonth() || 
                  (today.getMonth() === dateOfBirth.getMonth() && today.getDate() < dateOfBirth.getDate())) ? 1 : 0);
      
      isAdult = age >= 18;
      console.log(`Calculated age: ${age}, isAdult: ${isAdult}`);
    } catch (e) {
      console.error("Error calculating age:", e);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid date of birth format. Please use YYYY-MM-DD format.'
        })
      };
    }
    
    // Validate additional required fields based on age
    if (isAdult) {
      const adultFields = ['adult_signature', 'adult_todays_date'];
      const missingAdultFields = adultFields.filter(field => !requestBody[field]);
      
      if (missingAdultFields.length > 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: `Missing required adult fields: ${missingAdultFields.join(', ')}`
          })
        };
      }
    } else {
      const minorFields = ['guardian_name', 'guardian_email', 'relationship_type', 'guardian_consent', 'minor_todays_date'];
      const missingMinorFields = minorFields.filter(field => !requestBody[field]);
      
      if (missingMinorFields.length > 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: `Missing required guardian fields: ${missingMinorFields.join(', ')}`
          })
        };
      }
      
      // Normalize guardian email
      requestBody.guardian_email = requestBody.guardian_email.toLowerCase();
    }
    
    try {
      // Create waiver record for DynamoDB
      const waiverId = uuidv4();
      const submissionDate = new Date().toISOString();
      
      // Create item with all form fields
      const item = {
        email: requestBody.email,
        waiver_id: waiverId,
        submission_date: submissionDate,
        full_legal_name: requestBody.full_legal_name,
        phone_number: requestBody.phone_number,
        date_of_birth: requestBody.date_of_birth,
        is_adult: isAdult,
        waiver_acknowledged: requestBody.waiver_acknowledgement === 'on' || 
                           requestBody.waiver_acknowledgement === true || 
                           requestBody.waiver_acknowledgement === 'true'
      };
      
      // Add adult-specific or minor-specific fields
      if (isAdult) {
        item.adult_signature = requestBody.adult_signature;
        item.signature_date = requestBody.adult_todays_date;
      } else {
        item.guardian_name = requestBody.guardian_name;
        item.guardian_email = requestBody.guardian_email;
        item.guardian_relationship = requestBody.relationship_type;
        item.guardian_consent = requestBody.guardian_consent === 'on' || 
                               requestBody.guardian_consent === true || 
                               requestBody.guardian_consent === 'true';
        item.consent_date = requestBody.minor_todays_date;
      }
      
      // Save to DynamoDB
      const params = {
        TableName: tableName,
        Item: item
      };
      
      console.log(`Saving waiver record to DynamoDB: ${waiverId}`);
      await dynamoDB.put(params).promise();
      console.log(`Waiver record saved successfully: ${waiverId}`);
      
      // Add contact to SES if they don't already exist
      try {
        const contactExists = await checkContactExists(CONTACT_LIST_NAME, requestBody.email);
        
        if (!contactExists) {
          // Prepare additional attributes
          const additionalAttributes = {
            phone_number: requestBody.phone_number,
            date_of_birth: requestBody.date_of_birth,
            waiver_date: submissionDate.split('T')[0]
          };
          
          await addContactToSES(
            CONTACT_LIST_NAME, 
            requestBody.email, 
            requestBody.full_legal_name,
            additionalAttributes,
            TOPIC_NAME
          );
        }
      } catch (sesError) {
        // Don't fail the entire request if SES fails, but log it
        console.error('SES contact addition failed (continuing with waiver submission):', sesError);
      }
      
      // Calculate expiration date (1 year from submission)
      const submissionDateTime = new Date(submissionDate);
      const expirationDate = new Date(submissionDateTime);
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);
      
      // Format as YYYY-MM-DD
      const formattedExpirationDate = expirationDate.toISOString().split('T')[0];
      
      // Return success response
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Waiver submitted successfully',
          waiver_id: waiverId,
          expiration_date: formattedExpirationDate
        })
      };
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
    console.error('Error submitting volunteer waiver:', error);
    
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
