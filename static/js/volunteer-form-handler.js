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
      
      // Submit to REST API
      fetch('/api/submit-volunteer', {
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
        // Show success message
        const formContainer = volunteerForm.parentElement;
        formContainer.innerHTML = '<div class="success-message"><h3>Thank you for your interest!</h3><p>We\'ve received your volunteer submission and will be in touch soon.</p></div>';
      })
      .catch(error => {
        console.error('Error submitting form:', error);
        alert('Sorry, there was a problem submitting your form. Please try again later.');
      });
    });
  }
});
