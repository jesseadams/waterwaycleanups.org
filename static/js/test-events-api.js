/**
 * Test script to verify Events API is working
 */

console.log('🧪 Testing Events API...');

// Test the Events API directly
async function testEventsAPI() {
    try {
        console.log('📡 Testing direct API call...');
        
        const response = await fetch('https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/prod/events', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📊 Response status:', response.status);
        console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ API call successful!');
            console.log('📈 Events count:', data.events ? data.events.length : 0);
            console.log('📋 First event:', data.events ? data.events[0] : 'No events');
            return data;
        } else {
            console.error('❌ API call failed:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('❌ Error response:', errorText);
            return null;
        }
    } catch (error) {
        console.error('❌ Network error:', error);
        return null;
    }
}

// Test the Events API Client
async function testEventsAPIClient() {
    try {
        console.log('🔧 Testing Events API Client...');
        
        // Initialize the API client
        const apiClient = new EventsAPIClient('https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/prod', null);
        
        console.log('📡 Making API call through client...');
        const response = await apiClient.getEvents();
        
        console.log('✅ API Client call successful!');
        console.log('📈 Events count:', response.events ? response.events.length : 0);
        console.log('📋 Response structure:', Object.keys(response));
        
        return response;
    } catch (error) {
        console.error('❌ API Client error:', error);
        return null;
    }
}

// Run tests
async function runTests() {
    console.log('🚀 Starting Events API tests...');
    
    // Test 1: Direct API call
    const directResult = await testEventsAPI();
    
    // Test 2: API Client
    const clientResult = await testEventsAPIClient();
    
    // Summary
    console.log('📊 Test Summary:');
    console.log('  Direct API:', directResult ? '✅ Success' : '❌ Failed');
    console.log('  API Client:', clientResult ? '✅ Success' : '❌ Failed');
    
    if (directResult && clientResult) {
        console.log('🎉 All tests passed! Events API is working correctly.');
        
        // Test admin authentication flow
        console.log('🔐 Testing admin authentication...');
        if (window.authClient) {
            console.log('✅ Auth client available');
            console.log('🔑 Is authenticated:', window.authClient.isAuthenticated());
        } else {
            console.log('❌ Auth client not available');
        }
    } else {
        console.log('💥 Some tests failed. Check the errors above.');
    }
}

// Auto-run tests when script loads
if (typeof window !== 'undefined') {
    // Wait for other scripts to load
    setTimeout(runTests, 1000);
}