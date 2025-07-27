/**
 * Event RSVP System
 * 
 * This script handles the RSVP form functionality for events.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize all RSVP widgets on the page
  const rsvpWidgets = document.querySelectorAll('.event-rsvp-widget');
  rsvpWidgets.forEach(initializeRsvpWidget);
});

/**
 * Initialize a single RSVP widget
 * @param {HTMLElement} widget - The RSVP widget element to initialize
 */
function initializeRsvpWidget(widget) {
  const eventId = widget.dataset.eventId;
  const attendanceCap = parseInt(widget.dataset.attendanceCap || '15', 10);
  const rsvpButton = widget.querySelector('.rsvp-toggle-button');
  const rsvpForm = widget.querySelector('.rsvp-form');
  const rsvpStatus = widget.querySelector('.rsvp-status');
  const rsvpCount = widget.querySelector('.rsvp-count');
  const rsvpCapacity = widget.querySelector('.rsvp-capacity');
  const rsvpSubmitButton = widget.querySelector('.rsvp-submit');
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  const rsvpErrorMessage = widget.querySelector('.rsvp-error');

  // Set initial capacity display
  if (rsvpCapacity) {
    rsvpCapacity.textContent = attendanceCap;
  }

  // Check initial RSVP status for this event
  updateRsvpCount(eventId, rsvpCount, rsvpStatus, attendanceCap);

  // Toggle form visibility when button is clicked
  if (rsvpButton) {
    rsvpButton.addEventListener('click', () => {
      rsvpForm.classList.toggle('hidden');
      if (!rsvpForm.classList.contains('hidden')) {
        // Focus the first input when form is shown
        const firstInput = rsvpForm.querySelector('input');
        if (firstInput) firstInput.focus();
        
        // Fire Google Analytics event for intent to register
        if (typeof gtag === 'function') {
          gtag('event', 'intent_to_register', {
            'cleanup_id': eventId
          });
          console.log(`Fired gtag event 'intent_to_register' for cleanup_id: ${eventId}`);
        } else {
          console.warn('gtag function not found. Unable to fire intent_to_register event.');
        }
      }
    });
  }

  // Handle form submission
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Hide any previous messages
      if (rsvpSuccessMessage) rsvpSuccessMessage.classList.add('hidden');
      if (rsvpErrorMessage) {
        rsvpErrorMessage.classList.add('hidden');
        rsvpErrorMessage.textContent = '';
      }

      // Disable submit button during submission
      if (rsvpSubmitButton) {
        rsvpSubmitButton.disabled = true;
        rsvpSubmitButton.textContent = 'Submitting...';
      }

      // Get form data
      const formData = new FormData(rsvpForm);
      const firstName = formData.get('first_name');
      const lastName = formData.get('last_name');
      const email = formData.get('email');

      try {
        // Submit the RSVP
        const result = await submitEventRsvp(
          eventId, 
          firstName, 
          lastName, 
          email, 
          attendanceCap
        );
        
        if (result.success) {
          // Show success message
          if (rsvpSuccessMessage) {
            rsvpSuccessMessage.classList.remove('hidden');
          }
          
          // Clear and hide form
          rsvpForm.reset();
          rsvpForm.classList.add('hidden');
          
          // Update RSVP count
          updateRsvpCount(eventId, rsvpCount, rsvpStatus, attendanceCap);
        }
      } catch (error) {
        // Show error message
        if (rsvpErrorMessage) {
          rsvpErrorMessage.textContent = error.message || 'Failed to submit RSVP. Please try again.';
          rsvpErrorMessage.classList.remove('hidden');
        }
        console.error('RSVP submission error:', error);
      } finally {
        // Re-enable submit button
        if (rsvpSubmitButton) {
          rsvpSubmitButton.disabled = false;
          rsvpSubmitButton.textContent = 'Submit';
        }
      }
    });
  }
}

/**
 * Update the displayed RSVP count
 * @param {string} eventId - The event ID
 * @param {HTMLElement} countElement - Element to display the RSVP count
 * @param {HTMLElement} statusElement - Element to display the status message
 * @param {number} attendanceCap - Maximum number of attendees
 */
async function updateRsvpCount(eventId, countElement, statusElement, attendanceCap) {
  try {
    const data = await checkEventRsvp(eventId);
    
    if (countElement) {
      countElement.textContent = data.rsvp_count;
    }
    
    if (statusElement) {
      if (data.rsvp_count >= attendanceCap) {
        statusElement.textContent = 'This event is now full';
        statusElement.classList.add('text-red-500');
      } else {
        const spotsLeft = attendanceCap - data.rsvp_count;
        statusElement.textContent = `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`;
        statusElement.classList.remove('text-red-500');
      }
    }
  } catch (error) {
    console.error('Error updating RSVP count:', error);
    if (statusElement) {
      statusElement.textContent = 'Unable to check RSVP status';
    }
  }
}

/**
 * Check the RSVP status for an event
 * @param {string} eventId - The unique identifier for the event
 * @param {string} [email] - Optional email to check if this person has already RSVP'd
 * @returns {Promise<Object>} - Response containing RSVP status information
 */
async function checkEventRsvp(eventId, email) {
  try {
    // API endpoint URL from Terraform output
    const url = 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/prod/check-event-rsvp';
    
    const requestOptions = {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit', // Changed from 'same-origin' to 'omit' for cross-origin requests
      headers: {
        'Content-Type': 'application/json',
      },
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({
        event_id: eventId,
        email: email || undefined
      }),
    };

    console.log(`Sending request to ${url} with event_id ${eventId}`, requestOptions);
    
    const response = await fetch(url, requestOptions);
    console.log('Received response:', response);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', errorText);
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.error || `Error: ${response.status} ${response.statusText}`);
      } catch (e) {
        throw new Error(`Error: ${response.status} ${response.statusText}. ${errorText}`);
      }
    }
    
    const data = await response.json();
    console.log('Parsed response data:', data);
    
    return data;
  } catch (error) {
    console.error('Error checking event RSVP status:', error);
    throw error;
  }
}

/**
 * Submit an RSVP for an event
 * @param {string} eventId - The unique identifier for the event
 * @param {string} firstName - First name of the person registering
 * @param {string} lastName - Last name of the person registering
 * @param {string} email - Email address of the person registering
 * @param {number} [attendanceCap] - Optional override for the event attendance cap (defaults to 15)
 * @returns {Promise<Object>} - Response containing the submission status
 */
async function submitEventRsvp(eventId, firstName, lastName, email, attendanceCap) {
  try {
    // API endpoint URL from Terraform output
    const url = 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/prod/submit-event-rsvp';
    
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
    
    const requestOptions = {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit', // Changed from 'same-origin' to 'omit' for cross-origin requests
      headers: {
        'Content-Type': 'application/json',
      },
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify(payload),
    };

    console.log(`Sending request to ${url}`, requestOptions);
    
    const response = await fetch(url, requestOptions);
    console.log('Received response:', response);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', errorText);
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.error || `Error: ${response.status} ${response.statusText}`);
      } catch (e) {
        throw new Error(`Error: ${response.status} ${response.statusText}. ${errorText}`);
      }
    }
    
    const data = await response.json();
    console.log('Parsed response data:', data);
    
    return data;
  } catch (error) {
    console.error('Error submitting event RSVP:', error);
    throw error;
  }
}
