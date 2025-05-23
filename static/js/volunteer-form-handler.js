document.addEventListener('DOMContentLoaded', function() {
  const volunteerForm = document.querySelector('form#volunteerform');
  
  if (volunteerForm) {
    volunteerForm.addEventListener('submit', function(event) {
      event.preventDefault();
      
      // Get form values
      const firstName = document.getElementById('first_name').value.trim();
      const lastName = document.getElementById('last_name').value.trim();
      const email = document.getElementById('email').value.trim();
      
      // Validate form
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      let isValid = true;
      let errorMessage = '';
      
      if (!firstName) {
        isValid = false;
        errorMessage = 'First name is required.';
        document.getElementById('first_name').focus();
      } else if (!lastName) {
        isValid = false;
        errorMessage = 'Last name is required.';
        document.getElementById('last_name').focus();
      } else if (!email) {
        isValid = false;
        errorMessage = 'Email is required.';
        document.getElementById('email').focus();
      } else if (!emailRegex.test(email)) {
        isValid = false;
        errorMessage = 'Please enter a valid email address.';
        document.getElementById('email').focus();
      }
      
      if (!isValid) {
        alert(errorMessage);
        return;
      }
      
      // Prepare data for submission
      const formData = {
        first_name: firstName,
        last_name: lastName,
        email: email
      };
      
      // Show loading state
      const formElement = volunteerForm;
      formElement.classList.add('form-loading');
      
      // Submit to REST API
      fetch("https://882dzmsoy5.execute-api.us-east-1.amazonaws.com/prod/submit-volunteer", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        // Show success message from the API response
        const formContainer = volunteerForm.parentElement;
        const message = data.message;
        
        formContainer.innerHTML = `
          <div class="success-message">
            <h3>Success!</h3>
            <p>${message}</p>
          </div>
        `;
      })
      .catch(error => {
        console.error('Error submitting form:', error);
        alert('Sorry, there was a problem submitting your form. Please try again later.');
      });
    });
  }
});
