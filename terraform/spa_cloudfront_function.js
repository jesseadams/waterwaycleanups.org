function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // Check if this is a direct file request (has an extension)
    if (/\.[a-zA-Z0-9]+$/.test(uri)) {
        // Already requesting a specific file, leave the URI as is
        return request;
    }
    
    // For SPA routes, serve the appropriate index.html
    // The origin selection is already handled by the cache behavior path patterns
    // We just need to rewrite the URI to index.html for non-file requests
    
    // If we have a trailing slash or it's the root path, append index.html
    if (uri === '/' || uri === '/sesv2-admin/' || uri === '/sesv2-admin') {
        request.uri = uri.endsWith('/') ? uri + 'index.html' : uri + '/index.html';
    } else if (!uri.endsWith('/')) {
        // For consistent behavior, add a trailing slash for SPA routes
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: uri + '/' }
            }
        };
    } else {
        // For all other paths with trailing slash, serve index.html from that path
        request.uri = uri + 'index.html';
    }
    
    return request;
}
