function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // Check if the request is for the main app or the SESv2 admin app
    if (uri.startsWith('/sesv2-admin')) {
        // For the SESv2 admin app
        
        // Handle root path for the admin app and ensure trailing slash for proper React Router basename handling
        if (uri === '/sesv2-admin') {
            // Redirect to add trailing slash to ensure proper basename handling
            var response = {
                statusCode: 301,
                statusDescription: 'Moved Permanently',
                headers: {
                    'location': { value: '/sesv2-admin/' }
                }
            };
            return response;
        }
        
        if (uri === '/sesv2-admin/') {
            request.uri = '/sesv2-admin/index.html';
            return request;
        }
        
        // Check if requesting a file with extension (e.g., .js, .css, .png)
        if (/\.[a-zA-Z0-9]+$/.test(uri)) {
            // Request is for a file with extension, keep it as is
            return request;
        }
        
        // If it's not a file request, always serve index.html for SPA routing
        request.uri = '/sesv2-admin/index.html';
    } else if (uri.startsWith('/static/') || uri === '/favicon.ico' || uri === '/manifest.json' || 
              uri === '/logo192.png' || uri === '/logo512.png' || uri === '/robots.txt') {
        // Rewrite requests for the React app's assets to the sesv2-admin folder
        request.uri = '/sesv2-admin' + uri;
    } else {
        // For the main app
        
        // If URI ends with '/' or doesn't include a file extension, append 'index.html'
        if (uri.endsWith('/') || !uri.includes('.')) {
            request.uri = uri.endsWith('/') ? uri + 'index.html' : uri + '/index.html';
        }
    }
    
    return request;
}
