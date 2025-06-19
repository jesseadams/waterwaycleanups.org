function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // Debug logging (CloudFront will show this in logs)
    console.log('Original URI:', uri);
    
    // Check if this is a direct file request (has an extension)
    if (/\.[a-zA-Z0-9]+$/.test(uri)) {
        // Already requesting a specific file, leave the URI as is
        console.log('File request detected, passing through:', uri);
        return request;
    }
    
    // For the SESv2 admin app, we need a specific handling
    if (uri === '/sesv2-admin' || uri.startsWith('/sesv2-admin/')) {
        console.log('SESv2 admin app request detected');
        
        // Redirect /sesv2-admin to /sesv2-admin/ for consistency
        if (uri === '/sesv2-admin') {
            console.log('Redirecting to add trailing slash');
            return {
                statusCode: 301,
                statusDescription: 'Moved Permanently',
                headers: {
                    'location': { value: '/sesv2-admin/' }
                }
            };
        }
        
        // For all paths in admin app, serve the admin app's index.html
        // The path separation is already handled by the cache behavior
        // So we just need to serve index.html from the root of the admin bucket
        if (uri === '/sesv2-admin/') {
            console.log('Serving admin index.html for root admin path');
            request.uri = '/index.html';
        } else {
            console.log('Serving admin index.html for SPA route:', uri);
            request.uri = '/index.html';
        }
        
        return request;
    }
    
    // For the main app
    console.log('Main app request detected');
    
    // Serve index.html for all non-file routes
    console.log('Serving main app index.html for:', uri);
    request.uri = '/index.html';
    
    return request;
}
