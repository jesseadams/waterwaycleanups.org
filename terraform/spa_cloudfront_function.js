function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // Check if the request is for the SESv2 admin app
    if (uri.startsWith('/sesv2-admin')) {
        // Strip the /sesv2-admin prefix since the files are stored at the root of the sesv2-admin bucket
        // but we access them through the /sesv2-admin path pattern
        var adminPath = uri.replace('/sesv2-admin', '');
        
        // Handle empty path - redirect to add trailing slash for consistency
        if (adminPath === '') {
            return {
                statusCode: 301,
                statusDescription: 'Moved Permanently',
                headers: {
                    'location': { value: '/sesv2-admin/' }
                }
            };
        }
        
        // Handle root path with trailing slash
        if (adminPath === '/') {
            request.uri = '/index.html';
            return request;
        }
        
        // Check if requesting a file with extension (e.g., .js, .css, .png)
        if (/\.[a-zA-Z0-9]+$/.test(adminPath)) {
            // Direct file request, keep the path but remove /sesv2-admin prefix
            request.uri = adminPath;
            return request;
        }
        
        // For all other paths in the admin app - serve index.html for SPA routing
        request.uri = '/index.html';
        return request;
    } 
    
    // For the main app (non /sesv2-admin paths)
    
    // Check if requesting a file with extension
    if (/\.[a-zA-Z0-9]+$/.test(uri)) {
        // Direct file request, keep it as is
        return request;
    }
    
    // Add trailing slash for consistent behavior if needed
    if (uri !== '/' && !uri.endsWith('/')) {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: uri + '/' }
            }
        };
    }
    
    // Serve index.html for all other requests in the main app (SPA routing)
    request.uri = '/index.html';
    return request;
}
