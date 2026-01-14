#!/usr/bin/env node

/**
 * Fix Volunteer Metrics Script
 * 
 * This script recalculates volunteer metrics from RSVP data to fix
 * any inconsistencies found during validation.
 */

const AWS = require('aws-sdk');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const environment = args.find(arg => arg.startsWith('--environment='))?.split('=')[1] || 'staging';
const isVerbose = args.includes('--verbose');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Table names
const VOLUNTEERS_TABLE = `volunteers-${environment}`;
const RSVPS_TABLE = `rsvps-${environment}`;

function log(message, force = false) {
  if (isVerbose || force) {
    console.log(message);
  }
}

async function recalculateVolunteerMetrics(email) {
  try {
    log(`Recalculating metrics for volunteer: ${email}`);
    
    // Query all RSVPs for this volunteer
    const rsvpParams = {
      TableName: RSVPS_TABLE,
      IndexName: 'email-created_at-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    };
    
    const rsvpResponse = await dynamodb.query(rsvpParams).promise();
    const rsvps = rsvpResponse.Items || [];
    
    log(`  Found ${rsvps.length} RSVPs for ${email}`);
    
    // Calculate metrics
    let totalRsvps = 0;
    let totalCancellations = 0;
    let totalNoShows = 0;
    let totalAttended = 0;
    let firstEventDate = null;
    let lastEventDate = null;
    
    for (const rsvp of rsvps) {
      totalRsvps++;
      
      if (rsvp.status === 'cancelled') {
        totalCancellations++;
      }
      
      if (rsvp.no_show === true) {
        totalNoShows++;
      }
      
      // For attended, we assume active RSVPs that are not no-shows are attended
      if (rsvp.status === 'active' && !rsvp.no_show) {
        totalAttended++;
      }
      
      // Track date range
      const createdAt = rsvp.created_at;
      if (createdAt) {
        if (!firstEventDate || createdAt < firstEventDate) {
          firstEventDate = createdAt;
        }
        if (!lastEventDate || createdAt > lastEventDate) {
          lastEventDate = createdAt;
        }
      }
    }
    
    log(`  Calculated metrics:`);
    log(`    Total RSVPs: ${totalRsvps}`);
    log(`    Total Cancellations: ${totalCancellations}`);
    log(`    Total No-Shows: ${totalNoShows}`);
    log(`    Total Attended: ${totalAttended}`);
    log(`    First Event Date: ${firstEventDate}`);
    log(`    Last Event Date: ${lastEventDate}`);
    
    if (!isDryRun) {
      // Update volunteer metrics
      let updateExpression = `
        SET volunteer_metrics.total_rsvps = :total_rsvps,
            volunteer_metrics.total_cancellations = :total_cancellations,
            volunteer_metrics.total_no_shows = :total_no_shows,
            volunteer_metrics.total_attended = :total_attended,
            updated_at = :updated_at
      `;
      
      const expressionValues = {
        ':total_rsvps': totalRsvps,
        ':total_cancellations': totalCancellations,
        ':total_no_shows': totalNoShows,
        ':total_attended': totalAttended,
        ':updated_at': new Date().toISOString()
      };
      
      if (firstEventDate) {
        updateExpression += ', volunteer_metrics.first_event_date = :first_event_date';
        expressionValues[':first_event_date'] = firstEventDate;
      }
      
      if (lastEventDate) {
        updateExpression += ', volunteer_metrics.last_event_date = :last_event_date';
        expressionValues[':last_event_date'] = lastEventDate;
      }
      
      const updateParams = {
        TableName: VOLUNTEERS_TABLE,
        Key: { email: email },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues
      };
      
      await dynamodb.update(updateParams).promise();
      log(`  ✅ Updated metrics for ${email}`);
    } else {
      log(`  🔍 DRY RUN: Would update metrics for ${email}`);
    }
    
    return {
      email,
      totalRsvps,
      totalCancellations,
      totalNoShows,
      totalAttended,
      firstEventDate,
      lastEventDate
    };
    
  } catch (error) {
    console.error(`❌ Error recalculating metrics for ${email}:`, error.message);
    throw error;
  }
}

async function getAllVolunteers() {
  try {
    const params = {
      TableName: VOLUNTEERS_TABLE
    };
    
    const result = await dynamodb.scan(params).promise();
    return result.Items || [];
    
  } catch (error) {
    console.error('❌ Error getting volunteers:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🔧 Fix Volunteer Metrics Script');
  console.log(`Environment: ${environment.toUpperCase()}`);
  console.log(`Dry Run: ${isDryRun ? 'YES' : 'NO'}`);
  console.log(`Verbose: ${isVerbose ? 'ON' : 'OFF'}`);
  console.log('');
  
  try {
    // Get all volunteers
    log('📋 Getting all volunteers...', true);
    const volunteers = await getAllVolunteers();
    log(`Found ${volunteers.length} volunteers`, true);
    
    if (volunteers.length === 0) {
      console.log('No volunteers found. Nothing to fix.');
      return;
    }
    
    // Fix metrics for each volunteer
    const results = [];
    for (const volunteer of volunteers) {
      const result = await recalculateVolunteerMetrics(volunteer.email);
      results.push(result);
    }
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`Processed ${results.length} volunteers`);
    
    if (!isDryRun) {
      console.log('✅ All volunteer metrics have been recalculated');
    } else {
      console.log('🔍 Dry run completed - no changes made');
    }
    
    // Show details for each volunteer
    if (isVerbose) {
      console.log('\n📋 Detailed Results:');
      for (const result of results) {
        console.log(`${result.email}:`);
        console.log(`  RSVPs: ${result.totalRsvps}, Cancellations: ${result.totalCancellations}`);
        console.log(`  No-shows: ${result.totalNoShows}, Attended: ${result.totalAttended}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Fix Volunteer Metrics Script

Usage: node scripts/fix-volunteer-metrics.js [options]

Options:
  --environment=<env>    Environment (staging|prod) [default: staging]
  --dry-run             Preview changes without applying them
  --verbose             Show detailed output
  --help, -h            Show this help message

Examples:
  node scripts/fix-volunteer-metrics.js --dry-run
  node scripts/fix-volunteer-metrics.js --environment=staging
  node scripts/fix-volunteer-metrics.js --environment=prod --verbose
`);
  process.exit(0);
}

main();