#!/usr/bin/env node

/**
 * Admin RSVP Manager
 * 
 * This script provides admin functions for managing RSVPs, including:
 * - Listing RSVPs for an event
 * - Marking no-shows
 * - Viewing volunteer metrics
 * 
 * Usage: node scripts/admin-rsvp-manager.js [command] [options]
 */

const AWS = require('aws-sdk');
const readline = require('readline');

// Configuration
const REGION = 'us-east-1';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
}

const TABLE_NAME = `event_rsvps-${environment}`;

console.log(`🔧 Admin RSVP Manager`);
console.log(`Environment: ${environment}`);
console.log(`Table: ${TABLE_NAME}`);
console.log('');

// Configure AWS
AWS.config.update({ region: REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Create readline interface for user input
 */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompt user for input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's response
 */
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * List all RSVPs for an event
 * @param {string} eventId - The event ID
 * @returns {Promise<Array>} Array of RSVP records
 */
async function listEventRsvps(eventId) {
  console.log(`📊 Listing RSVPs for event: ${eventId}`);
  
  try {
    const result = await dynamodb.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'event_id = :event_id',
      ExpressionAttributeValues: {
        ':event_id': eventId
      }
    }).promise();
    
    const rsvps = result.Items || [];
    console.log(`✅ Found ${rsvps.length} RSVP records`);
    
    if (rsvps.length > 0) {
      console.log('\n📋 RSVP Details:');
      rsvps.forEach((rsvp, index) => {
        const name = `${rsvp.first_name || ''} ${rsvp.last_name || ''}`.trim();
        const status = rsvp.status || 'active';
        const noShow = rsvp.no_show ? ' [NO-SHOW]' : '';
        const cancelled = status === 'cancelled' ? ' [CANCELLED]' : '';
        const date = rsvp.created_at ? new Date(rsvp.created_at).toLocaleDateString() : 'Unknown date';
        
        console.log(`   ${index + 1}. ${name} (${rsvp.email}) - ${date}${cancelled}${noShow}`);
        
        if (rsvp.cancellation_count > 0) {
          console.log(`      └─ Cancellations: ${rsvp.cancellation_count}`);
        }
        if (rsvp.no_show_count > 0) {
          console.log(`      └─ No-shows: ${rsvp.no_show_count}`);
        }
      });
    }
    
    return rsvps;
  } catch (error) {
    console.error('❌ Error querying DynamoDB:', error.message);
    throw error;
  }
}

/**
 * Mark an RSVP as no-show
 * @param {string} eventId - The event ID
 * @param {string} email - The volunteer's email
 * @param {boolean} noShow - Whether to mark as no-show
 * @returns {Promise<boolean>} Success status
 */
async function markNoShow(eventId, email, noShow = true) {
  try {
    const now = new Date().toISOString();
    
    // Get current record
    const getResult = await dynamodb.get({
      TableName: TABLE_NAME,
      Key: {
        event_id: eventId,
        email: email
      }
    }).promise();
    
    if (!getResult.Item) {
      console.error(`❌ RSVP not found for ${email}`);
      return false;
    }
    
    const currentRecord = getResult.Item;
    
    // Don't mark cancelled RSVPs as no-shows
    if (currentRecord.status === 'cancelled') {
      console.error(`❌ Cannot mark cancelled RSVP as no-show`);
      return false;
    }
    
    // Calculate new no-show count
    const currentNoShowCount = currentRecord.no_show_count || 0;
    const newNoShowCount = noShow ? currentNoShowCount + 1 : currentNoShowCount;
    
    // Update the record
    const updateParams = {
      TableName: TABLE_NAME,
      Key: {
        event_id: eventId,
        email: email
      },
      UpdateExpression: 'SET no_show = :no_show, updated_at = :updated_at',
      ExpressionAttributeValues: {
        ':no_show': noShow,
        ':updated_at': now
      }
    };
    
    if (noShow) {
      updateParams.UpdateExpression += ', no_show_count = :no_show_count, no_show_marked_at = :marked_at';
      updateParams.ExpressionAttributeValues[':no_show_count'] = newNoShowCount;
      updateParams.ExpressionAttributeValues[':marked_at'] = now;
    }
    
    await dynamodb.update(updateParams).promise();
    
    const action = noShow ? 'marked as no-show' : 'no-show status removed';
    console.log(`✅ ${email} ${action} for event ${eventId}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Error updating no-show status:`, error.message);
    return false;
  }
}

/**
 * Get volunteer metrics
 * @param {string} email - The volunteer's email (optional)
 * @returns {Promise<Object>} Volunteer metrics
 */
async function getVolunteerMetrics(email = null) {
  try {
    let scanParams = {
      TableName: TABLE_NAME
    };
    
    if (email) {
      // Query specific volunteer using GSI
      scanParams = {
        TableName: TABLE_NAME,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email
        }
      };
      
      const result = await dynamodb.query(scanParams).promise();
      const rsvps = result.Items || [];
      
      return calculateMetricsForVolunteer(email, rsvps);
    } else {
      // Scan all records for overall metrics
      const result = await dynamodb.scan(scanParams).promise();
      const allRsvps = result.Items || [];
      
      return calculateOverallMetrics(allRsvps);
    }
  } catch (error) {
    console.error('❌ Error getting volunteer metrics:', error.message);
    throw error;
  }
}

/**
 * Calculate metrics for a specific volunteer
 * @param {string} email - Volunteer email
 * @param {Array} rsvps - Array of RSVP records
 * @returns {Object} Volunteer metrics
 */
function calculateMetricsForVolunteer(email, rsvps) {
  const totalRsvps = rsvps.length;
  const totalCancellations = rsvps.reduce((sum, rsvp) => sum + (rsvp.cancellation_count || 0), 0);
  const totalNoShows = rsvps.reduce((sum, rsvp) => sum + (rsvp.no_show_count || 0), 0);
  
  // Calculate average cancellation hours
  const cancellationsWithHours = rsvps.filter(rsvp => rsvp.hours_before_event !== undefined);
  const avgCancellationHours = cancellationsWithHours.length > 0 
    ? cancellationsWithHours.reduce((sum, rsvp) => sum + rsvp.hours_before_event, 0) / cancellationsWithHours.length
    : 0;
  
  // Calculate reliability score (0-100)
  const reliabilityScore = totalRsvps > 0 
    ? Math.max(0, 100 - ((totalCancellations + totalNoShows * 2) / totalRsvps * 100))
    : 100;
  
  return {
    email,
    total_rsvps: totalRsvps,
    total_cancellations: totalCancellations,
    total_no_shows: totalNoShows,
    average_cancellation_hours: Math.round(avgCancellationHours * 10) / 10,
    reliability_score: Math.round(reliabilityScore * 10) / 10
  };
}

/**
 * Calculate overall metrics across all volunteers
 * @param {Array} allRsvps - Array of all RSVP records
 * @returns {Object} Overall metrics
 */
function calculateOverallMetrics(allRsvps) {
  const totalRsvps = allRsvps.length;
  const totalCancellations = allRsvps.reduce((sum, rsvp) => sum + (rsvp.cancellation_count || 0), 0);
  const totalNoShows = allRsvps.reduce((sum, rsvp) => sum + (rsvp.no_show_count || 0), 0);
  
  // Group by volunteer
  const volunteerGroups = {};
  allRsvps.forEach(rsvp => {
    if (!volunteerGroups[rsvp.email]) {
      volunteerGroups[rsvp.email] = [];
    }
    volunteerGroups[rsvp.email].push(rsvp);
  });
  
  const uniqueVolunteers = Object.keys(volunteerGroups).length;
  
  return {
    total_rsvps: totalRsvps,
    unique_volunteers: uniqueVolunteers,
    total_cancellations: totalCancellations,
    total_no_shows: totalNoShows,
    cancellation_rate: totalRsvps > 0 ? Math.round((totalCancellations / totalRsvps) * 100 * 10) / 10 : 0,
    no_show_rate: totalRsvps > 0 ? Math.round((totalNoShows / totalRsvps) * 100 * 10) / 10 : 0
  };
}

/**
 * Interactive mode for managing RSVPs
 */
async function interactiveMode() {
  console.log('🎯 Interactive RSVP Management Mode');
  console.log('Available commands:');
  console.log('  1. List RSVPs for an event');
  console.log('  2. Mark no-show');
  console.log('  3. View volunteer metrics');
  console.log('  4. View overall metrics');
  console.log('  5. Exit');
  console.log('');
  
  while (true) {
    const choice = await askQuestion('Enter your choice (1-5): ');
    
    switch (choice) {
      case '1':
        const eventId = await askQuestion('Enter event ID: ');
        await listEventRsvps(eventId);
        break;
        
      case '2':
        const eventIdForNoShow = await askQuestion('Enter event ID: ');
        const emailForNoShow = await askQuestion('Enter volunteer email: ');
        const markAsNoShow = await askQuestion('Mark as no-show? (y/N): ');
        await markNoShow(eventIdForNoShow, emailForNoShow, markAsNoShow.toLowerCase() === 'y');
        break;
        
      case '3':
        const emailForMetrics = await askQuestion('Enter volunteer email (or press Enter for all): ');
        const metrics = await getVolunteerMetrics(emailForMetrics || null);
        console.log('\n📊 Volunteer Metrics:');
        console.log(JSON.stringify(metrics, null, 2));
        break;
        
      case '4':
        const overallMetrics = await getVolunteerMetrics();
        console.log('\n📊 Overall Metrics:');
        console.log(JSON.stringify(overallMetrics, null, 2));
        break;
        
      case '5':
        console.log('👋 Goodbye!');
        rl.close();
        return;
        
      default:
        console.log('❌ Invalid choice. Please enter 1-5.');
    }
    
    console.log('');
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    if (!command) {
      await interactiveMode();
      return;
    }
    
    switch (command) {
      case 'list':
        const eventId = args[1];
        if (!eventId) {
          console.error('❌ Event ID required. Usage: node admin-rsvp-manager.js list <event-id>');
          process.exit(1);
        }
        await listEventRsvps(eventId);
        break;
        
      case 'noshow':
        const eventIdForNoShow = args[1];
        const emailForNoShow = args[2];
        if (!eventIdForNoShow || !emailForNoShow) {
          console.error('❌ Event ID and email required. Usage: node admin-rsvp-manager.js noshow <event-id> <email>');
          process.exit(1);
        }
        await markNoShow(eventIdForNoShow, emailForNoShow, true);
        break;
        
      case 'metrics':
        const emailForMetrics = args[1];
        const metrics = await getVolunteerMetrics(emailForMetrics);
        console.log(JSON.stringify(metrics, null, 2));
        break;
        
      case 'interactive':
        await interactiveMode();
        break;
        
      default:
        console.log('❌ Unknown command. Available commands:');
        console.log('  list <event-id>           - List RSVPs for an event');
        console.log('  noshow <event-id> <email> - Mark volunteer as no-show');
        console.log('  metrics [email]           - View volunteer metrics');
        console.log('  interactive               - Interactive mode');
        process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the script
main();