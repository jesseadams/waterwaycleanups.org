# Admin Interface Troubleshooting Guide

## Common Issues and Solutions

### 1. S3 Access Denied Error on /admin

**Problem**: Getting "Access Denied" when trying to access `/admin` URL.

**Solution**: The admin page needs to be built and deployed to S3.

```bash
# Build the site
npm run build

# Or if using Hugo directly
hugo --minify

# Deploy to S3 (this depends on your deployment setup)
# The admin page should be generated at public/admin/index.html
```

### 2. CORS Error from Localhost

**Problem**: Getting "Access to fetch at '...' has been blocked by CORS policy" when running locally.

**Explanation**: This is expected behavior. The production API doesn't allow requests from localhost for security reasons.

**Solutions**:

1. **Environment Detection**: The admin interface now automatically uses the staging API for localhost development:
   ```javascript
   // Check current configuration
   console.log('API Config:', window.API_CONFIG);
   ```

2. **Enable Demo Mode**: For development without API access:
   ```javascript
   // In browser console
   window.AdminDemoMode.enable();
   ```
   This provides mock data for testing the interface.

3. **Use Production URL**: Deploy to production environment where CORS is properly configured.

### 3. "Events API not initialized" Error

**Problem**: Console shows "Events API not initialized" errors.

**Solutions**:

1. **Check API Configuration**: Open browser console and run:
   ```javascript
   console.log('API Config:', window.API_CONFIG);
   console.log('Events API:', window.eventsAPI);
   window.testAdminIntegration();
   ```

2. **Wait for API to Load**: The admin interface now includes fallback handling. If you see this error, wait a few seconds and try again.

3. **Manual API Initialization**: If the API still isn't loading, try:
   ```javascript
   // In browser console
   window.eventsAPI = window.initializeEventsAPI(
     'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod',
     'waterway-cleanups-api-key'
   );
   ```

### 3. Admin Interface Not Loading

**Problem**: Admin page loads but shows blank or error state.

**Diagnostic Steps**:

1. **Check Browser Console**: Look for JavaScript errors
2. **Run Integration Test**: 
   ```javascript
   window.testAdminIntegration();
   ```
3. **Check Network Tab**: Look for failed resource loads
4. **Verify Dependencies**: Ensure React, ReactDOM, and other dependencies are loading

**Common Fixes**:
- Clear browser cache and reload
- Check that all CSS and JS files are accessible
- Verify CDN resources (React, ReactDOM) are loading

### 4. Authentication Issues

**Problem**: Can't log in to admin interface.

**Solutions**:

1. **Use Admin Email**: Ensure your email contains 'admin' or 'manager' for access
2. **Check Auth Client**: 
   ```javascript
   console.log('Auth Client:', window.authClient);
   console.log('Is Authenticated:', window.authClient.isAuthenticated());
   ```
3. **Clear Session**: If stuck in bad state:
   ```javascript
   window.authClient.logout();
   localStorage.clear();
   location.reload();
   ```

### 5. API Endpoints Not Working

**Problem**: Admin interface loads but can't fetch data.

**Diagnostic**:
```javascript
// Test API connectivity
window.eventsAPI.getEvents()
  .then(data => console.log('Events:', data))
  .catch(error => console.error('API Error:', error));
```

**Solutions**:
- Check that Events API is deployed and running
- Verify API Gateway endpoints are accessible
- Check CORS configuration
- Ensure API keys are valid

### 6. Styling Issues

**Problem**: Admin interface looks broken or unstyled.

**Solutions**:
- Check that `admin-dashboard.css` is loading
- Verify Tailwind CSS classes are working
- Check for CSS conflicts with theme styles
- Clear browser cache

### 7. Mobile/Responsive Issues

**Problem**: Admin interface doesn't work well on mobile.

**Solutions**:
- The interface is designed to be responsive
- Check viewport meta tag is present
- Test on different screen sizes
- Report specific mobile issues for fixes

### 8. Demo Mode for Development

**Problem**: Need to test admin interface without API access.

**Solution**: Use the built-in demo mode:

```javascript
// Enable demo mode (provides mock data)
window.AdminDemoMode.enable();

// Disable demo mode (return to real API)
window.AdminDemoMode.disable();

// Check if demo mode is active
console.log('Demo mode:', window.AdminDemoMode.enabled);
```

**Demo Mode Features**:
- Mock events data with realistic examples
- Mock volunteers data with metrics
- Simulated CRUD operations with console logging
- No network requests - works completely offline

## Debug Commands

### Browser Console Commands

```javascript
// Run full integration test
window.testAdminIntegration();

// Check API status
console.log('Events API:', window.eventsAPI);
console.log('Auth Client:', window.authClient);
console.log('API Config:', window.API_CONFIG);

// Test API calls
window.eventsAPI.getEvents().then(console.log).catch(console.error);
window.eventsAPI.getVolunteers().then(console.log).catch(console.error);

// Check authentication
console.log('Authenticated:', window.authClient.isAuthenticated());
console.log('User Email:', window.authClient.getUserEmail());

// Force API reinitialization
window.eventsAPI = window.initializeEventsAPI(
  'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod',
  'waterway-cleanups-api-key'
);
```

### Network Debugging

1. Open Browser Developer Tools (F12)
2. Go to Network tab
3. Reload the admin page
4. Look for:
   - Failed resource loads (red entries)
   - API calls to `/api/` endpoints
   - CORS errors
   - 404 errors for missing files

### Local Development

If testing locally:

1. **Start Hugo Server**:
   ```bash
   hugo server -D
   ```

2. **Access Admin Interface**:
   ```
   http://localhost:1313/admin
   ```

3. **Check Console**: Look for any errors or warnings

## Getting Help

If you're still having issues:

1. **Collect Debug Info**:
   - Browser console output
   - Network tab errors
   - Result of `window.testAdminIntegration()`
   - Browser and OS version

2. **Check Documentation**:
   - `docs/admin-interface.md` - Full documentation
   - `terraform/EVENTS_API_DOCUMENTATION.md` - API docs

3. **Common Solutions**:
   - Clear browser cache
   - Try different browser
   - Check internet connection
   - Verify API endpoints are accessible

## Prevention

To avoid future issues:

1. **Regular Testing**: Test admin interface after deployments
2. **Monitor APIs**: Ensure Events API is always accessible
3. **Update Dependencies**: Keep React and other dependencies current
4. **Backup Configuration**: Keep API configuration backed up
5. **Documentation**: Keep this troubleshooting guide updated