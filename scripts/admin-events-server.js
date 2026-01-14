#!/usr/bin/env node

/**
 * Admin Events Server
 * Provides a local API endpoint to get all events for admin interface during development
 */

const AWS = require('aws-sdk');
const http = require('http');
const url = require('url');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const eventsTableName = process.env.EVENTS_TABLE_NAME || 'events';

// Helper function to convert DynamoDB Decimal objects
function convertDecimals(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'object' && obj.constructor && obj.constructor.name === 'Decimal') {
    return obj % 1 === 0 ? parseInt(obj) : parseFloat(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertDecimals);
  }
  
  if (typeof obj === 'object') {
    const converted = {};
    for (const key in obj) {
      converted[key] = convertDecimals(obj[key]);
    }
    return converted;
  }
  
  return obj;
}

// Get all events from DynamoDB
async function getAllEvents(filters = {}) {
  try {
    console.log('Fetching all events from DynamoDB...');
    
    const scanParams = {
      TableName: eventsTableName
    };

    // Apply status filter if provided
    if (filters.status) {
      scanParams.FilterExpression = '#status = :status';
      scanParams.ExpressionAttributeNames = { '#status': 'status' };
      scanParams.ExpressionAttributeValues = { ':status': filters.status };
    }

    const result = await dynamoDB.scan(scanParams).promise();
    let events = result.Items || [];

    // Apply location filter if provided
    if (filters.location) {
      const locationFilter = filters.location.toLowerCase();
      events = events.filter(event => {
        const location = event.location || {};
        return (location.name || '').toLowerCase().includes(locationFilter) ||
               (location.address || '').toLowerCase().includes(locationFilter);
      });
    }

    // Sort events by start_time (chronological order)
    events.sort((a, b) => {
      const dateA = new Date(a.start_time || 0);
      const dateB = new Date(b.start_time || 0);
      return dateA - dateB;
    });

    // Convert Decimal objects to regular numbers
    events = convertDecimals(events);

    console.log(`Found ${events.length} events`);
    
    return {
      success: true,
      events: events,
      count: events.length,
      source: 'direct-dynamodb'
    };

  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/admin-events' && req.method === 'GET') {
    try {
      const filters = {
        status: parsedUrl.query.status,
        location: parsedUrl.query.location
      };

      const result = await getAllEvents(filters);
      
      res.writeHead(200);
      res.end(JSON.stringify(result));
      
    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({
      success: false,
      error: 'Not found'
    }));
  }
});

const PORT = 3001;

server.listen(PORT, () => {
  console.log(`Admin Events Server running on http://localhost:${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/admin-events`);
  console.log('Press Ctrl+C to stop');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Admin Events Server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});