/**
 * Volunteer API Integration
 * Provides backward-compatible functions for existing forms
 */

/**
 * Volunteer API Integration
 * Provides backward-compatible functions for existing forms
 */

// Helper function to get API URL based on environment
function getApiUrl(endpoint) {
  // First, try to use Hugo-injected API configuration
  if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
    return `${window.API_CONFIG.BASE_URL}/${endpoint}`;
  }
  
  // Fallback to environment detection for localhost development
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    // Use staging APIs for localhost development
    const stagingBase = 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging';
    return `${stagingBase}/${endpoint}`;
  } else {
    // Use production APIs as final fallback
    const prodBase = 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod';
    return `${prodBase}/${endpoint}`;
  }
}

// Legacy function for checking event RSVP status
async function checkEventRsvp(eventId, email) {
  try {
    const response = await fetch(getApiUrl('check-event-rsvp'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_id: eventId,
        email: email
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

// Legacy function for checking volunteer waiver status
async function checkVolunteerWaiver(email) {
  try {
    const response = await fetch(getApiUrl('check-volunteer-waiver'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to check waiver status');
    }
    
    return data;
  } catch (error) {
    console.error('Error checking waiver status:', error);
    throw error;
  }
}

// Enhanced function for authenticated RSVP submission
async function submitEventRsvp(eventId, firstName, lastName, email, attendanceCap) {
  // Check if user is authenticated
  if (window.authClient && window.authClient.isAuthenticated()) {
    // Use authenticated API
    return await window.authClient.submitEventRsvp(eventId, firstName, lastName, attendanceCap);
  } else {
    // Redirect to authentication flow
    const currentUrl = window.location.href;
    const loginUrl = `/volunteer?redirect=${encodeURIComponent(currentUrl)}&event=${eventId}&firstName=${firstName}&lastName=${lastName}`;
    
    if (confirm('You need to log in to RSVP for events. Would you like to log in now?')) {
      window.location.href = loginUrl;
    } else {
      throw new Error('Authentication required to RSVP for events');
    }
  }
}

// Enhanced function for authenticated waiver submission
async function submitVolunteerWaiver(waiverData) {
  // Check if user is authenticated
  if (window.authClient && window.authClient.isAuthenticated()) {
    // Use authenticated API
    return await window.authClient.submitWaiver(waiverData);
  } else {
    // Redirect to authentication flow
    const currentUrl = window.location.href;
    const loginUrl = `/volunteer?redirect=${encodeURIComponent(currentUrl)}`;
    
    if (confirm('You need to log in to submit a waiver. Would you like to log in now?')) {
      window.location.href = loginUrl;
    } else {
      throw new Error('Authentication required to submit waivers');
    }
  }
}

// Utility function to check if user is authenticated
function isUserAuthenticated() {
  return window.authClient && window.authClient.isAuthenticated();
}

// Utility function to get current user email
function getCurrentUserEmail() {
  return window.authClient ? window.authClient.getUserEmail() : null;
}

// Utility function to logout user
function logoutUser() {
  if (window.authClient) {
    window.authClient.logout();
  }
}

// Function to handle authentication redirect after login
function handleAuthRedirect() {
  const urlParams = new URLSearchParams(window.location.search);
  const redirect = urlParams.get('redirect');
  const eventId = urlParams.get('event');
  const firstName = urlParams.get('firstName');
  const lastName = urlParams.get('lastName');
  
  if (redirect && isUserAuthenticated()) {
    // If there's RSVP data, try to submit it first
    if (eventId && firstName && lastName) {
      submitEventRsvp(eventId, firstName, lastName, getCurrentUserEmail())
        .then(() => {
          alert('RSVP submitted successfully!');
          window.location.href = redirect;
        })
        .catch((error) => {
          console.error('Error submitting RSVP:', error);
          window.location.href = redirect;
        });
    } else {
      // Just redirect back
      window.location.href = redirect;
    }
  }
}

// Auto-handle redirect on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleAuthRedirect);
} else {
  handleAuthRedirect();
}

// Export functions for global use
window.volunteerAPI = {
  checkEventRsvp,
  checkVolunteerWaiver,
  submitEventRsvp,
  submitVolunteerWaiver,
  isUserAuthenticated,
  getCurrentUserEmail,
  logoutUser,
  handleAuthRedirect
};