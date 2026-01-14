/**
 * Event RSVP System
 * 
 * This script handles the RSVP form functionality for events.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize all RSVP widgets on the page
  const rsvpWidgets = document.querySelectorAll('.event-rsvp-widget');
  rsvpWidgets.forEach(widget => {
    // Call async initialization but don't await (fire and forget)
    initializeRsvpWidget(widget).catch(error => {
      console.error('Error initializing RSVP widget:', error);
    });
  });
});

/**
 * Initialize a single RSVP widget
 * @param {HTMLElement} widget - The RSVP widget element to initialize
 */
async function initializeRsvpWidget(widget) {
  const eventId = widget.dataset.eventId;
  const attendanceCap = parseInt(widget.dataset.attendanceCap || '15', 10);
  const rsvpButton = widget.querySelector('.rsvp-toggle-button');
  const rsvpStatus = widget.querySelector('.rsvp-status');
  const rsvpCount = widget.querySelector('.rsvp-count');
  const rsvpCapacity = widget.querySelector('.rsvp-capacity');
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  const rsvpErrorMessage = widget.querySelector('.rsvp-error');

  // Set initial capacity display
  if (rsvpCapacity) {
    rsvpCapacity.textContent = attendanceCap;
  }

  // Check initial RSVP status for this event
  updateRsvpCount(eventId, rsvpCount, rsvpStatus, attendanceCap);
  
  // Check if user is authenticated and fetch minors list
  let minorsList = [];
  if (window.authClient && window.authClient.isAuthenticated()) {
    try {
      // Try to get minors from session storage first
      const cachedMinors = sessionStorage.getItem('auth_minors_list');
      if (cachedMinors) {
        const cached = JSON.parse(cachedMinors);
        // Check if cache is less than 5 minutes old
        if (cached.timestamp && (Date.now() - cached.timestamp) < 5 * 60 * 1000) {
          minorsList = cached.minors;
          console.log('Using cached minors list:', minorsList);
        }
      }
      
      // If no valid cache, fetch from API
      if (minorsList.length === 0) {
        const minorsResponse = await window.authClient.getMinorsList();
        if (minorsResponse.success && minorsResponse.minors) {
          minorsList = minorsResponse.minors;
          // Cache in session storage with timestamp
          sessionStorage.setItem('auth_minors_list', JSON.stringify({
            minors: minorsList,
            timestamp: Date.now()
          }));
          console.log('Fetched and cached minors list:', minorsList);
        }
      }
    } catch (error) {
      console.error('Error fetching minors list:', error);
      // Continue with empty minors list - will show single-person UI
    }
  }
  
  // Check if user has already RSVP'd (with a small delay to ensure auth client is loaded)
  setTimeout(() => {
    checkUserRsvpStatus(widget, eventId);
  }, 100);

  // Toggle form visibility when button is clicked
  if (rsvpButton) {
    rsvpButton.addEventListener('click', async () => {
      // Check if user is authenticated
      const isAuthenticated = window.authClient && window.authClient.isAuthenticated();
      
      if (!isAuthenticated) {
        // Redirect to volunteer page with return URL
        const currentUrl = window.location.href;
        const returnUrl = encodeURIComponent(currentUrl);
        const rsvpAction = encodeURIComponent(`rsvp:${eventId}`);
        window.location.href = `/volunteer/?return=${returnUrl}&action=${rsvpAction}`;
        return;
      }

      // User is authenticated - determine which UI to show based on minors count
      if (minorsList.length > 0) {
        // Render multi-person selector UI
        await renderMultiPersonSelector(widget, eventId, minorsList, attendanceCap);
      } else {
        // Render existing single-person form (direct RSVP)
        await handleDirectRsvp(widget, eventId, attendanceCap);
      }
    });
  }
}

/**
 * Render multi-person attendee selector UI
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {string} eventId - The event ID
 * @param {Array} minorsList - List of minors for the authenticated user
 * @param {number} attendanceCap - The attendance cap
 */
async function renderMultiPersonSelector(widget, eventId, minorsList, attendanceCap) {
  console.log('Rendering multi-person selector for event:', eventId);
  console.log('Minors list:', minorsList);
  
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  const rsvpErrorMessage = widget.querySelector('.rsvp-error');
  
  // Hide any previous messages
  if (rsvpSuccessMessage) rsvpSuccessMessage.classList.add('hidden');
  if (rsvpErrorMessage) {
    rsvpErrorMessage.classList.add('hidden');
    rsvpErrorMessage.textContent = '';
  }
  
  // Get user info
  const userEmail = window.authClient ? window.authClient.getUserEmail() : localStorage.getItem('auth_user_email');
  if (!userEmail) {
    if (rsvpErrorMessage) {
      rsvpErrorMessage.textContent = 'Unable to get user email. Please refresh and try again.';
      rsvpErrorMessage.classList.remove('hidden');
    }
    return;
  }
  
  // Fetch existing RSVPs to determine which attendees are already registered
  let existingRsvps = [];
  try {
    const rsvpStatus = await checkEventRsvp(eventId, userEmail);
    if (rsvpStatus.user_rsvps && Array.isArray(rsvpStatus.user_rsvps)) {
      existingRsvps = rsvpStatus.user_rsvps;
    }
  } catch (error) {
    console.error('Error fetching existing RSVPs:', error);
    // Continue without existing RSVPs - checkboxes won't be disabled
  }
  
  // Build the multi-person selector UI
  const selectorHtml = buildMultiPersonSelectorHtml(userEmail, minorsList, existingRsvps, attendanceCap);
  
  // Insert the selector into the widget
  // Find or create a container for the selector
  let selectorContainer = widget.querySelector('.multi-person-selector-container');
  if (!selectorContainer) {
    selectorContainer = document.createElement('div');
    selectorContainer.className = 'multi-person-selector-container mt-4';
    
    // Insert after the button
    const rsvpButton = widget.querySelector('.rsvp-toggle-button');
    if (rsvpButton) {
      rsvpButton.insertAdjacentElement('afterend', selectorContainer);
    } else {
      widget.appendChild(selectorContainer);
    }
  }
  
  selectorContainer.innerHTML = selectorHtml;
  
  // Initialize the selector state and event handlers
  initializeMultiPersonSelector(widget, eventId, userEmail, minorsList, attendanceCap, existingRsvps);
}

/**
 * Build the HTML for the multi-person selector
 * @param {string} userEmail - The volunteer's email
 * @param {Array} minorsList - List of minors
 * @param {Array} existingRsvps - List of existing RSVPs
 * @param {number} attendanceCap - The attendance cap
 * @returns {string} HTML string for the selector
 */
function buildMultiPersonSelectorHtml(userEmail, minorsList, existingRsvps, attendanceCap) {
  // Check if volunteer is already registered
  const volunteerRsvp = existingRsvps.find(rsvp => 
    rsvp.attendee_type === 'volunteer' && rsvp.attendee_id === userEmail
  );
  const volunteerRegistered = !!volunteerRsvp;
  
  // Build attendee list HTML
  let attendeesHtml = '';
  
  // Add volunteer as first option
  attendeesHtml += `
    <div class="attendee-item flex items-center p-3 border border-gray-200 rounded mb-2 ${volunteerRegistered ? 'bg-gray-50' : 'hover:bg-gray-50'}">
      <input 
        type="checkbox" 
        id="attendee-volunteer-${userEmail}" 
        class="attendee-checkbox mr-3 h-5 w-5"
        data-attendee-type="volunteer"
        data-attendee-id="${userEmail}"
        data-attendee-email="${userEmail}"
        ${volunteerRegistered ? 'disabled checked' : 'checked'}
      />
      <label for="attendee-volunteer-${userEmail}" class="flex-1 cursor-pointer ${volunteerRegistered ? 'cursor-not-allowed' : ''}">
        <div class="font-semibold text-gray-900">You (Volunteer)</div>
        <div class="text-sm text-gray-600">${userEmail}</div>
        ${volunteerRegistered ? '<div class="text-xs text-green-600 font-semibold mt-1">✓ Already Registered</div>' : ''}
      </label>
      ${volunteerRegistered ? `
        <button 
          type="button" 
          class="cancel-attendee-button ml-2 px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded focus:outline-none focus:shadow-outline"
          data-attendee-type="volunteer"
          data-attendee-id="${userEmail}"
          data-attendee-name="You (Volunteer)"
        >
          Cancel
        </button>
      ` : ''}
    </div>
  `;
  
  // Add minors
  minorsList.forEach(minor => {
    const minorRsvp = existingRsvps.find(rsvp => 
      rsvp.attendee_type === 'minor' && rsvp.attendee_id === minor.minor_id
    );
    const minorRegistered = !!minorRsvp;
    
    attendeesHtml += `
      <div class="attendee-item flex items-center p-3 border border-gray-200 rounded mb-2 ${minorRegistered ? 'bg-gray-50' : 'hover:bg-gray-50'}">
        <input 
          type="checkbox" 
          id="attendee-minor-${minor.minor_id}" 
          class="attendee-checkbox mr-3 h-5 w-5"
          data-attendee-type="minor"
          data-attendee-id="${minor.minor_id}"
          data-attendee-first-name="${minor.first_name}"
          data-attendee-last-name="${minor.last_name}"
          data-attendee-age="${minor.age}"
          ${minorRegistered ? 'disabled checked' : ''}
        />
        <label for="attendee-minor-${minor.minor_id}" class="flex-1 cursor-pointer ${minorRegistered ? 'cursor-not-allowed' : ''}">
          <div class="font-semibold text-gray-900">${minor.first_name} ${minor.last_name} (Minor)</div>
          <div class="text-sm text-gray-600">Age: ${minor.age}</div>
          ${minorRegistered ? '<div class="text-xs text-green-600 font-semibold mt-1">✓ Already Registered</div>' : ''}
        </label>
        ${minorRegistered ? `
          <button 
            type="button" 
            class="cancel-attendee-button ml-2 px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded focus:outline-none focus:shadow-outline"
            data-attendee-type="minor"
            data-attendee-id="${minor.minor_id}"
            data-attendee-name="${minor.first_name} ${minor.last_name}"
          >
            Cancel
          </button>
        ` : ''}
      </div>
    `;
  });
  
  return `
    <div class="multi-person-selector">
      <h4 class="text-lg font-semibold text-gray-900 mb-3">Select Attendees</h4>
      <p class="text-sm text-gray-600 mb-4">Choose who will attend this event:</p>
      
      <div class="attendees-list mb-4">
        ${attendeesHtml}
      </div>
      
      <div class="selection-summary flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded mb-4">
        <div>
          <span class="font-semibold text-gray-900">Selected: </span>
          <span class="selected-count font-bold text-blue-600">0</span>
          <span class="text-gray-600"> attendee(s)</span>
        </div>
        <div class="text-sm text-gray-600">
          <span class="remaining-capacity">${attendanceCap}</span> spots remaining
        </div>
      </div>
      
      <div class="flex gap-2">
        <button type="button" class="submit-multi-rsvp-button bg-eden-green hover:bg-green-700 text-white py-2 px-4 rounded focus:outline-none focus:shadow-outline flex-1">
          Register Selected
        </button>
        <button type="button" class="cancel-multi-rsvp-button bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded focus:outline-none focus:shadow-outline">
          Cancel
        </button>
      </div>
      
      <div class="validation-error hidden mt-3 p-3 bg-red-100 text-red-700 border border-red-200 rounded text-sm">
      </div>
    </div>
  `;
}

/**
 * Initialize the multi-person selector with state management and event handlers
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {string} eventId - The event ID
 * @param {string} userEmail - The volunteer's email
 * @param {Array} minorsList - List of minors
 * @param {number} attendanceCap - The attendance cap
 * @param {Array} existingRsvps - List of existing RSVPs
 */
function initializeMultiPersonSelector(widget, eventId, userEmail, minorsList, attendanceCap, existingRsvps) {
  const selectorContainer = widget.querySelector('.multi-person-selector-container');
  if (!selectorContainer) return;
  
  // Get UI elements
  const checkboxes = selectorContainer.querySelectorAll('.attendee-checkbox:not([disabled])');
  const selectedCountElement = selectorContainer.querySelector('.selected-count');
  const remainingCapacityElement = selectorContainer.querySelector('.remaining-capacity');
  const submitButton = selectorContainer.querySelector('.submit-multi-rsvp-button');
  const cancelButton = selectorContainer.querySelector('.cancel-multi-rsvp-button');
  const validationError = selectorContainer.querySelector('.validation-error');
  
  // State: track selected attendees
  let selectedAttendees = [];
  
  // Update the selected count and remaining capacity display
  function updateSelectionSummary() {
    const selectedCount = selectedAttendees.length;
    
    if (selectedCountElement) {
      selectedCountElement.textContent = selectedCount;
    }
    
    // Fetch current RSVP count to calculate remaining capacity
    checkEventRsvp(eventId).then(data => {
      const currentCount = data.rsvp_count || 0;
      const remaining = attendanceCap - currentCount;
      
      if (remainingCapacityElement) {
        remainingCapacityElement.textContent = Math.max(0, remaining);
      }
    }).catch(error => {
      console.error('Error fetching RSVP count:', error);
      // Keep the default capacity display
    });
  }
  
  // Handle checkbox change
  function handleCheckboxChange(event) {
    const checkbox = event.target;
    const attendeeType = checkbox.dataset.attendeeType;
    const attendeeId = checkbox.dataset.attendeeId;
    
    if (checkbox.checked) {
      // Add to selected attendees
      const attendeeData = {
        type: attendeeType,
        id: attendeeId
      };
      
      if (attendeeType === 'volunteer') {
        attendeeData.email = checkbox.dataset.attendeeEmail;
      } else if (attendeeType === 'minor') {
        attendeeData.minor_id = attendeeId;
        attendeeData.first_name = checkbox.dataset.attendeeFirstName;
        attendeeData.last_name = checkbox.dataset.attendeeLastName;
        attendeeData.age = parseInt(checkbox.dataset.attendeeAge, 10);
      }
      
      selectedAttendees.push(attendeeData);
    } else {
      // Remove from selected attendees
      selectedAttendees = selectedAttendees.filter(a => 
        !(a.type === attendeeType && a.id === attendeeId)
      );
    }
    
    updateSelectionSummary();
    
    // Clear validation error when selection changes
    if (validationError) {
      validationError.classList.add('hidden');
      validationError.textContent = '';
    }
  }
  
  // Attach checkbox event listeners
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleCheckboxChange);
    
    // If checkbox is already checked (like the volunteer by default), add to selectedAttendees
    if (checkbox.checked && !checkbox.disabled) {
      const attendeeType = checkbox.dataset.attendeeType;
      const attendeeId = checkbox.dataset.attendeeId;
      
      const attendeeData = {
        type: attendeeType,
        id: attendeeId
      };
      
      if (attendeeType === 'volunteer') {
        attendeeData.email = checkbox.dataset.attendeeEmail;
      } else if (attendeeType === 'minor') {
        attendeeData.minor_id = attendeeId;
        attendeeData.first_name = checkbox.dataset.attendeeFirstName;
        attendeeData.last_name = checkbox.dataset.attendeeLastName;
        attendeeData.age = parseInt(checkbox.dataset.attendeeAge, 10);
      }
      
      selectedAttendees.push(attendeeData);
    }
  });
  
  // Attach cancel button event listeners
  const cancelButtons = selectorContainer.querySelectorAll('.cancel-attendee-button');
  cancelButtons.forEach(button => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      const attendeeType = button.dataset.attendeeType;
      const attendeeId = button.dataset.attendeeId;
      const attendeeName = button.dataset.attendeeName;
      
      // If cancelling the volunteer, warn that all RSVPs will be cancelled
      let confirmMessage = `Are you sure you want to cancel the registration for ${attendeeName}?\n\n`;
      
      if (attendeeType === 'volunteer') {
        // Check if there are any minors registered
        const minorButtons = Array.from(cancelButtons).filter(btn => 
          btn.dataset.attendeeType === 'minor'
        );
        
        if (minorButtons.length > 0) {
          confirmMessage += 'This will also cancel all minor registrations since minors cannot attend without an adult.\n\n';
        }
      }
      
      confirmMessage += 'This action cannot be undone.';
      
      // Show confirmation dialog
      const confirmed = confirm(confirmMessage);
      
      if (!confirmed) {
        return;
      }
      
      // Disable button during processing
      button.disabled = true;
      button.textContent = 'Cancelling...';
      
      try {
        // If cancelling volunteer, cancel all RSVPs
        if (attendeeType === 'volunteer') {
          // Get all registered attendees
          const allCancelButtons = Array.from(cancelButtons);
          
          // Cancel all RSVPs (volunteer first, then minors)
          for (const btn of allCancelButtons) {
            const btnType = btn.dataset.attendeeType;
            const btnId = btn.dataset.attendeeId;
            const btnName = btn.dataset.attendeeName;
            
            try {
              await handleIndividualCancellation(widget, eventId, btnId, btnType, btnName, attendanceCap);
            } catch (error) {
              console.error(`Error cancelling RSVP for ${btnName}:`, error);
            }
          }
        } else {
          // Just cancel the individual minor
          await handleIndividualCancellation(widget, eventId, attendeeId, attendeeType, attendeeName, attendanceCap);
        }
      } catch (error) {
        console.error('Error cancelling RSVP:', error);
        
        // Show error message
        if (validationError) {
          validationError.textContent = error.message || 'Failed to cancel RSVP. Please try again.';
          validationError.classList.remove('hidden');
        }
        
        // Re-enable button
        button.disabled = false;
        button.textContent = 'Cancel';
      }
    });
  });
  
  // Handle submit button click
  if (submitButton) {
    submitButton.addEventListener('click', async () => {
      // Validate: at least one attendee must be selected
      if (selectedAttendees.length === 0) {
        if (validationError) {
          validationError.textContent = 'Please select at least one attendee to register.';
          validationError.classList.remove('hidden');
        }
        return;
      }
      
      // Validate: at least one adult (volunteer) must be selected if any minors are selected
      const hasMinors = selectedAttendees.some(att => att.type === 'minor');
      const hasVolunteer = selectedAttendees.some(att => att.type === 'volunteer');
      
      if (hasMinors && !hasVolunteer) {
        if (validationError) {
          validationError.textContent = 'Minors cannot attend without an adult. Please select yourself as an attendee.';
          validationError.classList.remove('hidden');
        }
        return;
      }
      
      // Clear validation error
      if (validationError) {
        validationError.classList.add('hidden');
        validationError.textContent = '';
      }
      
      // Disable submit button during processing
      submitButton.disabled = true;
      submitButton.textContent = 'Registering...';
      
      try {
        // Submit the multi-person RSVP (this will be implemented in task 7)
        await handleMultiPersonRsvpSubmission(widget, eventId, selectedAttendees, attendanceCap);
      } catch (error) {
        console.error('Error submitting multi-person RSVP:', error);
        if (validationError) {
          validationError.textContent = error.message || 'Failed to submit RSVP. Please try again.';
          validationError.classList.remove('hidden');
        }
      } finally {
        // Re-enable submit button
        submitButton.disabled = false;
        submitButton.textContent = 'Register Selected';
      }
    });
  }
  
  // Handle cancel button click
  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      // Remove the selector and reset the widget
      if (selectorContainer) {
        selectorContainer.remove();
      }
      
      // Reset the RSVP button
      const rsvpButton = widget.querySelector('.rsvp-toggle-button');
      if (rsvpButton) {
        rsvpButton.disabled = false;
      }
    });
  }
  
  // Initial update
  updateSelectionSummary();
}

/**
 * Handle multi-person RSVP submission
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {string} eventId - The event ID
 * @param {Array} selectedAttendees - Array of selected attendees
 * @param {number} attendanceCap - The attendance cap
 */
async function handleMultiPersonRsvpSubmission(widget, eventId, selectedAttendees, attendanceCap) {
  console.log('Multi-person RSVP submission:', {
    eventId,
    selectedAttendees,
    attendanceCap
  });
  
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  const rsvpErrorMessage = widget.querySelector('.rsvp-error');
  const rsvpCount = widget.querySelector('.rsvp-count');
  const rsvpStatus = widget.querySelector('.rsvp-status');
  
  // Hide any previous messages
  if (rsvpSuccessMessage) rsvpSuccessMessage.classList.add('hidden');
  if (rsvpErrorMessage) {
    rsvpErrorMessage.classList.add('hidden');
    rsvpErrorMessage.textContent = '';
  }
  
  try {
    // Task 7.1: Build attendees array from selection
    const attendeesArray = buildAttendeesArray(selectedAttendees);
    console.log('Built attendees array:', attendeesArray);
    
    // Task 7.2: Submit multi-person RSVP request
    const result = await submitMultiPersonRsvp(eventId, attendeesArray, attendanceCap);
    console.log('Multi-person RSVP result:', result);
    
    // Task 7.3: Update UI based on submission result
    updateUIAfterSubmission(widget, result, eventId, attendanceCap);
    
  } catch (error) {
    console.error('Error in multi-person RSVP submission:', error);
    
    // Show error message with details
    if (rsvpErrorMessage) {
      rsvpErrorMessage.textContent = error.message || 'Failed to submit RSVP. Please try again.';
      rsvpErrorMessage.classList.remove('hidden');
    }
    
    throw error; // Re-throw to be handled by the caller
  }
}

/**
 * Task 7.1: Build attendees array from selection
 * Maps selected checkboxes to attendee objects with complete information
 * @param {Array} selectedAttendees - Array of selected attendee data from checkboxes
 * @returns {Array} Formatted attendees array for API submission
 */
function buildAttendeesArray(selectedAttendees) {
  return selectedAttendees.map(attendee => {
    if (attendee.type === 'volunteer') {
      // Volunteer attendee
      return {
        type: 'volunteer',
        email: attendee.email,
        first_name: attendee.first_name || 'Volunteer',
        last_name: attendee.last_name || 'User'
      };
    } else if (attendee.type === 'minor') {
      // Minor attendee
      return {
        type: 'minor',
        minor_id: attendee.minor_id || attendee.id,
        first_name: attendee.first_name,
        last_name: attendee.last_name,
        age: attendee.age
      };
    } else {
      console.warn('Unknown attendee type:', attendee.type);
      return null;
    }
  }).filter(attendee => attendee !== null); // Remove any null entries
}

/**
 * Task 7.2: Submit multi-person RSVP request
 * Calls the enhanced submit-event-rsvp API with attendees array
 * @param {string} eventId - The event ID
 * @param {Array} attendeesArray - Array of attendee objects
 * @param {number} attendanceCap - The attendance cap
 * @returns {Promise<Object>} API response with per-attendee results
 */
async function submitMultiPersonRsvp(eventId, attendeesArray, attendanceCap) {
  // Get session token from localStorage
  const sessionToken = localStorage.getItem('auth_session_token');
  
  if (!sessionToken) {
    throw new Error('Not authenticated. Please log in and try again.');
  }

  // Determine API URL
  let apiUrl;
  if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
    apiUrl = `${window.API_CONFIG.BASE_URL}/submit-event-rsvp`;
  } else {
    // Fallback URL construction
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocalhost 
      ? 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging'
      : 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod';
    apiUrl = `${baseUrl}/submit-event-rsvp`;
  }

  // Get user email from localStorage
  const userEmail = localStorage.getItem('auth_user_email');
  
  // Build the request payload with attendees array
  const payload = {
    session_token: sessionToken,
    event_id: eventId,
    attendees: attendeesArray,
    email: userEmail  // Include guardian email for minors
  };

  if (attendanceCap !== undefined) {
    payload.attendance_cap = attendanceCap;
  }

  console.log('Sending multi-person RSVP request to:', apiUrl);
  console.log('Payload:', payload);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  
  if (!response.ok) {
    // Handle error responses with specific details
    if (data.error) {
      // Check for specific error types
      if (data.duplicate_attendees && data.duplicate_attendees.length > 0) {
        // Duplicate attendees error
        const duplicateNames = data.duplicate_attendees.map(d => d.name || d.attendee_id).join(', ');
        throw new Error(`The following attendees are already registered: ${duplicateNames}`);
      } else if (data.remaining_capacity !== undefined) {
        // Capacity exceeded error
        throw new Error(`Event capacity exceeded. Only ${data.remaining_capacity} spot(s) remaining.`);
      } else {
        // Generic error
        throw new Error(data.error);
      }
    }
    throw new Error(data.message || 'Failed to submit RSVP');
  }
  
  return data;
}

/**
 * Task 7.3: Update UI based on submission result
 * Shows success/error messages and refreshes RSVP status
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {Object} result - API response with submission results
 * @param {string} eventId - The event ID
 * @param {number} attendanceCap - The attendance cap
 */
function updateUIAfterSubmission(widget, result, eventId, attendanceCap) {
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  const rsvpErrorMessage = widget.querySelector('.rsvp-error');
  const rsvpCount = widget.querySelector('.rsvp-count');
  const rsvpStatus = widget.querySelector('.rsvp-status');
  const selectorContainer = widget.querySelector('.multi-person-selector-container');
  
  if (result.success) {
    // Fire Google Analytics event for multi-person registration
    if (typeof gtag === 'function') {
      gtag('event', 'multi_person_registration', {
        'cleanup_id': eventId,
        'attendee_count': result.results ? result.results.length : 0
      });
      console.log(`Fired gtag event 'multi_person_registration' for cleanup_id: ${eventId}`);
    }
    
    // Build success message with registered attendees
    let successHtml = '<div class="text-center">';
    successHtml += '<div class="text-lg font-semibold text-green-600 mb-2">✅ Registration Successful!</div>';
    
    if (result.results && result.results.length > 0) {
      successHtml += '<div class="text-sm text-gray-700 mb-2">Registered attendees:</div>';
      successHtml += '<ul class="text-sm text-gray-600 space-y-1">';
      
      result.results.forEach(attendeeResult => {
        if (attendeeResult.status === 'registered') {
          const name = attendeeResult.name || attendeeResult.attendee_id;
          const type = attendeeResult.attendee_type === 'volunteer' ? '(Volunteer)' : '(Minor)';
          successHtml += `<li>• ${name} ${type}</li>`;
        }
      });
      
      successHtml += '</ul>';
    }
    
    // Show current attendance if available
    if (result.current_attendance !== undefined) {
      successHtml += `<div class="text-xs text-gray-500 mt-3">Current attendance: ${result.current_attendance}/${attendanceCap}</div>`;
    }
    
    successHtml += '</div>';
    
    // Show success message
    if (rsvpSuccessMessage) {
      rsvpSuccessMessage.innerHTML = successHtml;
      rsvpSuccessMessage.classList.remove('hidden');
    }
    
    // Hide error message
    if (rsvpErrorMessage) {
      rsvpErrorMessage.classList.add('hidden');
      rsvpErrorMessage.textContent = '';
    }
    
    // Remove the selector container
    if (selectorContainer) {
      selectorContainer.remove();
    }
    
    // Update RSVP count and status
    updateRsvpCount(eventId, rsvpCount, rsvpStatus, attendanceCap);
    
    // Refresh user RSVP status after a short delay
    setTimeout(() => {
      checkUserRsvpStatus(widget, eventId);
    }, 500);
    
  } else {
    // Handle error case (though this should be caught by the error handling in submitMultiPersonRsvp)
    if (rsvpErrorMessage) {
      let errorMessage = result.message || result.error || 'Failed to submit RSVP. Please try again.';
      
      // Add specific details if available
      if (result.duplicate_attendees && result.duplicate_attendees.length > 0) {
        const duplicateNames = result.duplicate_attendees.map(d => d.name || d.attendee_id).join(', ');
        errorMessage = `The following attendees are already registered: ${duplicateNames}`;
      } else if (result.remaining_capacity !== undefined) {
        errorMessage = `Event capacity exceeded. Only ${result.remaining_capacity} spot(s) remaining.`;
      }
      
      rsvpErrorMessage.textContent = errorMessage;
      rsvpErrorMessage.classList.remove('hidden');
    }
    
    // Hide success message
    if (rsvpSuccessMessage) {
      rsvpSuccessMessage.classList.add('hidden');
    }
  }
}

/**
 * Task 8.2: Handle individual RSVP cancellation
 * Calls cancel-event-rsvp API with attendee_id and attendee_type
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {string} eventId - The event ID
 * @param {string} attendeeId - The attendee ID (email for volunteer, minor_id for minor)
 * @param {string} attendeeType - The attendee type ('volunteer' or 'minor')
 * @param {string} attendeeName - The attendee name for display
 * @param {number} attendanceCap - The attendance cap
 */
async function handleIndividualCancellation(widget, eventId, attendeeId, attendeeType, attendeeName, attendanceCap) {
  console.log('Individual RSVP cancellation:', {
    eventId,
    attendeeId,
    attendeeType,
    attendeeName
  });
  
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  const rsvpErrorMessage = widget.querySelector('.rsvp-error');
  const rsvpCount = widget.querySelector('.rsvp-count');
  const rsvpStatus = widget.querySelector('.rsvp-status');
  
  // Hide any previous messages
  if (rsvpSuccessMessage) rsvpSuccessMessage.classList.add('hidden');
  if (rsvpErrorMessage) {
    rsvpErrorMessage.classList.add('hidden');
    rsvpErrorMessage.textContent = '';
  }
  
  try {
    // Call cancel-event-rsvp API
    const result = await cancelIndividualRsvp(eventId, attendeeId, attendeeType);
    console.log('Cancellation result:', result);
    
    if (result.success) {
      // Show success message
      if (rsvpSuccessMessage) {
        let message = `Registration cancelled for ${attendeeName}`;
        
        if (result.hours_before_event !== undefined) {
          const hours = Math.round(result.hours_before_event * 10) / 10;
          message += ` (${hours} hours before event)`;
        }
        
        rsvpSuccessMessage.innerHTML = `
          <div class="text-center">
            <span>✅ ${message}</span>
          </div>
        `;
        rsvpSuccessMessage.classList.remove('hidden');
        
        // Hide success message after 5 seconds
        setTimeout(() => {
          if (rsvpSuccessMessage) {
            rsvpSuccessMessage.classList.add('hidden');
          }
        }, 5000);
      }
      
      // Update RSVP count (Requirement 6.4)
      updateRsvpCount(eventId, rsvpCount, rsvpStatus, attendanceCap);
      
      // Remove the cancelled attendee from the UI
      const selectorContainer = widget.querySelector('.multi-person-selector-container');
      if (selectorContainer) {
        // Find and remove the attendee item
        const attendeeItem = selectorContainer.querySelector(
          `[data-attendee-id="${attendeeId}"][data-attendee-type="${attendeeType}"]`
        )?.closest('.attendee-item');
        
        if (attendeeItem) {
          attendeeItem.remove();
        }
      }
      
      // Refresh the multi-person selector to update the UI
      setTimeout(() => {
        // Re-fetch minors list and re-render
        const minorsList = JSON.parse(sessionStorage.getItem('auth_minors_list') || '{"minors":[]}').minors;
        renderMultiPersonSelector(widget, eventId, minorsList, attendanceCap);
      }, 1000);
      
    } else {
      throw new Error(result.message || 'Failed to cancel RSVP');
    }
    
  } catch (error) {
    console.error('Error in individual cancellation:', error);
    
    // Show error message
    if (rsvpErrorMessage) {
      rsvpErrorMessage.textContent = error.message || 'Failed to cancel RSVP. Please try again.';
      rsvpErrorMessage.classList.remove('hidden');
    }
    
    throw error; // Re-throw to be handled by the caller
  }
}

/**
 * Call cancel-event-rsvp API
 * @param {string} eventId - The event ID
 * @param {string} attendeeId - The attendee ID
 * @param {string} attendeeType - The attendee type
 * @returns {Promise<Object>} API response
 */
async function cancelIndividualRsvp(eventId, attendeeId, attendeeType) {
  // Get session token from localStorage
  const sessionToken = localStorage.getItem('auth_session_token');
  
  if (!sessionToken) {
    throw new Error('Not authenticated. Please log in and try again.');
  }

  // Determine API URL
  let apiUrl;
  if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
    apiUrl = `${window.API_CONFIG.BASE_URL}/cancel-event-rsvp`;
  } else {
    // Fallback URL construction
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocalhost 
      ? 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging'
      : 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod';
    apiUrl = `${baseUrl}/cancel-event-rsvp`;
  }

  // Build the request payload
  const payload = {
    session_token: sessionToken,
    event_id: eventId,
    attendee_id: attendeeId,
    attendee_type: attendeeType
  };

  console.log('Sending cancellation request to:', apiUrl);
  console.log('Payload:', payload);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  
  if (!response.ok) {
    // Handle error responses
    if (data.message) {
      throw new Error(data.message);
    }
    throw new Error('Failed to cancel RSVP');
  }
  
  return data;
}

/**
 * Handle direct RSVP for authenticated users
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {string} eventId - The event ID
 * @param {number} attendanceCap - The attendance cap
 */
async function handleDirectRsvp(widget, eventId, attendanceCap) {
  const rsvpButton = widget.querySelector('.rsvp-toggle-button');
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  const rsvpErrorMessage = widget.querySelector('.rsvp-error');
  const rsvpCount = widget.querySelector('.rsvp-count');
  const rsvpStatus = widget.querySelector('.rsvp-status');

  // Hide any previous messages
  if (rsvpSuccessMessage) rsvpSuccessMessage.classList.add('hidden');
  if (rsvpErrorMessage) {
    rsvpErrorMessage.classList.add('hidden');
    rsvpErrorMessage.textContent = '';
  }

  // Disable button during submission
  if (rsvpButton) {
    rsvpButton.disabled = true;
    rsvpButton.textContent = 'Registering...';
  }

  try {
    // Fire Google Analytics event for intent to register
    if (typeof gtag === 'function') {
      gtag('event', 'intent_to_register', {
        'cleanup_id': eventId
      });
      console.log(`Fired gtag event 'intent_to_register' for cleanup_id: ${eventId}`);
    }

    // Get user info from auth client or localStorage
    const userEmail = window.authClient ? window.authClient.getUserEmail() : localStorage.getItem('auth_user_email');
    
    if (!userEmail) {
      throw new Error('Unable to get user email. Please refresh and try again.');
    }

    // For direct RSVP, we need to get the user's name from their profile
    // For now, we'll use placeholder values and let them update later
    const firstName = 'Volunteer'; // This could be enhanced to get real name from profile
    const lastName = 'User';

    // Submit the RSVP using direct API call
    const result = await submitEventRsvpDirect(eventId, firstName, lastName, userEmail, attendanceCap);
    
    if (result.success) {
      // Fire Google Analytics event for registration submission
      if (typeof gtag === 'function') {
        gtag('event', 'registration_submission', {
          'cleanup_id': eventId
        });
        console.log(`Fired gtag event 'registration_submission' for cleanup_id: ${eventId}`);
      }
      
      // Show success message
      if (rsvpSuccessMessage) {
        rsvpSuccessMessage.innerHTML = `
          <div class="text-center">
            <span>✅ You're registered for this event!</span>
            <div class="mt-2 text-sm text-gray-600">
              Registered as: <strong>${userEmail}</strong>
            </div>
          </div>
        `;
        rsvpSuccessMessage.classList.remove('hidden');
      }
      
      // Update RSVP count and check user status
      updateRsvpCount(eventId, rsvpCount, rsvpStatus, attendanceCap);
      setTimeout(() => {
        checkUserRsvpStatus(widget, eventId);
      }, 500);
    }
  } catch (error) {
    // Show error message
    if (rsvpErrorMessage) {
      rsvpErrorMessage.textContent = error.message || 'Failed to submit RSVP. Please try again.';
      rsvpErrorMessage.classList.remove('hidden');
    }
    console.error('RSVP submission error:', error);
  } finally {
    // Re-enable button
    if (rsvpButton) {
      rsvpButton.disabled = false;
      rsvpButton.textContent = 'Sign Up';
    }
  }
}

/**
 * Submit RSVP directly via API
 * @param {string} eventId - Event identifier
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {string} email - User's email
 * @param {number} attendanceCap - Attendance cap
 * @returns {Promise<Object>} RSVP submission result
 */
async function submitEventRsvpDirect(eventId, firstName, lastName, email, attendanceCap) {
  // Get session token from localStorage
  const sessionToken = localStorage.getItem('auth_session_token');
  
  if (!sessionToken) {
    throw new Error('Not authenticated. Please log in and try again.');
  }

  // Determine API URL
  let apiUrl;
  if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
    apiUrl = `${window.API_CONFIG.BASE_URL}/submit-event-rsvp`;
  } else {
    // Fallback URL construction
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocalhost 
      ? 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging'
      : 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod';
    apiUrl = `${baseUrl}/submit-event-rsvp`;
  }

  const payload = {
    session_token: sessionToken,
    event_id: eventId,
    first_name: firstName,
    last_name: lastName,
    email: email
  };

  if (attendanceCap !== undefined) {
    payload.attendance_cap = attendanceCap;
  }

  console.log('Sending RSVP request to:', apiUrl);
  console.log('Payload:', payload);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to submit RSVP');
  }
  
  return data;
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
    // First, let's test if the API configuration is loaded
    console.log('Testing API configuration...');
    console.log('window.API_CONFIG:', window.API_CONFIG);
    
    if (!window.API_CONFIG || !window.API_CONFIG.EVENT_RSVP_CHECK) {
      throw new Error('API configuration not loaded or EVENT_RSVP_CHECK not defined');
    }
    
    const data = await checkEventRsvp(eventId);
    
    if (countElement) {
      countElement.textContent = data.rsvp_count || 0;
    }
    
    if (statusElement) {
      const rsvpCount = data.rsvp_count || 0;
      if (rsvpCount >= attendanceCap) {
        statusElement.textContent = 'This event is now full';
        statusElement.classList.add('text-red-500');
      } else {
        const spotsLeft = attendanceCap - rsvpCount;
        statusElement.textContent = `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`;
        statusElement.classList.remove('text-red-500');
      }
    }
  } catch (error) {
    console.error('Error updating RSVP count:', error);
    
    // Provide fallback behavior instead of showing error to users
    if (countElement) {
      countElement.textContent = '0';
    }
    
    if (statusElement) {
      // Special handling for CORS errors in development
      if (error.message === 'CORS_ERROR') {
        statusElement.textContent = `${attendanceCap} spots available (dev mode)`;
        statusElement.classList.remove('text-red-500');
        statusElement.classList.add('text-blue-500');
      } else {
        // Show available spots instead of error message for other errors
        statusElement.textContent = `${attendanceCap} spots available`;
        statusElement.classList.remove('text-red-500');
      }
    }
    
    // Log detailed debugging information for developers
    console.log('Debug info:');
    console.log('- Event ID:', eventId);
    console.log('- API_CONFIG exists:', !!window.API_CONFIG);
    console.log('- EVENT_RSVP_CHECK URL:', window.API_CONFIG?.EVENT_RSVP_CHECK);
    console.log('- Error details:', error);
    
    if (error.message === 'CORS_ERROR') {
      console.log('- CORS issue detected - this is expected in localhost development');
      console.log('- The staging endpoint exists but has CORS configuration issues');
      console.log('- This will work correctly when deployed to production');
    } else {
      console.log('- Falling back to default values (0 RSVPs, full capacity available)');
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
    const url = window.API_CONFIG.EVENT_RSVP_CHECK;
    
    // Debug logging
    console.log('API_CONFIG:', window.API_CONFIG);
    console.log('EVENT_RSVP_CHECK URL:', url);
    
    if (!url) {
      throw new Error('EVENT_RSVP_CHECK URL not configured');
    }
    
    const requestOptions = {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit',
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
    const url = window.API_CONFIG.EVENT_RSVP_SUBMIT;
    
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

/**
 * Check if the current authenticated user has already RSVP'd for this event
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {string} eventId - The event ID
 */
async function checkUserRsvpStatus(widget, eventId) {
  console.log('checkUserRsvpStatus called for event:', eventId);
  
  // Check if auth client is available and user is authenticated
  if (!window.authClient) {
    console.log('Auth client not available');
    return; // Auth client not loaded yet
  }
  
  if (!window.authClient.isAuthenticated()) {
    console.log('User not authenticated');
    return; // User not authenticated, show normal RSVP form
  }

  const userEmail = window.authClient.getUserEmail();
  if (!userEmail) {
    console.log('No user email available');
    return; // No user email available
  }

  console.log('Checking RSVP status for user:', userEmail);

  try {
    // Check if this user has already RSVP'd for this event
    const rsvpStatus = await checkEventRsvp(eventId, userEmail);
    console.log('RSVP status response:', rsvpStatus);
    
    if (rsvpStatus.user_registered) {
      console.log('User is already registered, updating UI');
      // User has already RSVP'd - update the UI with attendee list
      updateUIForExistingRsvp(widget, userEmail, rsvpStatus.user_rsvps || []);
    } else {
      console.log('User is not registered for this event');
    }
  } catch (error) {
    console.error('Error checking user RSVP status:', error);
    // Don't show error to user, just continue with normal flow
  }
}

/**
 * Update the UI when user has already RSVP'd
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {string} userEmail - The user's email address
 * @param {Array} rsvps - Array of RSVP records for this user
 */
function updateUIForExistingRsvp(widget, userEmail, rsvps = []) {
  const rsvpButton = widget.querySelector('.rsvp-toggle-button');
  const rsvpForm = widget.querySelector('.rsvp-form');
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');

  if (rsvpButton) {
    rsvpButton.textContent = 'Already Registered';
    rsvpButton.disabled = true;
    rsvpButton.classList.remove('bg-eden-green', 'hover:bg-green-700');
    rsvpButton.classList.add('bg-gray-400', 'cursor-not-allowed');
  }

  if (rsvpForm) {
    rsvpForm.classList.add('hidden');
  }

  if (rsvpSuccessMessage) {
    // Build attendees list HTML
    let attendeesHTML = '';
    if (rsvps.length > 0) {
      attendeesHTML = '<div class="mt-3 space-y-2">';
      attendeesHTML += '<div class="text-sm font-semibold text-gray-700">Registered attendees:</div>';
      
      rsvps.forEach(rsvp => {
        const isVolunteer = rsvp.attendee_type === 'volunteer';
        const icon = isVolunteer ? '👤' : '👶';
        const name = isVolunteer ? 'You' : `${rsvp.first_name} ${rsvp.last_name}`;
        const age = rsvp.age ? ` (${rsvp.age})` : '';
        
        attendeesHTML += `
          <div class="flex items-center justify-between bg-gray-50 p-2 rounded">
            <span class="text-sm">
              <span class="mr-1">${icon}</span>
              <span class="font-medium">${name}</span>${age}
            </span>
            <button 
              type="button" 
              class="text-xs text-red-600 hover:text-red-800 underline"
              onclick="cancelIndividualRsvp('${rsvp.attendee_id}', '${rsvp.attendee_type}', '${name}')"
            >
              Cancel
            </button>
          </div>
        `;
      });
      
      attendeesHTML += '</div>';
      
      // Add "Add More Attendees" button only if user has minors
      // Check sessionStorage for cached minors list
      const minorsCache = sessionStorage.getItem('auth_minors_list');
      let hasMinors = false;
      
      if (minorsCache) {
        try {
          const minorsData = JSON.parse(minorsCache);
          hasMinors = minorsData.minors && minorsData.minors.length > 0;
        } catch (e) {
          console.error('Error parsing minors cache:', e);
        }
      }
      
      if (hasMinors) {
        attendeesHTML += `
          <div class="mt-3">
            <button 
              type="button" 
              class="text-sm text-blue-600 hover:text-blue-800 underline font-medium"
              onclick="showAddMoreAttendeesUI(this)"
            >
              + Add More Attendees
            </button>
          </div>
        `;
      }
    }
    
    rsvpSuccessMessage.innerHTML = `
      <div class="text-green-700">
        <div class="font-semibold mb-2">✓ You're registered for this event</div>
        ${attendeesHTML}
      </div>
    `;
    rsvpSuccessMessage.classList.remove('hidden');
  }
}

/**
 * Show UI to add more attendees to an existing RSVP
 * @param {HTMLElement} button - The "Add More Attendees" button
 */
async function showAddMoreAttendeesUI(button) {
  const widget = button.closest('.event-rsvp-widget');
  if (!widget) {
    console.error('Could not find RSVP widget');
    return;
  }

  const eventId = widget.dataset.eventId;
  const attendanceCap = parseInt(widget.dataset.attendanceCap || '15', 10);

  // Hide the success message to show the selector
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  if (rsvpSuccessMessage) {
    rsvpSuccessMessage.classList.add('hidden');
  }

  // Get minors list
  let minorsList = [];
  try {
    const cachedMinors = sessionStorage.getItem('auth_minors_list');
    if (cachedMinors) {
      const cached = JSON.parse(cachedMinors);
      if (cached.timestamp && (Date.now() - cached.timestamp) < 5 * 60 * 1000) {
        minorsList = cached.minors;
      }
    }
    
    if (minorsList.length === 0) {
      const minorsResponse = await window.authClient.getMinorsList();
      if (minorsResponse.success && minorsResponse.minors) {
        minorsList = minorsResponse.minors;
        sessionStorage.setItem('auth_minors_list', JSON.stringify({
          minors: minorsList,
          timestamp: Date.now()
        }));
      }
    }
  } catch (error) {
    console.error('Error fetching minors list:', error);
  }

  if (minorsList.length === 0) {
    alert('You need to add minors to your profile first. Visit your volunteer dashboard to add minors.');
    // Show the success message again
    if (rsvpSuccessMessage) {
      rsvpSuccessMessage.classList.remove('hidden');
    }
    return;
  }

  // Render the multi-person selector (it will automatically disable already-registered attendees)
  await renderMultiPersonSelector(widget, eventId, minorsList, attendanceCap);
}

/**
 * Cancel an individual RSVP (for multi-person registrations)
 * @param {string} attendeeId - The attendee ID to cancel
 * @param {string} attendeeType - The attendee type (volunteer or minor)
 * @param {string} attendeeName - The attendee name for confirmation
 */
async function cancelIndividualRsvp(attendeeId, attendeeType, attendeeName) {
  // Find the widget
  const widget = document.querySelector('.event-rsvp-widget');
  if (!widget) {
    console.error('Could not find RSVP widget');
    return;
  }

  const eventId = widget.dataset.eventId;
  
  // If cancelling volunteer, check if there are minors and warn
  let confirmMessage = `Are you sure you want to cancel the registration for ${attendeeName}?\n\n`;
  
  if (attendeeType === 'volunteer') {
    // Check current RSVP status to see if there are minors
    try {
      const userEmail = window.authClient.getUserEmail();
      const rsvpStatus = await checkEventRsvp(eventId, userEmail);
      if (rsvpStatus.user_registered && rsvpStatus.user_rsvps) {
        const minorRsvps = rsvpStatus.user_rsvps.filter(r => r.attendee_type === 'minor');
        if (minorRsvps.length > 0) {
          confirmMessage += `This will also cancel ${minorRsvps.length} minor registration(s) since minors cannot attend without an adult.\n\n`;
        }
      }
    } catch (error) {
      console.error('Error checking RSVP status:', error);
    }
  }
  
  confirmMessage += 'This action cannot be undone.';
  
  // Show confirmation dialog
  const confirmed = confirm(confirmMessage);
  
  if (!confirmed) {
    return;
  }

  try {
    // Check if auth client is available
    if (!window.authClient) {
      throw new Error('Authentication system not available. Please refresh the page and try again.');
    }

    // Check if user is authenticated
    if (!window.authClient.isAuthenticated()) {
      throw new Error('You are not logged in. Please log in and try again.');
    }

    const sessionToken = window.authClient.getSessionToken();
    const apiBase = window.authClient.getBaseApiUrl();
    
    // If cancelling volunteer, get all RSVPs and cancel them all
    if (attendeeType === 'volunteer') {
      const userEmail = window.authClient.getUserEmail();
      console.log('Cancelling all RSVPs for volunteer:', userEmail);
      const rsvpStatus = await checkEventRsvp(eventId, userEmail);
      console.log('Current RSVP status:', rsvpStatus);
      
      if (rsvpStatus.user_registered && rsvpStatus.user_rsvps) {
        console.log(`Found ${rsvpStatus.user_rsvps.length} RSVPs to cancel`);
        // Cancel all RSVPs
        for (const rsvp of rsvpStatus.user_rsvps) {
          console.log(`Cancelling RSVP for ${rsvp.attendee_type} ${rsvp.attendee_id}`);
          try {
            const response = await fetch(`${apiBase}/cancel-event-rsvp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                session_token: sessionToken,
                event_id: eventId,
                attendee_id: rsvp.attendee_id,
                attendee_type: rsvp.attendee_type
              }),
            });

            const result = await response.json();
            console.log(`Cancel result for ${rsvp.attendee_id}:`, result);
            
            if (!response.ok) {
              console.error(`Failed to cancel RSVP for ${rsvp.attendee_id}:`, result.error);
            }
          } catch (error) {
            console.error(`Error cancelling RSVP for ${rsvp.attendee_id}:`, error);
          }
        }
      } else {
        console.log('No RSVPs found to cancel');
      }
    } else {
      // Just cancel the individual minor
      const response = await fetch(`${apiBase}/cancel-event-rsvp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_token: sessionToken,
          event_id: eventId,
          attendee_id: attendeeId,
          attendee_type: attendeeType
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel RSVP');
      }
    }
    
    // Refresh the RSVP status to update the UI
    await checkUserRsvpStatus(widget, eventId);
    
    // If all RSVPs were cancelled (volunteer case), reset the UI to show RSVP form
    if (attendeeType === 'volunteer') {
      const rsvpButton = widget.querySelector('.rsvp-toggle-button');
      const rsvpForm = widget.querySelector('.rsvp-form');
      const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
      
      if (rsvpButton) {
        rsvpButton.textContent = 'RSVP for this Event';
        rsvpButton.disabled = false;
        rsvpButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        rsvpButton.classList.add('bg-eden-green', 'hover:bg-green-700');
      }
      
      if (rsvpSuccessMessage) {
        rsvpSuccessMessage.classList.add('hidden');
        rsvpSuccessMessage.innerHTML = '';
      }
      
      if (rsvpForm) {
        rsvpForm.classList.remove('hidden');
      }
    }
    
    // Update RSVP count
    const rsvpCount = widget.querySelector('.rsvp-count');
    const rsvpStatus = widget.querySelector('.rsvp-status');
    const attendanceCap = parseInt(widget.dataset.attendanceCap || '15', 10);
    updateRsvpCount(eventId, rsvpCount, rsvpStatus, attendanceCap);
    
    // Show success message
    const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
    if (rsvpSuccessMessage) {
      const tempMessage = document.createElement('div');
      tempMessage.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-3';
      tempMessage.textContent = attendeeType === 'volunteer' 
        ? '✓ Successfully cancelled all registrations'
        : `✓ Successfully cancelled registration for ${attendeeName}`;
      rsvpSuccessMessage.parentNode.insertBefore(tempMessage, rsvpSuccessMessage);
      
      setTimeout(() => {
        tempMessage.remove();
      }, 3000);
    }
  } catch (error) {
    console.error('Error cancelling RSVP:', error);
    alert(`Failed to cancel registration: ${error.message}`);
  }
}

/**
 * Show cancel RSVP confirmation and handle cancellation
 * @param {HTMLElement} button - The cancel button that was clicked
 */
async function showCancelRsvpOption(button) {
  // Find the widget and get event information
  const widget = button.closest('.event-rsvp-widget');
  if (!widget) {
    console.error('Could not find RSVP widget');
    return;
  }

  const eventId = widget.dataset.eventId;
  
  // Show confirmation dialog
  const confirmed = confirm(
    'Are you sure you want to cancel your registration for this event?\n\n' +
    'This action cannot be undone.'
  );
  
  if (!confirmed) {
    return;
  }

  // Disable the cancel button during processing
  button.disabled = true;
  button.textContent = 'Cancelling...';

  try {
    // Check if auth client is available
    if (!window.authClient) {
      throw new Error('Authentication system not available. Please refresh the page and try again.');
    }

    // Check if user is authenticated
    if (!window.authClient.isAuthenticated()) {
      throw new Error('You are not logged in. Please log in and try again.');
    }

    // Get event start time from the page if available
    const eventStartTime = getEventStartTime();
    
    // Try to cancel the RSVP using auth client if available
    let result;
    if (typeof window.authClient.cancelEventRsvp === 'function') {
      result = await window.authClient.cancelEventRsvp(eventId, eventStartTime);
    } else {
      // Fallback: direct API call
      result = await cancelRsvpDirectly(eventId, eventStartTime);
    }
    
    if (result.success) {
      // Show success message and update UI
      showCancellationSuccess(widget, result);
      
      // Update RSVP count
      const rsvpCount = widget.querySelector('.rsvp-count');
      const rsvpStatus = widget.querySelector('.rsvp-status');
      const attendanceCap = parseInt(widget.dataset.attendanceCap || '15', 10);
      updateRsvpCount(eventId, rsvpCount, rsvpStatus, attendanceCap);
    }
  } catch (error) {
    // Show error message
    const rsvpErrorMessage = widget.querySelector('.rsvp-error');
    if (rsvpErrorMessage) {
      rsvpErrorMessage.textContent = error.message || 'Failed to cancel RSVP. Please try again.';
      rsvpErrorMessage.classList.remove('hidden');
    }
    console.error('RSVP cancellation error:', error);
    
    // Re-enable the cancel button
    button.disabled = false;
    button.textContent = 'Cancel Registration';
  }
}

/**
 * Direct API call to cancel RSVP (fallback when auth client isn't working)
 * @param {string} eventId - Event identifier
 * @param {string} eventStartTime - Event start time
 * @returns {Promise<Object>} Cancellation result
 */
async function cancelRsvpDirectly(eventId, eventStartTime) {
  // Get session token from localStorage
  const sessionToken = localStorage.getItem('auth_session_token');
  const userEmail = localStorage.getItem('auth_user_email');
  
  if (!sessionToken || !userEmail) {
    throw new Error('Not authenticated. Please log in and try again.');
  }

  // Determine API URL
  let apiUrl;
  if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
    apiUrl = `${window.API_CONFIG.BASE_URL}/cancel-event-rsvp`;
  } else {
    // Fallback URL construction
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocalhost 
      ? 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging'
      : 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod';
    apiUrl = `${baseUrl}/cancel-event-rsvp`;
  }

  const payload = {
    session_token: sessionToken,
    event_id: eventId,
    email: userEmail
  };

  // Temporarily skip event_start_time to avoid Decimal conversion issues
  // This will be re-enabled once the Lambda function is deployed with the fix
  // if (eventStartTime) {
  //   payload.event_start_time = eventStartTime;
  // }

  console.log('Sending cancellation request to:', apiUrl);
  console.log('Payload:', payload);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to cancel RSVP');
  }
  
  return data;
}

/**
 * Get event start time from the page metadata
 * @returns {string|null} Event start time in ISO format
 */
function getEventStartTime() {
  // Try to get from page metadata or frontmatter
  // This could be injected by Hugo or extracted from the page
  const metaStartTime = document.querySelector('meta[name="event-start-time"]');
  if (metaStartTime) {
    return metaStartTime.getAttribute('content');
  }
  
  // Could also try to parse from visible date elements
  // For now, return null - the backend will handle this gracefully
  return null;
}

/**
 * Show cancellation success message and update UI
 * @param {HTMLElement} widget - The RSVP widget element
 * @param {Object} result - Cancellation result from API
 */
function showCancellationSuccess(widget, result) {
  const rsvpButton = widget.querySelector('.rsvp-toggle-button');
  const rsvpForm = widget.querySelector('.rsvp-form');
  const rsvpSuccessMessage = widget.querySelector('.rsvp-success');
  const rsvpErrorMessage = widget.querySelector('.rsvp-error');

  // Hide any error messages
  if (rsvpErrorMessage) {
    rsvpErrorMessage.classList.add('hidden');
  }

  // Reset button to allow re-registration
  if (rsvpButton) {
    rsvpButton.textContent = 'Sign Up';
    rsvpButton.disabled = false;
    rsvpButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
    rsvpButton.classList.add('bg-eden-green', 'hover:bg-green-700');
  }

  // Hide form
  if (rsvpForm) {
    rsvpForm.classList.add('hidden');
  }

  // Show cancellation success message
  if (rsvpSuccessMessage) {
    let message = 'Your registration has been cancelled successfully.';
    
    if (result.hours_before_event !== undefined) {
      const hours = Math.round(result.hours_before_event * 10) / 10; // Round to 1 decimal
      message += ` You cancelled ${hours} hours before the event.`;
    }
    
    rsvpSuccessMessage.innerHTML = `
      <div class="text-center">
        <span>${message}</span>
      </div>
    `;
    rsvpSuccessMessage.classList.remove('hidden');
    
    // Hide the success message after 5 seconds
    setTimeout(() => {
      if (rsvpSuccessMessage) {
        rsvpSuccessMessage.classList.add('hidden');
      }
    }, 5000);
  }
}

// Global function for testing RSVP status check
window.testRsvpStatusCheck = function() {
  const widget = document.querySelector('.event-rsvp-widget');
  if (widget) {
    const eventId = widget.dataset.eventId;
    console.log('Testing RSVP status check for event:', eventId);
    checkUserRsvpStatus(widget, eventId);
  } else {
    console.log('No RSVP widget found on this page');
  }
};

// Global function for testing authentication status
window.testAuthStatus = function() {
  console.log('Auth client available:', !!window.authClient);
  if (window.authClient) {
    console.log('Is authenticated:', window.authClient.isAuthenticated());
    console.log('User email:', window.authClient.getUserEmail());
    console.log('Session expiry:', window.authClient.getSessionExpiry());
  }
};

// Global function for testing RSVP cancellation
window.testCancelRsvp = function() {
  console.log('=== Testing RSVP Cancellation ===');
  
  const widget = document.querySelector('.event-rsvp-widget');
  if (!widget) {
    console.log('No RSVP widget found on this page');
    return;
  }

  const eventId = widget.dataset.eventId;
  console.log('Testing RSVP cancellation for event:', eventId);
  
  // Check authentication
  const sessionToken = localStorage.getItem('auth_session_token');
  const userEmail = localStorage.getItem('auth_user_email');
  
  if (!sessionToken || !userEmail) {
    console.log('❌ Not authenticated. Please log in first.');
    return;
  }
  
  console.log('✅ User is authenticated:', userEmail);
  
  const eventStartTime = getEventStartTime();
  console.log('Event start time:', eventStartTime);
  
  // Try cancellation
  cancelRsvpDirectly(eventId, eventStartTime)
    .then(result => {
      console.log('✅ Cancellation successful:', result);
    })
    .catch(error => {
      console.error('❌ Cancellation failed:', error);
    });
};

// Global function to reinitialize auth client (for debugging)
window.reinitAuthClient = function() {
  console.log('Reinitializing auth client...');
  try {
    window.authClient = new AuthClient();
    console.log('✅ Auth client reinitialized:', window.authClient);
    console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.authClient)));
  } catch (error) {
    console.error('❌ Failed to reinitialize auth client:', error);
  }
};
// Global function for testing direct API cancellation
window.testDirectCancel = function() {
  console.log('=== Testing Direct API Cancellation ===');
  
  const widget = document.querySelector('.event-rsvp-widget');
  if (!widget) {
    console.log('No RSVP widget found on this page');
    return;
  }

  const eventId = widget.dataset.eventId;
  const eventStartTime = getEventStartTime();
  
  console.log('Event ID:', eventId);
  console.log('Event start time:', eventStartTime);
  
  // Check authentication
  const sessionToken = localStorage.getItem('auth_session_token');
  const userEmail = localStorage.getItem('auth_user_email');
  
  console.log('Session token exists:', !!sessionToken);
  console.log('User email:', userEmail);
  
  if (!sessionToken || !userEmail) {
    console.log('❌ Not authenticated. Please log in first.');
    return;
  }
  
  console.log('✅ Calling cancelRsvpDirectly...');
  cancelRsvpDirectly(eventId, eventStartTime)
    .then(result => {
      console.log('✅ Direct cancellation successful:', result);
    })
    .catch(error => {
      console.error('❌ Direct cancellation failed:', error);
    });
};
// Global function for testing the streamlined RSVP flow
window.testStreamlinedRsvp = function() {
  console.log('=== Testing Streamlined RSVP Flow ===');
  
  const widget = document.querySelector('.event-rsvp-widget');
  if (!widget) {
    console.log('No RSVP widget found on this page');
    return;
  }

  const eventId = widget.dataset.eventId;
  const attendanceCap = parseInt(widget.dataset.attendanceCap || '15', 10);
  
  console.log('Event ID:', eventId);
  console.log('Attendance cap:', attendanceCap);
  
  // Check authentication
  const isAuthenticated = window.authClient && window.authClient.isAuthenticated();
  console.log('Is authenticated:', isAuthenticated);
  
  if (isAuthenticated) {
    console.log('User email:', window.authClient.getUserEmail());
    console.log('✅ Testing direct RSVP...');
    handleDirectRsvp(widget, eventId, attendanceCap);
  } else {
    console.log('❌ Not authenticated - would redirect to /volunteer/ with return URL');
    const currentUrl = window.location.href;
    const returnUrl = encodeURIComponent(currentUrl);
    const rsvpAction = encodeURIComponent(`rsvp:${eventId}`);
    const redirectUrl = `/volunteer/?return=${returnUrl}&action=${rsvpAction}`;
    console.log('Redirect URL would be:', redirectUrl);
  }
};
// Global function for testing dashboard data
window.testDashboardData = async function() {
  console.log('=== Testing Dashboard Data ===');
  
  if (!window.authClient || !window.authClient.isAuthenticated()) {
    console.log('❌ Not authenticated. Please log in first.');
    return;
  }

  try {
    const dashboardData = await window.authClient.getDashboard();
    console.log('✅ Dashboard data:', dashboardData);
    
    if (dashboardData.rsvps && dashboardData.rsvps.length > 0) {
      console.log('📋 RSVPs found:');
      dashboardData.rsvps.forEach((rsvp, index) => {
        console.log(`  ${index + 1}. Event: ${rsvp.event_id}`);
        console.log(`     Status: ${rsvp.status || rsvp.rsvp_status || 'unknown'}`);
        console.log(`     Created: ${rsvp.created_at}`);
        console.log(`     Updated: ${rsvp.updated_at || 'N/A'}`);
      });
    } else {
      console.log('📋 No RSVPs found');
    }
  } catch (error) {
    console.error('❌ Error loading dashboard:', error);
  }
};
// Global function to check current session and test dashboard API directly
window.debugDashboard = async function() {
  console.log('=== Dashboard Debug ===');
  
  // Check localStorage
  const sessionToken = localStorage.getItem('auth_session_token');
  const userEmail = localStorage.getItem('auth_user_email');
  const sessionExpiry = localStorage.getItem('auth_session_expiry');
  
  console.log('Session token exists:', !!sessionToken);
  console.log('User email:', userEmail);
  console.log('Session expiry:', sessionExpiry);
  
  if (!sessionToken) {
    console.log('❌ No session token found. Please log in first.');
    return;
  }
  
  // Check if session is expired
  if (sessionExpiry) {
    const expiryDate = new Date(sessionExpiry);
    const now = new Date();
    console.log('Session expires at:', expiryDate);
    console.log('Current time:', now);
    console.log('Session expired:', expiryDate <= now);
    
    if (expiryDate <= now) {
      console.log('❌ Session has expired. Please log in again.');
      return;
    }
  }
  
  // Test the dashboard API directly
  try {
    const apiUrl = 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging/user-dashboard';
    console.log('Testing dashboard API:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_token: sessionToken
      }),
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.text();
    console.log('Raw response:', data);
    
    try {
      const jsonData = JSON.parse(data);
      console.log('Parsed response:', jsonData);
      
      if (jsonData.success) {
        console.log('✅ Dashboard API working correctly');
        console.log('User email:', jsonData.email);
        console.log('Has waiver:', jsonData.waiver?.hasWaiver);
        console.log('RSVPs count:', jsonData.rsvps?.length || 0);
        
        if (jsonData.rsvps && jsonData.rsvps.length > 0) {
          console.log('RSVPs:');
          jsonData.rsvps.forEach((rsvp, index) => {
            console.log(`  ${index + 1}. Event: ${rsvp.event_id}, Status: ${rsvp.status || 'active'}`);
          });
        }
      } else {
        console.log('❌ Dashboard API returned error:', jsonData.error);
      }
    } catch (e) {
      console.log('❌ Response is not valid JSON:', e.message);
    }
    
  } catch (error) {
    console.error('❌ API call failed:', error);
  }
};