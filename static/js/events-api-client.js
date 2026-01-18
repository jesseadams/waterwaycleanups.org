/**
 * Events API Client
 * Provides methods to interact with the database-driven events API
 */

class EventsAPIClient {
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.sessionToken = null;
        
        // Load session token from localStorage if available
        this.loadSessionToken();
    }

    /**
     * Load session token from localStorage
     */
    loadSessionToken() {
        try {
            this.sessionToken = localStorage.getItem('session_token');
        } catch (error) {
            console.warn('Could not load session token from localStorage:', error);
        }
    }

    /**
     * Set session token and save to localStorage
     */
    setSessionToken(token) {
        this.sessionToken = token;
        try {
            if (token) {
                localStorage.setItem('session_token', token);
            } else {
                localStorage.removeItem('session_token');
            }
        } catch (error) {
            console.warn('Could not save session token to localStorage:', error);
        }
    }

    /**
     * Get API URL based on environment (same logic as AuthClient)
     */
    getApiUrl(endpoint) {
        // For events-specific endpoints, use the Events API Gateway
        const eventsEndpoints = ['events', 'analytics', 'volunteers/metrics', 'volunteers/export'];
        const isEventsEndpoint = eventsEndpoints.some(ep => endpoint.startsWith(ep));
        
        if (isEventsEndpoint) {
            // Use Hugo-injected Events API URL
            if (window.API_CONFIG && window.API_CONFIG.EVENTS_API_URL) {
                return `${window.API_CONFIG.EVENTS_API_URL}/${endpoint}`;
            }
            
            throw new Error('EVENTS_API_URL not found. Build with HUGO_EVENTS_API_URL environment variable.');
        }
        
        // For all other endpoints (auth, admin, etc.), use standard API configuration
        // This includes auth endpoints, admin-volunteers, etc.
        if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
            return `${window.API_CONFIG.BASE_URL}/${endpoint}`;
        }
        
        throw new Error('API_CONFIG not found. Build with HUGO_API_BASE_URL environment variable.');
    }

    /**
     * Get default headers for API requests
     */
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };

        // Add API key if provided
        if (includeAuth && this.apiKey) {
            headers['X-Api-Key'] = this.apiKey;
        }

        // Add session token if available
        if (includeAuth && this.sessionToken) {
            headers['Authorization'] = `Bearer ${this.sessionToken}`;
        }

        return headers;
    }

    /**
     * Make HTTP request to API with automatic fallback
     */
    async makeRequest(endpoint, options = {}) {
        const url = this.getApiUrl(endpoint);
        const config = {
            headers: this.getHeaders(options.requireAuth !== false),
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new APIError(data.error || 'Request failed', response.status, data.error_code);
            }

            return data;
        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError('Network error or invalid response', 0, 'NETWORK_ERROR');
        }
    }

    // ===== EVENT METHODS =====

    /**
     * Get list of events with optional filtering
     */
    async getEvents(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            if (filters.status) params.append('status', filters.status);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            if (filters.location) params.append('location', filters.location);
            if (filters.limit) params.append('limit', filters.limit);
            if (filters.offset) params.append('offset', filters.offset);

            const queryString = params.toString();
            const endpoint = `events${queryString ? '?' + queryString : ''}`;
            
            return this.makeRequest(endpoint, { 
                method: 'GET',
                requireAuth: false
            });
            
        } catch (error) {
            console.error('Error loading events:', error);
            throw error;
        }
    }

    /**
     * Get specific event by ID
     */
    async getEvent(eventId) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}`, {
            method: 'GET',
            requireAuth: false  // Public endpoint
        });
    }

    /**
     * Create new event (admin only)
     */
    async createEvent(eventData) {
        return this.makeRequest('/events', {
            method: 'POST',
            body: JSON.stringify(eventData)
        });
    }

    /**
     * Update existing event (admin only)
     */
    async updateEvent(eventId, eventData) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}`, {
            method: 'PUT',
            body: JSON.stringify(eventData)
        });
    }

    /**
     * Delete event (admin only)
     */
    async deleteEvent(eventId) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}`, {
            method: 'DELETE'
        });
    }

    /**
     * Get RSVPs for specific event (admin only)
     */
    async getEventRSVPs(eventId) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}/rsvps`, {
            method: 'GET'
        });
    }

    // ===== VOLUNTEER METHODS =====

    /**
     * Get volunteer profile
     */
    async getVolunteer(email) {
        return this.makeRequest(`/volunteers/${encodeURIComponent(email)}`, {
            method: 'GET'
        });
    }

    /**
     * Update volunteer profile
     */
    async updateVolunteer(email, volunteerData) {
        return this.makeRequest(`/volunteers/${encodeURIComponent(email)}`, {
            method: 'PUT',
            body: JSON.stringify(volunteerData)
        });
    }

    /**
     * Get volunteer's RSVP history
     */
    async getVolunteerRSVPs(email) {
        return this.makeRequest(`/volunteers/${encodeURIComponent(email)}/rsvps`, {
            method: 'GET'
        });
    }

    /**
     * Get list of all volunteers (admin only)
     */
    async getVolunteers(filters = {}) {
        // Use relative URL to hit Netlify Function or API Gateway
        return this.makeRequest('admin-volunteers', {
            method: 'GET'
        });
    }

    /**
     * Export volunteer data (admin only)
     */
    async exportVolunteers(format = 'json') {
        return this.makeRequest(`/volunteers/export?format=${format}`, {
            method: 'GET'
        });
    }

    // ===== AUTHENTICATION HELPERS =====

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.sessionToken;
    }

    /**
     * Clear authentication
     */
    logout() {
        this.setSessionToken(null);
    }

    /**
     * Validate current session
     */
    async validateSession() {
        if (!this.sessionToken) {
            return false;
        }

        try {
            // Use the existing auth validation endpoint
            const response = await fetch('/api/auth-validate-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_token: this.sessionToken
                })
            });

            const data = await response.json();
            return data.valid === true;
        } catch (error) {
            console.error('Session validation failed:', error);
            return false;
        }
    }

    // ===== ANALYTICS METHODS =====

    /**
     * Get analytics data
     */
    async getAnalytics(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            if (filters.type) params.append('type', filters.type);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);

            const queryString = params.toString();
            const endpoint = `analytics${queryString ? '?' + queryString : ''}`;
            
            return this.makeRequest(endpoint, { 
                method: 'GET',
                requireAuth: true
            });
            
        } catch (error) {
            console.error('Error loading analytics:', error);
            throw error;
        }
    }

    /**
     * Export events data
     */
    async exportEvents(format = 'json', filters = {}) {
        try {
            const params = new URLSearchParams();
            params.append('format', format);
            
            if (filters.include_rsvp_stats !== undefined) {
                params.append('include_rsvp_stats', filters.include_rsvp_stats);
            }
            if (filters.status) params.append('status', filters.status);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);

            const queryString = params.toString();
            const endpoint = `events/export${queryString ? '?' + queryString : ''}`;
            
            return this.makeRequest(endpoint, { 
                method: 'GET',
                requireAuth: true
            });
            
        } catch (error) {
            console.error('Error exporting events:', error);
            throw error;
        }
    }

    /**
     * Export volunteers data
     */
    async exportVolunteers(format = 'json', filters = {}) {
        try {
            const params = new URLSearchParams();
            params.append('format', format);
            
            if (filters.include_metrics !== undefined) {
                params.append('include_metrics', filters.include_metrics);
            }
            if (filters.profile_complete !== undefined) {
                params.append('profile_complete', filters.profile_complete);
            }

            const queryString = params.toString();
            const endpoint = `volunteers/export${queryString ? '?' + queryString : ''}`;
            
            return this.makeRequest(endpoint, { 
                method: 'GET',
                requireAuth: true
            });
            
        } catch (error) {
            console.error('Error exporting volunteers:', error);
            throw error;
        }
    }

    /**
     * Get volunteer metrics
     */
    async getVolunteerMetrics(filters = {}) {
        try {
            const params = new URLSearchParams();
            
            if (filters.type) params.append('type', filters.type);
            if (filters.limit) params.append('limit', filters.limit);

            const queryString = params.toString();
            const endpoint = `volunteers/metrics${queryString ? '?' + queryString : ''}`;
            
            return this.makeRequest(endpoint, { 
                method: 'GET',
                requireAuth: true
            });
            
        } catch (error) {
            console.error('Error loading volunteer metrics:', error);
            throw error;
        }
    }

    /**
     * Get detailed volunteer metrics for a specific volunteer
     */
    async getDetailedVolunteerMetrics(email) {
        try {
            const endpoint = `volunteers/metrics/${encodeURIComponent(email)}`;
            
            return this.makeRequest(endpoint, { 
                method: 'GET',
                requireAuth: true
            });
            
        } catch (error) {
            console.error('Error loading detailed volunteer metrics:', error);
            throw error;
        }
    }
}

/**
 * Custom error class for API errors
 */
class APIError extends Error {
    constructor(message, statusCode, errorCode) {
        super(message);
        this.name = 'APIError';
        this.statusCode = statusCode;
        this.errorCode = errorCode;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventsAPIClient, APIError };
}

// Global instance (will be initialized when API config is loaded)
window.eventsAPI = null;

/**
 * Initialize the Events API client
 * This should be called after loading the API configuration
 */
window.initializeEventsAPI = function(baseUrl, apiKey) {
    window.eventsAPI = new EventsAPIClient(baseUrl, apiKey);
    return window.eventsAPI;
};