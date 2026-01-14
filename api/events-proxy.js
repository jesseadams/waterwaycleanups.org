/**
 * Events API Proxy for Local Development
 * Proxies requests to the staging API to avoid CORS issues
 */

export default async function handler(req, res) {
    // Set CORS headers for localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Extract the API path from the request
        const { path, ...queryParams } = req.query;
        const apiPath = Array.isArray(path) ? path.join('/') : path || '';
        
        // Build the target URL
        const stagingBaseUrl = 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging';
        const targetUrl = `${stagingBaseUrl}/${apiPath}`;
        
        // Build query string
        const queryString = new URLSearchParams(queryParams).toString();
        const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;
        
        console.log(`Proxying ${req.method} request to: ${fullUrl}`);
        
        // Prepare headers for the upstream request
        const upstreamHeaders = {
            'Content-Type': 'application/json'
        };
        
        // Forward Authorization header if present
        if (req.headers.authorization) {
            upstreamHeaders['Authorization'] = req.headers.authorization;
        }
        
        // Add API key for staging environment
        upstreamHeaders['X-Api-Key'] = 'waterway-cleanups-api-key';
        
        // Prepare the fetch options
        const fetchOptions = {
            method: req.method,
            headers: upstreamHeaders
        };
        
        // Add body for POST/PUT requests
        if (req.method === 'POST' || req.method === 'PUT') {
            fetchOptions.body = JSON.stringify(req.body);
        }
        
        // Make the request to the staging API
        const response = await fetch(fullUrl, fetchOptions);
        const data = await response.text();
        
        // Forward the response
        res.status(response.status);
        
        // Try to parse as JSON, fallback to text
        try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
        } catch (e) {
            res.send(data);
        }
        
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: 'Proxy error',
            message: error.message,
            success: false
        });
    }
}