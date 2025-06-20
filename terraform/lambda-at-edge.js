'use strict';

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const uri = request.uri;
    
    console.log('Original request URI: ', uri);
    
    // Check if this is a direct file request (has an extension)
    const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(uri);
    
    // Handle base /sesv2-admin path (without trailing slash)
    if (uri === '/sesv2-admin') {
        // Redirect to add trailing slash for consistency
        const response = {
            status: '301',
            statusDescription: 'Moved Permanently',
            headers: {
                'location': [{
                    key: 'Location',
                    value: '/sesv2-admin/'
                }],
                'cache-control': [{
                    key: 'Cache-Control',
                    value: 'max-age=3600'
                }],
            },
        };
        callback(null, response);
        return;
    }
    
    // Default SPA behavior - serve index.html for non-file paths
    if (!hasFileExtension) {
        // This could be a SPA route, serve index.html
        if (uri === '/') {
            request.uri = '/index.html';
        } else {
            // Preserve the trailing slash behavior but serve index.html
            request.uri = '/index.html';
        }
        
        console.log('SPA route detected, serving: ', request.uri);
    }
    
    // For file requests, keep the URI as is
    
    callback(null, request);
};
