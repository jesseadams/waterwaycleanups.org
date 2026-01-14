/**
 * Admin API Test Functions
 * Simple functions to test the Events API from browser console
 */

window.AdminAPITest = {
  
  // Test the Events API connectivity
  async testEventsAPI() {
    console.log('🧪 Testing Events API...');
    
    if (!window.eventsAPI) {
      console.error('❌ Events API not initialized');
      return false;
    }
    
    try {
      // Test GET /events (public endpoint)
      console.log('📡 Testing GET /events...');
      const eventsResponse = await window.eventsAPI.getEvents();
      console.log('✅ GET /events successful:', eventsResponse);
      
      // Test GET /volunteers (requires auth, might fail)
      console.log('📡 Testing GET /volunteers...');
      try {
        const volunteersResponse = await window.eventsAPI.getVolunteers();
        console.log('✅ GET /volunteers successful:', volunteersResponse);
      } catch (error) {
        console.log('⚠️ GET /volunteers failed (expected without auth):', error.message);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Events API test failed:', error);
      return false;
    }
  },
  
  // Test API with different configurations
  async testAPIConfigurations() {
    console.log('🧪 Testing different API configurations...');
    
    const configs = [
      {
        name: 'Staging without API key',
        baseUrl: 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging',
        apiKey: null
      },
      {
        name: 'Staging with API key',
        baseUrl: 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging',
        apiKey: 'waterway-cleanups-api-key'
      },
      {
        name: 'Production without API key',
        baseUrl: 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod',
        apiKey: null
      }
    ];
    
    for (const config of configs) {
      console.log(`\n📋 Testing: ${config.name}`);
      console.log(`   URL: ${config.baseUrl}`);
      console.log(`   API Key: ${config.apiKey ? 'Yes' : 'No'}`);
      
      try {
        // Create temporary API client
        const testAPI = window.initializeEventsAPI(config.baseUrl, config.apiKey);
        
        // Test simple GET request
        const response = await testAPI.getEvents();
        console.log(`✅ ${config.name}: SUCCESS`);
        console.log(`   Events found: ${response.events?.length || 0}`);
        
      } catch (error) {
        console.log(`❌ ${config.name}: FAILED`);
        console.log(`   Error: ${error.message}`);
        
        // Check if it's a CORS error
        if (error.message.includes('CORS') || error.message.includes('Network')) {
          console.log('   🔍 Likely CORS issue');
        }
      }
    }
  },
  
  // Test raw fetch requests to bypass API client
  async testRawFetch() {
    console.log('🧪 Testing raw fetch requests...');
    
    const testUrl = 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging/events';
    
    try {
      console.log(`📡 Testing raw fetch to: ${testUrl}`);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
          // No API key to avoid CORS preflight
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Raw fetch successful:', data);
        return true;
      } else {
        console.log(`❌ Raw fetch failed: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log('Response:', text);
        return false;
      }
      
    } catch (error) {
      console.error('❌ Raw fetch error:', error);
      
      // Provide specific guidance based on error type
      if (error.message.includes('CORS')) {
        console.log('🔍 CORS Error Detected:');
        console.log('   - The API server is not allowing requests from this origin');
        console.log('   - Try enabling demo mode: window.AdminDemoMode.enable()');
      } else if (error.message.includes('Network')) {
        console.log('🔍 Network Error Detected:');
        console.log('   - Check internet connection');
        console.log('   - API server might be down');
      }
      
      return false;
    }
  },
  
  // Run all tests
  async runAllTests() {
    console.log('🚀 Running all API tests...\n');
    
    const results = {
      eventsAPI: await this.testEventsAPI(),
      rawFetch: await this.testRawFetch(),
      configurations: await this.testAPIConfigurations()
    };
    
    console.log('\n📊 Test Results Summary:');
    console.log(`   Events API: ${results.eventsAPI ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Raw Fetch: ${results.rawFetch ? '✅ PASS' : '❌ FAIL'}`);
    
    if (!results.eventsAPI && !results.rawFetch) {
      console.log('\n💡 Recommendations:');
      console.log('   1. Enable demo mode: window.AdminDemoMode.enable()');
      console.log('   2. Check if staging API is deployed');
      console.log('   3. Verify CORS configuration on API Gateway');
    }
    
    return results;
  }
};

// Convenience functions for console
window.testAPI = () => window.AdminAPITest.runAllTests();
window.testRawFetch = () => window.AdminAPITest.testRawFetch();
window.testEventsAPI = () => window.AdminAPITest.testEventsAPI();