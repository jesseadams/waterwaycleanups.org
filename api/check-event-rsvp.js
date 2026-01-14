/**
 * Check Event RSVP API Client
 * 
 * This file provides functions to check the RSVP status of an event.
 */

/**
 * Get API URL based on environment
 * @param {string} endpoint - The endpoint name
 * @returns {string} Full API URL
 */
function getApiUrl(endpoint) {
  // First, try to use Hugo-injected API configuration
  if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
    return `${window.API_CONFIG.BASE_URL}/${endpoint}`;
  }
  
  // Fallback to environment detection for localhost development
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    // Use staging APIs for localhost development
    const stagingBase = 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/staging';
    return `${stagingBase}/${endpoint}`;
  } else {
    // Use production APIs as final fallback
    const prodBase = 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/prod';
    return `${prodBase}/${endpoint}`;
  }
}

/**
 * Check the RSVP status for an event
 * @param {string} eventId - The unique identifier for the event
 * @param {string} [email] - Optional email to check if this person has already RSVP'd
 * @returns {Promise<Object>} - Response containing RSVP status information
 */
export async function checkEventRsvp(eventId, email) {
  try {
    const url = getApiUrl('check-event-rsvp');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_id: eventId,
        email: email || undefined
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to check event RSVP status');
    }
    
    return data;
  } catch (error) {
    console.error('Error checking event RSVP status:', error);
    throw error;
  }
}
