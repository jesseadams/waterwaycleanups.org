// Volunteer Interest Form API Endpoint
// This script handles the submission of volunteer interest forms
// and saves the data for later processing

// Import required modules (if using in a Node.js environment)
// const express = require('express');
// const bodyParser = require('body-parser');
// const app = express();

// For serverless/Netlify/Vercel environments:
exports.handler = async (event) => {
  // Check if the request method is POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    };
  }

  try {
    // Parse the request body
    const data = JSON.parse(event.body);
    
    // Validate required fields
    if (!data.first_name || !data.last_name || !data.email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Missing required fields', 
          message: 'First name, last name, and email are required'
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Invalid email format', 
          message: 'Please provide a valid email address'
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }
    
    // For demonstration purposes, log the data
    // In a real implementation, you would:
    // 1. Store this in a database
    // 2. Send email notifications
    // 3. Add to CRM system, etc.
    console.log('Volunteer interest received:', data);
    
    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Thank you for your interest in volunteering!',
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email
        }
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    console.error('Error processing volunteer form submission:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal Server Error', 
        message: 'An error occurred while processing your request'
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};

// For Express.js implementation (if using Node.js server)
/*
app.use(bodyParser.json());

app.post('/api/submit-volunteer', (req, res) => {
  const { first_name, last_name, email } = req.body;
  
  // Validate required fields
  if (!first_name || !last_name || !email) {
    return res.status(400).json({ 
      error: 'Missing required fields', 
      message: 'First name, last name, and email are required'
    });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      error: 'Invalid email format', 
      message: 'Please provide a valid email address'
    });
  }
  
  // For demonstration purposes, log the data
  // In a real implementation, you would:
  // 1. Store this in a database
  // 2. Send email notifications
  // 3. Add to CRM system, etc.
  console.log('Volunteer interest received:', { first_name, last_name, email });
  
  // Return success response
  res.status(200).json({
    success: true,
    message: 'Thank you for your interest in volunteering!',
    data: { first_name, last_name, email }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
*/
