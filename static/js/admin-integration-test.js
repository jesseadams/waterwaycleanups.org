/**
 * Admin Interface Integration Test
 * Simple test to verify admin components load correctly
 */

// Test function to verify admin interface dependencies
function testAdminIntegration() {
  const results = {
    react: false,
    reactDOM: false,
    authClient: false,
    eventsAPI: false,
    adminPage: false,
    apiConfig: false
  };

  // Check React
  if (typeof React !== 'undefined') {
    results.react = true;
    console.log('✅ React loaded successfully');
  } else {
    console.error('❌ React not loaded');
  }

  // Check ReactDOM
  if (typeof ReactDOM !== 'undefined') {
    results.reactDOM = true;
    console.log('✅ ReactDOM loaded successfully');
  } else {
    console.error('❌ ReactDOM not loaded');
  }

  // Check AuthClient
  if (window.authClient) {
    results.authClient = true;
    console.log('✅ AuthClient initialized');
  } else {
    console.error('❌ AuthClient not initialized');
  }

  // Check API Config
  if (window.API_CONFIG) {
    results.apiConfig = true;
    console.log('✅ API Config available:', window.API_CONFIG);
  } else {
    console.warn('⚠️ API Config not found, will use defaults');
  }

  // Check Events API
  if (window.eventsAPI) {
    results.eventsAPI = true;
    console.log('✅ Events API initialized');
  } else if (window.initializeEventsAPI || window.waitForEventsAPI) {
    console.log('⏳ Events API initialization in progress...');
    // Try to wait for it
    if (window.waitForEventsAPI) {
      window.waitForEventsAPI()
        .then(() => {
          console.log('✅ Events API initialized (delayed)');
        })
        .catch((error) => {
          console.error('❌ Events API failed to initialize:', error.message);
        });
    }
  } else {
    console.error('❌ Events API not available');
  }

  // Check admin page element
  const adminRoot = document.getElementById('admin-dashboard-root');
  if (adminRoot) {
    results.adminPage = true;
    console.log('✅ Admin dashboard root element found');
  } else {
    console.error('❌ Admin dashboard root element not found');
  }

  // Overall result
  const criticalTests = ['react', 'reactDOM', 'authClient', 'adminPage'];
  const criticalPassed = criticalTests.every(test => results[test] === true);
  
  if (criticalPassed) {
    console.log('🎉 Critical admin integration tests passed!');
    if (!results.eventsAPI) {
      console.log('⚠️ Events API still loading - admin interface will wait for it');
    }
  } else {
    console.warn('⚠️ Some critical admin integration tests failed. Check the logs above.');
  }

  return results;
}

// Auto-run test if on admin page
if (document.getElementById('admin-dashboard-root')) {
  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(testAdminIntegration, 1000);
    });
  } else {
    setTimeout(testAdminIntegration, 1000);
  }
}

// Export for manual testing
window.testAdminIntegration = testAdminIntegration;