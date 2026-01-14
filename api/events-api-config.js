/**
 * Events API Configuration Endpoint
 * Provides API URL and key for frontend clients
 */

// This would typically be served by a Lambda function or server-side script
// For now, this is a placeholder that shows the expected structure

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        // In production, these would be loaded from environment variables or SSM
        const config = {
            apiUrl: process.env.EVENTS_API_URL || 'https://api.waterwaycleanups.org/dev',
            // Note: API key should be public-safe or use a different auth method
            // For now, we'll return a placeholder
            apiKey: process.env.EVENTS_API_KEY || 'placeholder-key',
            version: '1.0.0',
            features: {
                authentication: true,
                rateLimit: true,
                adminOperations: true
            }
        };

        res.status(200).json(config);
    } catch (error) {
        console.error('Error loading Events API config:', error);
        res.status(500).json({ 
            error: 'Failed to load API configuration',
            message: error.message 
        });
    }
}