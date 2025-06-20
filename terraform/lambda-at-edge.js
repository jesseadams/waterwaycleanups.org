'use strict';

exports.handler = (event, context, callback) => {
    // Get request from event
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    const uri = request.uri;
    
    // Get the origin ID to use in logging
    const originId = request.origin && request.origin.s3 ? request.origin.s3.domainName : 'unknown';
    
    // Log the original request
    console.log('Lambda@Edge Processing Request:', {
        uri: uri,
        method: request.method,
        originId: originId,
        clientIp: request.clientIp || 'unknown'
    });
    
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
        
        // For requests to /sesv2-admin/* path 
        if (uri.startsWith('/sesv2-admin/')) {
            console.log('Processing SESv2 admin path:', uri);
            
            // Get the part after /sesv2-admin/
            const pathSuffix = uri.replace('/sesv2-admin/', '');
            
            // If it's a file request (contains a dot or is a known static asset path)
            if (pathSuffix.includes('.') || 
                pathSuffix.startsWith('static/') || 
                pathSuffix === 'env-config.js' ||
                pathSuffix.startsWith('assets/')) {
                
                // This is a static asset - rewrite the path to the root of the bucket
                const newUri = '/' + pathSuffix;
                console.log('Rewriting SESv2 admin asset path:', {
                    from: uri,
                    to: newUri,
                    pathSuffix: pathSuffix
                });
                request.uri = newUri;
            } else {
                // This is a SPA route - serve index.html
                console.log('Serving SESv2 admin index.html for SPA route:', uri);
                request.uri = '/index.html';
            }
            
            return callback(null, request);
        }
        
        // For main app requests
        if (!uri.startsWith('/sesv2-admin')) {
            // Check if this is a direct file request (has an extension)
            const hasFileExtension = uri.includes('.');
            
            if (!hasFileExtension) {
                const oldUri = request.uri;
                request.uri = '/index.html'; // Always serve index.html for SPA routes
                
                console.log('Main app SPA route detected, changing URI:', {
                    from: oldUri,
                    to: request.uri
                });
            } else {
                // This is a static asset request for the main app.
                // Ensure the path is correct (should already be correct since it's not transformed)
                // But let's validate it just in case
                if (!uri.startsWith('/')) {
                    request.uri = '/' + uri;
                }
                console.log('Main app file request, URI:', request.uri);
            }
        }
        
    } catch (error) {
        console.error('Error processing request:', error.message, error.stack);
        // In case of error, just pass the request through unchanged
        // to avoid breaking the site entirely
    }
    
    // Log the final request before returning
    console.log('Final request URI:', request.uri, 'Origin:', originId);
    
    callback(null, request);
};
