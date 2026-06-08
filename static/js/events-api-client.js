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
        // Strip leading slash for consistent matching
        const cleanEndpoint = endpoint.replace(/^\//, '');
        
        // For events-specific endpoints, use the Events API Gateway
        const eventsEndpoints = ['events', 'analytics', 'volunteers/metrics', 'volunteers/export'];
        const isEventsEndpoint = eventsEndpoints.some(ep => cleanEndpoint.startsWith(ep));
        
        if (isEventsEndpoint) {
            // Use Hugo-injected Events API URL
            if (window.API_CONFIG && window.API_CONFIG.EVENTS_API_URL) {
                return `${window.API_CONFIG.EVENTS_API_URL}/${cleanEndpoint}`;
            }
            
            throw new Error('EVENTS_API_URL not found. Build with HUGO_EVENTS_API_URL environment variable.');
        }
        
        // For all other endpoints (auth, admin, etc.), use standard API configuration
        // This includes auth endpoints, admin-volunteers, etc.
        if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
            return `${window.API_CONFIG.BASE_URL}/${cleanEndpoint}`;
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

        const maxRetries = options._retries ?? 2;
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, config);
                const data = await response.json();

                if (!response.ok) {
                    // Don't retry 4xx client errors (except 429 rate limit)
                    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                        throw new APIError(data.error || 'Request failed', response.status, data.error_code);
                    }
                    throw new APIError(data.error || 'Request failed', response.status, data.error_code);
                }

                return data;
            } catch (error) {
                lastError = error instanceof APIError ? error
                    : new APIError('Network error or invalid response', 0, 'NETWORK_ERROR');

                // Don't retry client errors (except rate limit)
                if (lastError.statusCode >= 400 && lastError.statusCode < 500 && lastError.statusCode !== 429) {
                    throw lastError;
                }

                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw lastError;
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

    /**
     * Mark an RSVP as no-show or remove no-show status (admin only)
     */
    async markNoShow(eventId, email, noShow = true) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}/attendance`, {
            method: 'POST',
            body: JSON.stringify({
                action: noShow ? 'no_show' : 'undo_no_show',
                attendee_id: email,
                email: email
            })
        });
    }

    /**
     * Confirm attendance for a specific RSVP (admin only)
     */
    async confirmAttendance(eventId, attendeeId) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}/attendance`, {
            method: 'POST',
            body: JSON.stringify({
                action: 'attended',
                attendee_id: attendeeId
            })
        });
    }

    /**
     * Add a walk-in participant who didn't RSVP (admin only)
     */
    async addWalkIn(eventId, firstName, lastName, email = '') {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}/attendance`, {
            method: 'POST',
            body: JSON.stringify({
                action: 'walk_in',
                first_name: firstName,
                last_name: lastName,
                email: email
            })
        });
    }

    /**
     * Bulk confirm attendance for all remaining active RSVPs (admin only)
     */
    async bulkConfirmAttendance(eventId) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}/attendance`, {
            method: 'POST',
            body: JSON.stringify({
                action: 'bulk_confirm'
            })
        });
    }

    /**
     * Cancel an event and optionally notify RSVPs (admin only)
     */
    async cancelEvent(eventId, reason = '', notifyVolunteers = true) {
        return this.makeRequest('/events/lifecycle', {
            method: 'POST',
            body: JSON.stringify({
                action: 'cancel_event',
                event_id: eventId,
                reason: reason,
                notify_volunteers: notifyVolunteers
            })
        });
    }

    /**
     * Complete an event with cleanup metrics (admin only)
     */
    async completeEvent(eventId, metrics) {
        return this.makeRequest('/events/lifecycle', {
            method: 'POST',
            body: JSON.stringify({
                action: 'complete_event',
                event_id: eventId,
                bags_of_trash: metrics.bags_of_trash,
                number_of_tires: metrics.number_of_tires || 0,
                large_items_weight_lbs: metrics.large_items_weight_lbs || 0
            })
        });
    }

    /**
     * Create an ad hoc, private, completed event with cleanup metrics (admin only).
     * Ad hoc events appear only in aggregate impact stats, not as event pages.
     */
    async createAdhocEvent(data) {
        return this.makeRequest('/events/lifecycle', {
            method: 'POST',
            body: JSON.stringify({
                action: 'create_adhoc_event',
                title: data.title,
                date: data.date,
                location_name: data.location_name || '',
                volunteer_count: data.volunteer_count || 0,
                event_hours: data.event_hours || 2,
                bags_of_trash: data.bags_of_trash || 0,
                number_of_tires: data.number_of_tires || 0,
                large_items_weight_lbs: data.large_items_weight_lbs || 0
            })
        });
    }

    /**
     * Get message history for an event (admin only)
     */
    async getEventMessages(eventId) {
        const token = localStorage.getItem('auth_session_token');
        const url = this.getApiUrl('admin-send-reminder');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_token: token,
                event_id: eventId,
                action: 'list'
            })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new APIError(data.message || 'Failed to load messages', response.status);
        }
        return data;
    }

    /**
     * Generate a draft reminder message for an event using Bedrock AI (admin only)
     */
    async generateEventMessage(eventId) {
        const token = localStorage.getItem('auth_session_token');
        const url = this.getApiUrl('admin-send-reminder');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_token: token,
                event_id: eventId,
                action: 'generate'
            })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new APIError(data.message || 'Failed to generate message', response.status);
        }
        return data;
    }

    /**
     * Send a message/reminder to all RSVPed attendees for an event (admin only)
     */
    async sendEventReminder(eventId, subject, message) {
        const token = localStorage.getItem('auth_session_token');
        const url = this.getApiUrl('admin-send-reminder');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_token: token,
                event_id: eventId,
                subject,
                message
            })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new APIError(data.message || 'Failed to send reminder', response.status);
        }
        return data;
    }

    async deleteRSVP(eventId, attendeeId) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}/attendance`, {
            method: 'POST',
            body: JSON.stringify({
                action: 'delete',
                attendee_id: attendeeId
            })
        });
    }

    async addMinor(eventId, firstName, lastName, guardianEmail, dateOfBirth) {
        return this.makeRequest(`/events/${encodeURIComponent(eventId)}/attendance`, {
            method: 'POST',
            body: JSON.stringify({
                action: 'add_minor',
                first_name: firstName,
                last_name: lastName,
                guardian_email: guardianEmail,
                date_of_birth: dateOfBirth
            })
        });
    }

    /**
     * Unified walk-in from a directory entry (volunteer or minor).
     *
     * - Volunteer entry: adds the volunteer as a walk-in.
     * - Minor entry: adds the minor AND auto-adds the guardian/parent as a
     *   walk-in (looked up from the directory by guardian_email). This is the
     *   "if a minor is found first, the parent is auto-added" behavior.
     *
     * Returns { added: [names], guardianAdded: bool }.
     */
    async walkInFromDirectory(eventId, entry, directory) {
        var added = [];
        if (!entry) return { added: added, guardianAdded: false };

        if (entry.type === 'minor') {
            var guardianEmail = entry.guardian_email || '';
            var guardianAdded = false;

            // Auto-add the guardian first so the parent is present.
            if (guardianEmail) {
                var guardian = (directory || []).find(function (d) {
                    return d.type === 'volunteer' && d.email && d.email.toLowerCase() === guardianEmail.toLowerCase();
                });
                var gFirst = guardian ? guardian.first_name : '';
                var gLast = guardian ? guardian.last_name : '';
                if (!gFirst && guardian && guardian.full_name) {
                    var parts = guardian.full_name.split(' ');
                    gFirst = parts[0] || '';
                    gLast = parts.slice(1).join(' ') || '';
                }
                if (gFirst || gLast) {
                    try {
                        await this.addWalkIn(eventId, gFirst || 'Guardian', gLast || '', guardianEmail);
                        added.push((gFirst + ' ' + gLast).trim());
                        guardianAdded = true;
                    } catch (e) {
                        // 409 = already has an RSVP; that's fine, parent is present.
                        if (!(e && e.statusCode === 409)) throw e;
                    }
                }
            }

            // Then add the minor.
            await this.addMinor(eventId, entry.first_name, entry.last_name, guardianEmail, entry.date_of_birth);
            added.push((entry.first_name + ' ' + entry.last_name).trim());
            return { added: added, guardianAdded: guardianAdded };
        }

        // Volunteer entry.
        await this.addWalkIn(eventId, entry.first_name, entry.last_name, entry.email);
        added.push((entry.first_name + ' ' + entry.last_name).trim());
        return { added: added, guardianAdded: false };
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
     * Fetch the combined volunteer + minor directory (for autocomplete),
     * cached in-memory. Returns an array of entries:
     *   { type: 'volunteer', email, first_name, last_name, full_name }
     *   { type: 'minor', minor_id, guardian_email, date_of_birth, first_name, last_name, full_name }
     * Available to any authenticated events user (works on admin + kiosk).
     */
    async getVolunteerDirectory(force = false) {
        if (!force && this._volunteerDirectoryCache) {
            return this._volunteerDirectoryCache;
        }
        const data = await this.makeRequest('/volunteers?limit=100&include_minors=true', { method: 'GET' });
        const vList = (data && (data.volunteers || data.items || data.Items)) || [];
        const mList = (data && data.minors) || [];

        const volunteers = vList.map(v => {
            const first = (v.first_name || '').trim();
            const last = (v.last_name || '').trim();
            return {
                type: 'volunteer',
                email: (v.email || '').trim(),
                first_name: first,
                last_name: last,
                full_name: (v.full_name || `${first} ${last}`).trim()
            };
        }).filter(v => v.email || v.full_name);

        const minors = mList.map(m => {
            const first = (m.first_name || '').trim();
            const last = (m.last_name || '').trim();
            return {
                type: 'minor',
                minor_id: m.minor_id,
                guardian_email: (m.guardian_email || '').trim().toLowerCase(),
                date_of_birth: m.date_of_birth || '',
                first_name: first,
                last_name: last,
                full_name: (m.full_name || `${first} ${last}`).trim()
            };
        }).filter(m => m.full_name);

        this._volunteerDirectoryCache = volunteers.concat(minors);
        return this._volunteerDirectoryCache;
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