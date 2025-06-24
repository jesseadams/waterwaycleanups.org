/**
 * Mock API Server for Event RSVP System
 * 
 * This file provides mock API endpoints for local development and testing.
 * It mimics the behavior of the AWS API Gateway and Lambda functions.
 */

// In-memory storage for RSVPs
const rsvpStorage = {};

// Default attendance cap
const DEFAULT_ATTENDANCE_CAP = 15;

/**
 * Handle check RSVP status requests
 * @param {Object} request - The request object
 * @returns {Object} - Response object
 */
async function handleCheckRSVP(request) {
  try {
    const data = await request.json();
    const { event_id, email } = data;
    
    if (!event_id) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameter: event_id', 
          success: false 
        }),
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }
    
    // Get RSVPs for this event
    const rsvps = rsvpStorage[event_id] || [];
    
    // Check if user is registered if email is provided
    let user_registered = false;
    if (email) {
      user_registered = rsvps.some(rsvp => rsvp.email === email);
    }
    
    return new Response(
      JSON.stringify({
        event_id: event_id,
        rsvp_count: rsvps.length,
        user_registered: user_registered,
        success: true
      }),
      {
        status: 200,
        headers: corsHeaders
      }
    );
  } catch (error) {
    console.error('Error in handleCheckRSVP:', error);
    return new Response(
      JSON.stringify({ 
        error: String(error), 
        success: false 
      }),
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

/**
 * Handle RSVP submission requests
 * @param {Object} request - The request object
 * @returns {Object} - Response object
 */
async function handleSubmitRSVP(request) {
  try {
    const data = await request.json();
    const { event_id, first_name, last_name, email } = data;
    const attendance_cap = data.attendance_cap || DEFAULT_ATTENDANCE_CAP;
    
    // Validate required fields
    const requiredFields = ['event_id', 'first_name', 'last_name', 'email'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length) {
      return new Response(
        JSON.stringify({ 
          error: `Missing required parameters: ${missingFields.join(', ')}`, 
          success: false 
        }),
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }
    
    // Initialize event storage if needed
    if (!rsvpStorage[event_id]) {
      rsvpStorage[event_id] = [];
    }
    
    // Check if user is already registered
    const existingRSVP = rsvpStorage[event_id].find(rsvp => rsvp.email === email);
    if (existingRSVP) {
      return new Response(
        JSON.stringify({ 
          error: 'You have already registered for this event', 
          success: false 
        }),
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }
    
    // Check if event is at capacity
    if (rsvpStorage[event_id].length >= attendance_cap) {
      return new Response(
        JSON.stringify({ 
          error: 'This event has reached its maximum capacity', 
          rsvp_count: rsvpStorage[event_id].length,
          attendance_cap: attendance_cap,
          success: false 
        }),
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }
    
    // Add the RSVP
    const timestamp = new Date().toISOString();
    const newRSVP = {
      event_id,
      email,
      first_name,
      last_name,
      created_at: timestamp,
      updated_at: timestamp
    };
    
    rsvpStorage[event_id].push(newRSVP);
    
    return new Response(
      JSON.stringify({
        message: 'RSVP submitted successfully',
        event_id: event_id,
        email: email,
        rsvp_count: rsvpStorage[event_id].length,
        attendance_cap: attendance_cap,
        success: true
      }),
      {
        status: 200,
        headers: corsHeaders
      }
    );
  } catch (error) {
    console.error('Error in handleSubmitRSVP:', error);
    return new Response(
      JSON.stringify({ 
        error: String(error), 
        success: false 
      }),
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

// CORS headers for responses
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
};

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/mock-api/service-worker.js')
      .then(registration => {
        console.log('Mock API Service Worker registered:', registration.scope);
      })
      .catch(error => {
        console.error('Mock API Service Worker registration failed:', error);
      });
  });
}

// Export functions for service worker
if (typeof self !== 'undefined') {
  self.handleCheckRSVP = handleCheckRSVP;
  self.handleSubmitRSVP = handleSubmitRSVP;
  self.corsHeaders = corsHeaders;
}
