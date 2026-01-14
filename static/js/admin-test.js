/**
 * Admin Interface Test Script
 * Tests the admin interface functionality
 */

console.log('Admin Test Script Loaded');

// Test function to verify admin interface components
function testAdminInterface() {
    console.log('Testing Admin Interface...');
    
    // Check if required dependencies are loaded
    const checks = {
        react: typeof React !== 'undefined',
        reactDOM: typeof ReactDOM !== 'undefined',
        authClient: typeof window.authClient !== 'undefined',
        eventsAPI: typeof window.eventsAPI !== 'undefined',
        apiConfig: typeof window.API_CONFIG !== 'undefined'
    };
    
    console.log('Dependency Checks:', checks);
    
    // Check if admin dashboard root element exists
    const adminRoot = document.getElementById('admin-dashboard-root');
    console.log('Admin Dashboard Root Element:', adminRoot ? 'Found' : 'Not Found');
    
    // Check API configuration
    if (window.API_CONFIG) {
        console.log('API Configuration:', window.API_CONFIG);
    }
    
    // Check auth client status
    if (window.authClient) {
        console.log('Auth Client Status:', {
            isAuthenticated: window.authClient.isAuthenticated(),
            userEmail: window.authClient.getUserEmail(),
            sessionToken: window.authClient.getSessionToken() ? 'Present' : 'Not Present'
        });
    }
    
    // Test API endpoints
    if (window.eventsAPI) {
        console.log('Events API Client:', {
            baseUrl: window.eventsAPI.baseUrl,
            apiKey: window.eventsAPI.apiKey ? 'Present' : 'Not Present',
            sessionToken: window.eventsAPI.sessionToken ? 'Present' : 'Not Present'
        });
    }
    
    return checks;
}

// Run test when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', testAdminInterface);
} else {
    testAdminInterface();
}

// Export test function for manual testing
window.testAdminInterface = testAdminInterface;