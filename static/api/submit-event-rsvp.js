/**
 * Submit Event RSVP API Client
 * 
 * This file provides functions to submit an RSVP for an event.
 */

/**
 * Submit an RSVP for an event
 * @param {string} eventId - The unique identifier for the event
 * @param {string} firstName - First name of the person registering
 * @param {string} lastName - Last name of the person registering
 * @param {string} email - Email address of the person registering
 * @param {number} [attendanceCap] - Optional override for the event attendance cap (defaults to 15)
 * @returns {Promise<Object>} - Response containing the submission status
 */
export async function submitEventRsvp(eventId, firstName, lastName, email, attendanceCap) {
  try {
    const url = document.currentScript 
      ? new URL(document.currentScript.src).origin + '/submit-event-rsvp'
      : '/submit-event-rsvp';
    
    const payload = {
      event_id: eventId,
      first_name: firstName,
      last_name: lastName,
      email: email
    };
    
    // Only add attendance_cap if it's explicitly provided
    if (attendanceCap !== undefined) {
      payload.attendance_cap = attendanceCap;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit event RSVP');
    }
    
    return data;
  } catch (error) {
    console.error('Error submitting event RSVP:', error);
    throw error;
  }
}
