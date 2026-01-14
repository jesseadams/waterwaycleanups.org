/**
 * Mark Event No-Show API Client
 * 
 * This file provides functions to mark RSVPs as no-shows (admin function).
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
 * Mark an RSVP as no-show (admin function)
 * @param {string} eventId - The unique identifier for the event
 * @param {string} email - Email of the person to mark as no-show
 * @param {boolean} noShow - Whether to mark as no-show (true) or remove no-show status (false)
 * @returns {Promise<Object>} - Response containing the operation status
 */
export async function markEventNoShow(eventId, email, noShow = true) {
  try {
    const url = getApiUrl('mark-event-noshow');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_id: eventId,
        email: email,
        no_show: noShow
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update no-show status');
    }
    
    return data;
  } catch (error) {
    console.error('Error updating no-show status:', error);
    throw error;
  }
}

/**
 * Get volunteer metrics for analysis
 * @param {string} email - Email of the volunteer (optional)
 * @returns {Promise<Object>} - Volunteer metrics data
 */
export async function getVolunteerMetrics(email = null) {
  try {
    // This would be implemented as a separate endpoint
    // For now, this is a placeholder for future implementation
    console.log('Volunteer metrics endpoint not yet implemented');
    return {
      total_rsvps: 0,
      total_cancellations: 0,
      total_no_shows: 0,
      average_cancellation_hours: 0,
      reliability_score: 100
    };
  } catch (error) {
    console.error('Error getting volunteer metrics:', error);
    throw error;
  }
}