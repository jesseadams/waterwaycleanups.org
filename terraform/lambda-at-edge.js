'use strict';

exports.handler = (event, context, callback) => {
    // Get request from event
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const uri = request.uri;
    
    // Enhanced logging with full request details
    console.log('Lambda@Edge Processing Request:', {
        uri: uri,
        method: request.method,
        originId: request.origin ? request.origin.s3.id : 'unknown',
        headers: JSON.stringify(headers),
        clientIp: request.clientIp || 'unknown'
    });
    
    // Check if this is a direct file request (has an extension)
    const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(uri);
    console.log('Has file extension:', hasFileExtension);
    
    // Handle base /sesv2-admin path (without trailing slash)
    if (uri === '/sesv2-admin') {
        console.log('Redirecting /sesv2-admin to /sesv2-admin/');
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
        const oldUri = request.uri;
        
        if (uri === '/') {
            request.uri = '/index.html';
        } else {
            // Preserve the trailing slash behavior but serve index.html
            request.uri = '/index.html';
        }
        
        console.log('SPA route detected, changing URI:', {
            from: oldUri,
            to: request.uri
        });
    } else {
        console.log('File request, keeping URI unchanged:', uri);
    }
    
    // Log the final request before returning
    console.log('Final request:', {
        uri: request.uri,
        origin: request.origin ? JSON.stringify(request.origin) : 'default'
    });
    
    callback(null, request);
};
