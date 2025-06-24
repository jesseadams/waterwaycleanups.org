/**
 * Check Event RSVP API Client
 * 
 * This file provides functions to check the RSVP status of an event.
 */

/**
 * Check the RSVP status for an event
 * @param {string} eventId - The unique identifier for the event
 * @param {string} [email] - Optional email to check if this person has already RSVP'd
 * @returns {Promise<Object>} - Response containing RSVP status information
 */
export async function checkEventRsvp(eventId, email) {
  try {
    const url = document.currentScript 
      ? new URL(document.currentScript.src).origin + '/check-event-rsvp'
      : '/check-event-rsvp';
    
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
