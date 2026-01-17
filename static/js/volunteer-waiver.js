document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('volunteerwaiver');
  const emailField = document.getElementById('email');
  const checkEmailBtn = document.getElementById('check_email');
  const waiverFormFields = document.getElementById('waiver-form-fields');
  const dobField = document.getElementById('date_of_birth');
  const adultFields = document.getElementById('adult-fields');
  const minorFields = document.getElementById('minor-fields');
  const submitButton = form.querySelector('input[value="Submit Waiver"]');

  // Hide the main submit button initially
  if (submitButton) {
    submitButton.parentElement.parentElement.style.display = 'none';
  }
  
  // Disable required attribute on hidden form fields initially
  disableHiddenFieldsValidation(waiverFormFields);

  // Make sure the checkbox containers behave properly
  initializeCheckboxBehavior();

  // Check if user is already authenticated
  if (window.authClient && window.authClient.isAuthenticated()) {
    const userEmail = window.authClient.getUserEmail();
    console.log('User is authenticated:', userEmail);
    
    // Pre-fill the email field
    if (emailField) {
      emailField.value = userEmail;
    }
    
    // Check their waiver status automatically
    checkExistingWaiver(userEmail)
      .then(response => {
        if (response.hasWaiver) {
          // User has a valid waiver
          showMessage(`You have already completed a waiver. It is valid until ${response.expirationDate}.`, 'success');
        } else {
          // User needs to complete a new waiver - show the form directly
          showWaiverForm();
        }
      })
      .catch(error => {
        console.error('Error checking waiver status:', error);
        // If there's an error, just show the form
        showWaiverForm();
      });
  }

  // Email Check Functionality
  if (form) {
    // Handle the form submission for email checking
    form.addEventListener('submit', function(e) {
      // Check if this is the email check submission
      if (e.submitter && e.submitter.value === 'Check Email') {
        e.preventDefault(); // Prevent default form submission
        
        const email = emailField.value;
        
        // Validate email
        if (!email || !isValidEmail(email)) {
          showMessage('Please enter a valid email address.', 'error');
          return;
        }
        
        // Show loading message
        showMessage('Checking waiver status...', 'info');
        
        // Check if the user has already completed a waiver
        checkExistingWaiver(email)
          .then(response => {
            if (response.hasWaiver) {
              // User has a valid waiver
              showMessage(`You have already completed a waiver. It is valid until ${response.expirationDate}.`, 'success');
            } else {
              // User needs to complete a new waiver
              showWaiverForm();
            }
          })
          .catch(error => {
            console.error('Error checking waiver status:', error);
            showMessage('There was an error checking your waiver status. Please try again.', 'error');
          });
      }
    });
  }

  // Date of Birth Change - Show appropriate fields based on age
  if (dobField) {
    dobField.addEventListener('change', function() {
      const birthDate = new Date(this.value);
      const today = new Date();
      const age = calculateAge(birthDate, today);
      
      // Get today's date in YYYY-MM-DD format
      const todayFormatted = today.toISOString().split('T')[0];
      
      // Only allow adults (18+) to file their own waiver
      if (age >= 18) {
        adultFields.style.display = 'block';
        minorFields.style.display = 'none';
        
        // Auto-populate today's date for adults
        const adultDateField = document.getElementById('adult_todays_date');
        if (adultDateField) {
          adultDateField.value = todayFormatted;
          adultDateField.readOnly = true;
          adultDateField.style.backgroundColor = '#f3f4f6';
        }
        
        // Set minor fields as not required
        setFormFieldsRequired(minorFields, false);
        // Set adult fields as required
        setFormFieldsRequired(adultFields, true);
        
        // Show the submit button
        if (submitButton) {
          submitButton.parentElement.parentElement.style.display = 'block';
        }
        
        // Hide warning box if it exists
        const warningBox = document.getElementById('minor-warning-box');
        if (warningBox) {
          warningBox.style.display = 'none';
        }
      } else {
        // Minors cannot file their own waiver
        minorFields.style.display = 'none';
        adultFields.style.display = 'none';
        
        // Hide submit button
        if (submitButton) {
          submitButton.parentElement.parentElement.style.display = 'none';
        }
        
        // Show prominent warning message
        showMessage('Minors under 18 cannot file their own waiver. Please have your parent or guardian create an account and add you as a minor on their volunteer dashboard.', 'error');
        
        // Also add a visible warning box in the form
        let warningBox = document.getElementById('minor-warning-box');
        if (!warningBox) {
          warningBox = document.createElement('div');
          warningBox.id = 'minor-warning-box';
          warningBox.className = 'minor-warning-box';
          warningBox.innerHTML = `
            <div style="background-color: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #991b1b; margin-top: 0; font-size: 18px; font-weight: bold;">⚠️ Age Restriction</h3>
              <p style="color: #7f1d1d; margin-bottom: 10px;">You must be 18 years or older to file your own volunteer waiver.</p>
              <p style="color: #7f1d1d; margin-bottom: 0;"><strong>What to do:</strong> Ask your parent or guardian to:</p>
              <ol style="color: #7f1d1d; margin-top: 5px;">
                <li>Create an account at <a href="/volunteer" style="color: #991b1b; text-decoration: underline;">/volunteer</a></li>
                <li>Complete their own waiver</li>
                <li>Add you as a minor on their volunteer dashboard</li>
              </ol>
            </div>
          `;
          dobField.parentElement.parentElement.insertBefore(warningBox, dobField.parentElement.nextSibling);
        }
        warningBox.style.display = 'block';
      }
    });
  }

  // Full Form Submission
  if (form) {
    // Add another listener for the full form submission
    form.addEventListener('submit', function(e) {
      // Only handle the full form submission, not the email check
      if (e.submitter && e.submitter.value === 'Check Email') {
        return; // Let the email check handler deal with this
      }
      
      e.preventDefault();
      console.log('Processing full form submission');
      
      // Get form data
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      
      // Add submission date
      data.submission_date = new Date().toISOString();
      
      // Determine if adult or minor based on DOB
      const birthDate = new Date(data.date_of_birth);
      const age = calculateAge(birthDate, new Date());
      data.is_adult = age >= 18;
      
      // Submit the form data
      submitWaiverData(data)
        .then(response => {
          if (response.success) {
            // Redirect to volunteer dashboard after successful submission
            window.location.href = '/volunteer';
          } else {
            showMessage('There was an error submitting your waiver. Please try again.', 'error');
          }
        })
        .catch(error => {
          console.error('Error submitting waiver:', error);
          showMessage('There was an error submitting your waiver. Please try again.', 'error');
        });
    });
  }

  // Helper Functions
  function showWaiverForm() {
    if (waiverFormFields) {
      // Get the email address the user entered
      const userEmail = emailField.value;
      
      // Show waiver form fields
      waiverFormFields.style.display = 'block';
      
      // Hide the entire email section
      const emailSection = document.querySelector('.email-section');
      if (emailSection) {
        emailSection.style.display = 'none';
      }
      
      // Display the email address and instructions at the top of the form
      const emailDisplay = document.createElement('div');
      emailDisplay.className = 'email-display';
      emailDisplay.innerHTML = `
        <div class="email-badge">
          <strong>Email:</strong> ${userEmail}
        </div>
        <div class="waiver-instructions">
          <h4>Please complete the waiver form below</h4>
          <p>All fields marked with * are required</p>
        </div>
      `;
      
      // Insert the email display before the form fields
      waiverFormFields.parentNode.insertBefore(emailDisplay, waiverFormFields);
      
      // Enable required validation on visible fields but be careful with checkboxes
      const formFields = waiverFormFields.querySelectorAll('input:not([type="checkbox"]), select, textarea');
      formFields.forEach(field => {
        if (!field.name.includes('adult_') && !field.name.includes('guardian_') && 
            !field.name.includes('minor_') && !field.name.includes('relationship_')) {
          field.required = true;
        }
      });
    }
  }

  function calculateAge(birthDate, currentDate) {
    let age = currentDate.getFullYear() - birthDate.getFullYear();
    const monthDifference = currentDate.getMonth() - birthDate.getMonth();
    
    if (monthDifference < 0 || (monthDifference === 0 && currentDate.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function setFormFieldsRequired(container, required) {
    const inputs = container.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.required = required;
    });
  }
  
  function disableHiddenFieldsValidation(container) {
    if (!container) return;
    
    // Find all inputs in the hidden container and disable required attribute
    const allHiddenFields = document.querySelectorAll('#waiver-form-fields input, #waiver-form-fields select');
    allHiddenFields.forEach(field => {
      // Disable all required attributes initially
      field.required = false;
    });
    
    // Also specifically handle adult and minor fields that start hidden
    const adultHiddenFields = document.querySelectorAll('#adult-fields input, #adult-fields select');
    adultHiddenFields.forEach(field => {
      field.required = false;
    });
    
    const minorHiddenFields = document.querySelectorAll('#minor-fields input, #minor-fields select');
    minorHiddenFields.forEach(field => {
      field.required = false;
    });
  }

  function initializeCheckboxBehavior() {
    // Ensure checkboxes work properly with labels
    const checkboxContainers = document.querySelectorAll('.checkbox-container');
    checkboxContainers.forEach(container => {
      const label = container.querySelector('label');
      const checkbox = container.querySelector('input[type="checkbox"]');
      
      if (label && checkbox) {
        // Make the entire label clickable to toggle checkbox
        label.addEventListener('click', function(e) {
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            e.preventDefault(); // Prevent default label behavior
          }
        });
      }
    });
  }

  function showMessage(message, type) {
    // Check if message container exists, if not create it
    let messageContainer = document.getElementById('waiver-form-message');
    if (!messageContainer) {
      messageContainer = document.createElement('div');
      messageContainer.id = 'waiver-form-message';
      form.parentNode.insertBefore(messageContainer, form);
    }
    
    // Set message and styling
    messageContainer.textContent = message;
    messageContainer.className = `message ${type}`;
    
    // Automatically clear message after 5 seconds
    setTimeout(() => {
      messageContainer.textContent = '';
      messageContainer.className = 'message';
    }, 5000);
  }

  // API Calls
  async function checkExistingWaiver(email) {
    console.log('Checking waiver for email:', email);
    try {
      const apiUrl = window.API_CONFIG.VOLUNTEER_WAIVER_CHECK;
      console.log(`Sending request to: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });
      
      console.log('API response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error checking waiver:', error);
      throw error;
    }
  }

  async function submitWaiverData(data) {
    console.log('Submitting waiver data:', data);
    try {
      const apiUrl = window.API_CONFIG.VOLUNTEER_WAIVER_SUBMIT;
      console.log(`Sending request to: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      console.log('API response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error submitting waiver:', error);
      throw error;
    }
  }
});
