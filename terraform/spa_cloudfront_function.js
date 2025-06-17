function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // Check if the request is for the main app or the SESv2 admin app
    if (uri.startsWith('/sesv2-admin')) {
        // For the SESv2 admin app
        
        // Check if requesting a file with extension (e.g., .js, .css, .png)
        if (/\.[a-zA-Z0-9]+$/.test(uri)) {
            // Request is for a file with extension, keep it as is
            return request;
        }
        
        // If it's not a file request, always serve index.html for SPA routing
        request.uri = '/sesv2-admin/index.html';
    } else {
        // For the main app
        
        // If URI ends with '/' or doesn't include a file extension, append 'index.html'
        if (uri.endsWith('/') || !uri.includes('.')) {
            request.uri = uri.endsWith('/') ? uri + 'index.html' : uri + '/index.html';
        }
    }
    
    return request;
}
