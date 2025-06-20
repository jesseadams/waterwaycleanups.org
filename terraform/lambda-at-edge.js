'use strict';

exports.handler = (event, context, callback) => {
    // Get request from event
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const uri = request.uri;
    
    // Log the original request
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
    
    try {
        // Handle /sesv2-admin path (without trailing slash)
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
        
        // For requests to /sesv2-admin/* path, we don't need to do anything
        // because the path pattern in CloudFront is already routing to the correct origin
        
        // For main app requests
        if (!uri.startsWith('/sesv2-admin')) {
            // Default SPA behavior for the main app - serve index.html for non-file paths
            if (!hasFileExtension) {
                const oldUri = request.uri;
                request.uri = '/index.html'; // Always serve index.html for SPA routes
                
                console.log('Main app SPA route detected, changing URI:', {
                    from: oldUri,
                    to: request.uri
                });
            } else {
                console.log('Main app file request, keeping URI unchanged:', uri);
            }
        }
        
    } catch (error) {
        console.error('Error processing request:', error);
        // In case of error, just pass the request through unchanged
        // to avoid breaking the site entirely
    }
    
    // Log the final request before returning
    console.log('Final request:', {
        uri: request.uri,
        origin: request.origin ? JSON.stringify(request.origin) : 'default'
    });
    
    callback(null, request);
};
