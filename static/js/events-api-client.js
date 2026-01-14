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
        // For admin-events, use a different approach during development
        if (endpoint === 'admin-events') {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (isLocalhost) {
                // During development, use the user-dashboard API as a workaround
                // since Hugo doesn't serve the /api/admin-events endpoint
                return this.getApiUrl('user-dashboard');
            } else {
                // In production, use the deployed admin-events endpoint
                return `${this.baseUrl}/admin-events`;
            }
        }
        
        // For events-specific endpoints, always use the events API Gateway
        // Don't use Hugo-injected API_CONFIG as it points to a different API Gateway
        const eventsEndpoints = ['events', 'analytics', 'volunteers/metrics', 'volunteers/export'];
        const isEventsEndpoint = eventsEndpoints.some(ep => endpoint.startsWith(ep));
        
        if (isEventsEndpoint) {
            // Determine environment based on hostname
            const hostname = window.location.hostname;
            const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
            const isStaging = hostname.includes('staging');
            
            // Determine the appropriate stage name
            let stageName = 'prod'; // default
            if (isLocalhost) {
                // For localhost development, try staging first, fallback to prod
                stageName = 'staging';
            } else if (isStaging) {
                stageName = 'staging';
            }
            
            // Use the Events API Gateway specifically
            const eventsApiBase = 'https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com';
            const fullUrl = `${eventsApiBase}/${stageName}/${endpoint}`;
            
            console.log(`Events API URL for ${endpoint}: ${fullUrl} (detected environment: ${stageName})`);
            return fullUrl;
        }
        
        // For non-events endpoints, use Hugo-injected API configuration if available
        if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
            return `${window.API_CONFIG.BASE_URL}/${endpoint}`;
        }
        
        // Fallback for other endpoints
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isStaging = hostname.includes('staging');
        
        if (isLocalhost || isStaging) {
            const fallbackBase = 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/staging';
            return `${fallbackBase}/${endpoint}`;
        } else {
            const fallbackBase = 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/prod';
            return `${fallbackBase}/${endpoint}`;
        }
    }

    /**
     * Get default headers for API requests
     */
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };

        // Only add API key for authenticated endpoints
        if (includeAuth) {
            // Use staging API key for localhost development, production key for production
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (isLocalhost) {
                // Use staging API key for localhost development
                headers['X-Api-Key'] = 'DLzv1VYEHralCbMz6C7nC8PmqEe3lTvE1yI8KG0e';
            } else if (this.apiKey) {
                headers['X-Api-Key'] = this.apiKey;
            } else {
                // Use default API key for production
                headers['X-Api-Key'] = 'waterway-cleanups-api-key';
            }
        }

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
            // If we're trying staging and it fails, try production as fallback
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const currentUrl = this.getApiUrl(endpoint);
            
            if (isLocalhost && currentUrl.includes('/staging/') && error.name !== 'APIError') {
                console.warn(`Staging endpoint failed for ${endpoint}, trying production fallback...`);
                
                try {
                    const prodUrl = `https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/prod/${endpoint}`;
                    const prodResponse = await fetch(prodUrl, config);
                    const prodData = await prodResponse.json();

                    if (!prodResponse.ok) {
                        throw new APIError(prodData.error || 'Request failed', prodResponse.status, prodData.error_code);
                    }

                    console.log(`Successfully used production fallback for ${endpoint}`);
                    return prodData;
                } catch (prodError) {
                    console.error(`Both staging and production failed for ${endpoint}:`, prodError);
                    // Fall through to original error handling
                }
            }
            
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
            // For localhost development, try to load from static JSON file first
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (isLocalhost) {
                try {
                    console.log('Loading events from static data file...');
                    const response = await fetch('/data/admin-events.json');
                    
                    if (response.ok) {
                        const data = await response.json();
                        let events = data.events || [];
                        
                        // Apply filters
                        if (filters.status) {
                            events = events.filter(event => event.status === filters.status);
                        }
                        
                        if (filters.location) {
                            events = events.filter(event => 
                                event.location && event.location.name && 
                                event.location.name.toLowerCase().includes(filters.location.toLowerCase())
                            );
                        }
                        
                        console.log(`✅ Loaded ${events.length} events from static data`);
                        
                        return {
                            success: true,
                            events: events,
                            count: events.length,
                            source: 'static-file'
                        };
                    }
                } catch (staticError) {
                    console.warn('Static events file not available, trying API...');
                }
            }
            
            // Fallback to API
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
     * For now, returns mock data since we don't have a volunteers list API
     */
    async getVolunteers(filters = {}) {
        try {
            // This would need to be implemented as a proper admin API endpoint
            // For now, return empty array to prevent errors
            console.warn('Volunteers API not yet implemented - returning empty list');
            
            return {
                success: true,
                volunteers: [],
                total: 0
            };
            
        } catch (error) {
            console.error('Error loading volunteers:', error);
            throw error;
        }
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