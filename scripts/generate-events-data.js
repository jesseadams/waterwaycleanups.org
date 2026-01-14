#!/usr/bin/env node

/**
 * Generate Events Data for Admin Interface
 * Creates a static JSON file with all events for the admin interface
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

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

async function generateEventsData() {
  try {
    console.log('Fetching all events from DynamoDB...');
    
    const scanParams = {
      TableName: eventsTableName
    };

    const result = await dynamoDB.scan(scanParams).promise();
    let events = result.Items || [];

    // Sort events by start_time (chronological order)
    events.sort((a, b) => {
      const dateA = new Date(a.start_time || 0);
      const dateB = new Date(b.start_time || 0);
      return dateA - dateB;
    });

    // Convert Decimal objects to regular numbers
    events = convertDecimals(events);

    const eventsData = {
      success: true,
      events: events,
      count: events.length,
      generated_at: new Date().toISOString(),
      source: 'static-generation'
    };

    // Ensure the static/data directory exists
    const dataDir = path.join(process.cwd(), 'static', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Write the events data to a JSON file
    const outputPath = path.join(dataDir, 'admin-events.json');
    fs.writeFileSync(outputPath, JSON.stringify(eventsData, null, 2));

    console.log(`✅ Generated events data: ${outputPath}`);
    console.log(`📊 Total events: ${events.length}`);
    console.log(`🕒 Generated at: ${eventsData.generated_at}`);

    return eventsData;

  } catch (error) {
    console.error('❌ Error generating events data:', error);
    
    // Create a fallback file with error info
    const errorData = {
      success: false,
      error: error.message,
      events: [],
      count: 0,
      generated_at: new Date().toISOString(),
      source: 'static-generation-error'
    };

    const dataDir = path.join(process.cwd(), 'static', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const outputPath = path.join(dataDir, 'admin-events.json');
    fs.writeFileSync(outputPath, JSON.stringify(errorData, null, 2));

    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  generateEventsData()
    .then(() => {
      console.log('✅ Events data generation complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Events data generation failed:', error.message);
      process.exit(1);
    });
}

module.exports = { generateEventsData };