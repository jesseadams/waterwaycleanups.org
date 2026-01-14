/**
 * Authentication Client Library
 * Handles email-based authentication with validation codes
 */

class AuthClient {
  constructor() {
    this.sessionToken = localStorage.getItem('auth_session_token');
    this.userEmail = localStorage.getItem('auth_user_email');
    this.sessionExpiry = localStorage.getItem('auth_session_expiry');
    
    // API endpoints - use Hugo-injected config when available, fallback to environment detection
    this.apiEndpoints = {
      sendCode: this.getApiUrl('auth-send-code'),
      verifyCode: this.getApiUrl('auth-verify-code'),
      validateSession: this.getApiUrl('auth-validate-session'),
      dashboard: this.getApiUrl('user-dashboard'),
      submitRsvp: this.getApiUrl('submit-event-rsvp'),
      submitWaiver: this.getApiUrl('submit-volunteer-waiver'),
      minorsAdd: this.getApiUrl('minors-add'),
      minorsList: this.getApiUrl('minors-list'),
      minorsUpdate: this.getApiUrl('minors-update'),
      minorsDelete: this.getApiUrl('minors-delete')
    };
  }

  /**
   * Get the base API URL for use by other components
   * @returns {string} Base API URL
   */
  getBaseApiUrl() {
    if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
      return window.API_CONFIG.BASE_URL;
    }
    
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
      return 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging';
    } else {
      return 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod';
    }
  }

  /**
   * Get API URL based on environment
   * @param {string} endpoint - The endpoint name
   * @returns {string} Full API URL
   */
  getApiUrl(endpoint) {
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

  /**
   * Send validation code to email
   * @param {string} email - User's email address
   * @returns {Promise<Object>} Response from server
   */
  async sendValidationCode(email) {
    try {
      const response = await fetch(this.apiEndpoints.sendCode, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.toLowerCase() }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send validation code');
      }
      
      return data;
    } catch (error) {
      console.error('Error sending validation code:', error);
      throw error;
    }
  }

  /**
   * Verify validation code and create session
   * @param {string} email - User's email address
   * @param {string} validationCode - 6-digit validation code
   * @returns {Promise<Object>} Response from server
   */
  async verifyCode(email, validationCode) {
    try {
      const response = await fetch(this.apiEndpoints.verifyCode, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: email.toLowerCase(), 
          validation_code: validationCode 
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to verify code');
      }

      // Store session information
      this.sessionToken = data.session_token;
      this.userEmail = data.email;
      this.sessionExpiry = data.expires_at;

      localStorage.setItem('auth_session_token', this.sessionToken);
      localStorage.setItem('auth_user_email', this.userEmail);
      localStorage.setItem('auth_session_expiry', this.sessionExpiry);
      
      return data;
    } catch (error) {
      console.error('Error verifying code:', error);
      throw error;
    }
  }

  /**
   * Validate current session
   * @returns {Promise<Object>} Session validation response
   */
  async validateSession() {
    if (!this.sessionToken) {
      throw new Error('No session token found');
    }

    // Check if session has expired locally
    if (this.sessionExpiry && new Date(this.sessionExpiry) <= new Date()) {
      this.logout();
      throw new Error('Session has expired');
    }

    try {
      const response = await fetch(this.apiEndpoints.validateSession, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_token: this.sessionToken }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }
        throw new Error(data.message || 'Session validation failed');
      }
      
      return data;
    } catch (error) {
      console.error('Error validating session:', error);
      throw error;
    }
  }

  /**
   * Get user dashboard data (waivers and RSVPs)
   * @returns {Promise<Object>} Dashboard data
   */
  async getDashboard() {
    if (!this.sessionToken) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch(this.apiEndpoints.dashboard, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_token: this.sessionToken }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }
        throw new Error(data.message || 'Failed to load dashboard');
      }
      
      return data;
    } catch (error) {
      console.error('Error loading dashboard:', error);
      throw error;
    }
  }

  /**
   * Submit event RSVP
   * @param {string} eventId - Event identifier
   * @param {string} firstName - User's first name
   * @param {string} lastName - User's last name
   * @param {number} attendanceCap - Optional attendance cap override
   * @returns {Promise<Object>} RSVP submission response
   */
  async submitEventRsvp(eventId, firstName, lastName, attendanceCap) {
    if (!this.sessionToken) {
      throw new Error('Not authenticated');
    }

    try {
      const payload = {
        session_token: this.sessionToken,
        event_id: eventId,
        first_name: firstName,
        last_name: lastName
      };

      if (attendanceCap !== undefined) {
        payload.attendance_cap = attendanceCap;
      }

      const response = await fetch(this.apiEndpoints.submitRsvp, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }
        throw new Error(data.message || 'Failed to submit RSVP');
      }
      
      return data;
    } catch (error) {
      console.error('Error submitting RSVP:', error);
      throw error;
    }
  }

  /**
   * Cancel event RSVP
   * @param {string} eventId - Event identifier
   * @param {string} eventStartTime - Event start time (ISO string) for calculating hours before event
   * @returns {Promise<Object>} RSVP cancellation response
   */
  async cancelEventRsvp(eventId, eventStartTime) {
    if (!this.sessionToken) {
      throw new Error('Not authenticated');
    }

    try {
      const payload = {
        session_token: this.sessionToken,
        event_id: eventId,
        email: this.userEmail // Include email for now until proper session validation is implemented
      };

      if (eventStartTime) {
        payload.event_start_time = eventStartTime;
      }

      const response = await fetch(this.getApiUrl('cancel-event-rsvp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }
        throw new Error(data.message || 'Failed to cancel RSVP');
      }
      
      return data;
    } catch (error) {
      console.error('Error cancelling RSVP:', error);
      throw error;
    }
  }

  /**
   * Get list of minors for authenticated user
   * @returns {Promise<Object>} Minors list response
   */
  async getMinorsList() {
    if (!this.sessionToken) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch(this.apiEndpoints.minorsList, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_token: this.sessionToken }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }
        throw new Error(data.message || 'Failed to fetch minors list');
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching minors list:', error);
      throw error;
    }
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} Authentication status
   */
  isAuthenticated() {
    return !!(this.sessionToken && this.userEmail && 
              this.sessionExpiry && new Date(this.sessionExpiry) > new Date());
  }

  /**
   * Get current session token
   * @returns {string|null} Session token or null if not authenticated
   */
  getSessionToken() {
    return this.isAuthenticated() ? this.sessionToken : null;
  }

  /**
   * Get current user email
   * @returns {string|null} User email or null if not authenticated
   */
  getUserEmail() {
    return this.isAuthenticated() ? this.userEmail : null;
  }

  /**
   * Get session expiry date
   * @returns {Date|null} Session expiry date or null if not authenticated
   */
  getSessionExpiry() {
    return this.isAuthenticated() ? new Date(this.sessionExpiry) : null;
  }

  /**
   * Logout user and clear session data
   */
  logout() {
    this.sessionToken = null;
    this.userEmail = null;
    this.sessionExpiry = null;

    localStorage.removeItem('auth_session_token');
    localStorage.removeItem('auth_user_email');
    localStorage.removeItem('auth_session_expiry');
  }
}

// Create global instance
window.authClient = new AuthClient();