/**
 * Events API Initialization
 * Loads API configuration and initializes the client
 */

(function() {
    'use strict';

    /**
     * Load Events API configuration and initialize client
     */
    async function initializeEventsAPI() {
        try {
            // Check if API is already initialized
            if (window.eventsAPI) {
                console.log('Events API already initialized');
                return;
            }

            let config;
            
            try {
                // Try to load configuration from backend
                const response = await fetch('/api/events-api-config');
                
                if (response.ok) {
                    config = await response.json();
                } else {
                    throw new Error(`Failed to load API config: ${response.status}`);
                }
            } catch (fetchError) {
                console.warn('Failed to fetch API config, using fallback:', fetchError.message);
                
                // Use fallback configuration
                config = {
                    apiUrl: window.API_CONFIG?.BASE_URL || 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod',
                    apiKey: window.API_CONFIG?.API_KEY || 'waterway-cleanups-api-key'
                };
            }
            
            // Initialize the Events API client
            if (typeof window.initializeEventsAPI === 'function') {
                window.eventsAPI = window.initializeEventsAPI(config.apiUrl, config.apiKey);
                
                // Validate existing session if present
                if (window.eventsAPI.isAuthenticated()) {
                    try {
                        const isValid = await window.eventsAPI.validateSession();
                        if (!isValid) {
                            window.eventsAPI.logout();
                            console.log('Existing session was invalid and has been cleared');
                        }
                    } catch (sessionError) {
                        console.warn('Session validation failed:', sessionError.message);
                        window.eventsAPI.logout();
                    }
                }
                
                console.log('Events API client initialized successfully');
                
                // Dispatch event to notify other scripts
                window.dispatchEvent(new CustomEvent('eventsAPIReady', { 
                    detail: { 
                        client: window.eventsAPI,
                        config: config 
                    } 
                }));
                
            } else {
                throw new Error('Events API client not available');
            }
            
        } catch (error) {
            console.error('Failed to initialize Events API:', error);
            
            // Dispatch error event
            window.dispatchEvent(new CustomEvent('eventsAPIError', { 
                detail: { error: error.message } 
            }));
        }
    }

    /**
     * Wait for DOM to be ready, then initialize
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeEventsAPI);
    } else {
        // DOM is already ready
        initializeEventsAPI();
    }

    /**
     * Utility function to wait for Events API to be ready
     */
    window.waitForEventsAPI = function() {
        return new Promise((resolve, reject) => {
            if (window.eventsAPI) {
                resolve(window.eventsAPI);
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Events API initialization timeout'));
            }, 10000); // 10 second timeout

            window.addEventListener('eventsAPIReady', function(event) {
                clearTimeout(timeout);
                resolve(event.detail.client);
            }, { once: true });

            window.addEventListener('eventsAPIError', function(event) {
                clearTimeout(timeout);
                reject(new Error(event.detail.error));
            }, { once: true });
        });
    };

})();