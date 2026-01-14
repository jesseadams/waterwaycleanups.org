#!/usr/bin/env node

/**
 * Migration Validation Script
 * 
 * Validates data integrity after migration to ensure all data was
 * properly migrated and relationships are intact.
 * 
 * Usage: node scripts/validate-migration.js [--environment staging|prod] [--verbose]
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configuration
const REGION = process.env.AWS_REGION || 'us-east-1';

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
}

// Table names with environment suffix
const suffix = environment === 'prod' ? '' : `-${environment}`;
const EVENTS_TABLE = `events${suffix}`;
const VOLUNTEERS_TABLE = `volunteers${suffix}`;
const RSVPS_TABLE = `rsvps${suffix}`;

console.log(`🔍 Migration Validation Script`);
console.log(`Environment: ${environment}`);
console.log(`Verbose: ${isVerbose ? 'ON' : 'OFF'}`);
console.log('');

// Configure AWS - will use default credential chain (profile, IAM role, env vars)
AWS.config.update({ 
  region: REGION,
  // Let AWS SDK handle credential discovery automatically
});
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Logging utility
 */
function log(message, force = false) {
  if (isVerbose || force) {
    console.log(message);
  }
}

/**
 * Get all records from a table
 */
async function getAllRecords(tableName, description) {
  log(`Scanning ${description}...`);
  
  try {
    const params = { TableName: tableName };
    const allItems = [];
    let lastEvaluatedKey = null;
    
    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const result = await dynamodb.scan(params).promise();
      allItems.push(...result.Items);
      lastEvaluatedKey = result.LastEvaluatedKey;
      
      log(`  Found ${result.Items.length} records (total: ${allItems.length})`);
    } while (lastEvaluatedKey);
    
    log(`✅ Total ${description}: ${allItems.length}`);
    return allItems;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      log(`⚠️  Table ${tableName} not found`);
      return [];
    }
    throw error;
  }
}

/**
 * Validate event records
 */
function validateEvents(events) {
  log('Validating event records...', true);
  
  const issues = [];
  const duplicates = new Map();
  
  for (const event of events) {
    // Check required fields
    if (!event.event_id) {
      issues.push(`Event missing event_id: ${JSON.stringify(event)}`);
      continue;
    }
    
    if (!event.title) {
      issues.push(`Event ${event.event_id} missing title`);
    }
    
    if (!event.start_time) {
      issues.push(`Event ${event.event_id} missing start_time`);
    }
    
    if (!event.status) {
      issues.push(`Event ${event.event_id} missing status`);
    } else if (!['active', 'cancelled', 'completed', 'archived'].includes(event.status)) {
      issues.push(`Event ${event.event_id} has invalid status: ${event.status}`);
    }
    
    // Check for duplicates
    if (duplicates.has(event.event_id)) {
      issues.push(`Duplicate event_id: ${event.event_id}`);
    } else {
      duplicates.set(event.event_id, true);
    }
    
    // Validate date format
    if (event.start_time) {
      try {
        new Date(event.start_time);
      } catch (error) {
        issues.push(`Event ${event.event_id} has invalid start_time format: ${event.start_time}`);
      }
    }
    
    // Validate location structure
    if (event.location && typeof event.location !== 'object') {
      issues.push(`Event ${event.event_id} has invalid location structure`);
    }
    
    // Validate hugo_config structure
    if (event.hugo_config && typeof event.hugo_config !== 'object') {
      issues.push(`Event ${event.event_id} has invalid hugo_config structure`);
    }
  }
  
  return issues;
}

/**
 * Validate volunteer records
 */
function validateVolunteers(volunteers) {
  log('Validating volunteer records...', true);
  
  const issues = [];
  const duplicates = new Map();
  
  for (const volunteer of volunteers) {
    // Check required fields
    if (!volunteer.email) {
      issues.push(`Volunteer missing email: ${JSON.stringify(volunteer)}`);
      continue;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(volunteer.email)) {
      issues.push(`Volunteer has invalid email format: ${volunteer.email}`);
    }
    
    // Check for duplicates
    if (duplicates.has(volunteer.email)) {
      issues.push(`Duplicate volunteer email: ${volunteer.email}`);
    } else {
      duplicates.set(volunteer.email, true);
    }
    
    // Validate communication_preferences structure
    if (volunteer.communication_preferences && typeof volunteer.communication_preferences !== 'object') {
      issues.push(`Volunteer ${volunteer.email} has invalid communication_preferences structure`);
    }
    
    // Validate volunteer_metrics structure
    if (volunteer.volunteer_metrics && typeof volunteer.volunteer_metrics !== 'object') {
      issues.push(`Volunteer ${volunteer.email} has invalid volunteer_metrics structure`);
    }
  }
  
  return issues;
}

/**
 * Validate RSVP records
 */
function validateRsvps(rsvps, events, volunteers) {
  log('Validating RSVP records...', true);
  
  const issues = [];
  const duplicates = new Map();
  const eventIds = new Set(events.map(e => e.event_id));
  const volunteerEmails = new Set(volunteers.map(v => v.email));
  
  for (const rsvp of rsvps) {
    // Check required fields
    if (!rsvp.event_id) {
      issues.push(`RSVP missing event_id: ${JSON.stringify(rsvp)}`);
      continue;
    }
    
    if (!rsvp.email) {
      issues.push(`RSVP missing email: ${JSON.stringify(rsvp)}`);
      continue;
    }
    
    // Check for duplicates
    const rsvpKey = `${rsvp.event_id}:${rsvp.email}`;
    if (duplicates.has(rsvpKey)) {
      issues.push(`Duplicate RSVP: ${rsvpKey}`);
    } else {
      duplicates.set(rsvpKey, true);
    }
    
    // Validate status
    if (!rsvp.status) {
      issues.push(`RSVP ${rsvpKey} missing status`);
    } else if (!['active', 'cancelled', 'no_show', 'attended'].includes(rsvp.status)) {
      issues.push(`RSVP ${rsvpKey} has invalid status: ${rsvp.status}`);
    }
    
    // Validate foreign key relationships
    if (!eventIds.has(rsvp.event_id)) {
      issues.push(`RSVP ${rsvpKey} references non-existent event: ${rsvp.event_id}`);
    }
    
    if (!volunteerEmails.has(rsvp.email)) {
      issues.push(`RSVP ${rsvpKey} references non-existent volunteer: ${rsvp.email}`);
    }
    
    // Validate date formats
    if (rsvp.created_at) {
      try {
        new Date(rsvp.created_at);
      } catch (error) {
        issues.push(`RSVP ${rsvpKey} has invalid created_at format: ${rsvp.created_at}`);
      }
    }
  }
  
  return issues;
}

/**
 * Validate data relationships and business logic
 */
function validateBusinessLogic(events, volunteers, rsvps) {
  log('Validating business logic...', true);
  
  const issues = [];
  
  // Check that events with RSVPs have reasonable data
  const eventRsvpCounts = new Map();
  for (const rsvp of rsvps) {
    if (rsvp.status === 'active') {
      eventRsvpCounts.set(rsvp.event_id, (eventRsvpCounts.get(rsvp.event_id) || 0) + 1);
    }
  }
  
  for (const event of events) {
    const rsvpCount = eventRsvpCounts.get(event.event_id) || 0;
    
    // Check if RSVP count exceeds attendance cap
    if (event.attendance_cap && rsvpCount > event.attendance_cap) {
      issues.push(`Event ${event.event_id} has ${rsvpCount} RSVPs but cap is ${event.attendance_cap}`);
    }
    
    // Check for events with very high RSVP counts (potential data issue)
    if (rsvpCount > 100) {
      issues.push(`Event ${event.event_id} has unusually high RSVP count: ${rsvpCount}`);
    }
  }
  
  // Check volunteer metrics consistency
  for (const volunteer of volunteers) {
    if (volunteer.volunteer_metrics) {
      const metrics = volunteer.volunteer_metrics;
      const volunteerRsvps = rsvps.filter(r => r.email === volunteer.email);
      
      // Check if total_rsvps matches actual RSVP count
      if (metrics.total_rsvps !== volunteerRsvps.length) {
        issues.push(`Volunteer ${volunteer.email} metrics show ${metrics.total_rsvps} RSVPs but has ${volunteerRsvps.length}`);
      }
      
      // Check status counts
      const statusCounts = {
        active: volunteerRsvps.filter(r => r.status === 'active').length,
        cancelled: volunteerRsvps.filter(r => r.status === 'cancelled').length,
        no_show: volunteerRsvps.filter(r => r.status === 'no_show').length,
        attended: volunteerRsvps.filter(r => r.status === 'attended').length
      };
      
      if (metrics.total_cancellations !== statusCounts.cancelled) {
        issues.push(`Volunteer ${volunteer.email} cancellation count mismatch: ${metrics.total_cancellations} vs ${statusCounts.cancelled}`);
      }
    }
  }
  
  return issues;
}

/**
 * Compare with original markdown files
 */
function validateAgainstOriginalFiles(events) {
  log('Validating against original markdown files...', true);
  
  const issues = [];
  const eventsDir = path.join(__dirname, '..', 'content', 'en', 'events');
  
  if (!fs.existsSync(eventsDir)) {
    issues.push('Original events directory not found');
    return issues;
  }
  
  const markdownFiles = fs.readdirSync(eventsDir)
    .filter(file => file.endsWith('.md'))
    .map(file => path.basename(file, '.md'));
  
  // Check that all markdown files have corresponding events
  for (const filename of markdownFiles) {
    const hasEvent = events.some(event => 
      event.event_id === filename || 
      event.metadata?.original_filename === filename
    );
    
    if (!hasEvent) {
      issues.push(`Markdown file ${filename}.md has no corresponding event record`);
    }
  }
  
  // Check that all events have source files (unless they're new)
  for (const event of events) {
    if (event.metadata?.migrated_from === 'markdown') {
      const originalFilename = event.metadata.original_filename;
      if (!markdownFiles.includes(originalFilename)) {
        issues.push(`Event ${event.event_id} claims to be from ${originalFilename}.md but file not found`);
      }
    }
  }
  
  return issues;
}

/**
 * Generate validation report
 */
function generateReport(events, volunteers, rsvps, allIssues) {
  console.log('\n📊 Migration Validation Report');
  console.log('================================\n');
  
  // Summary statistics
  console.log('📈 Data Summary:');
  console.log(`   Events: ${events.length}`);
  console.log(`   Volunteers: ${volunteers.length}`);
  console.log(`   RSVPs: ${rsvps.length}`);
  console.log('');
  
  // Event status breakdown
  const eventStatusCounts = {};
  events.forEach(event => {
    eventStatusCounts[event.status] = (eventStatusCounts[event.status] || 0) + 1;
  });
  
  console.log('📅 Event Status Breakdown:');
  Object.entries(eventStatusCounts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });
  console.log('');
  
  // RSVP status breakdown
  const rsvpStatusCounts = {};
  rsvps.forEach(rsvp => {
    rsvpStatusCounts[rsvp.status] = (rsvpStatusCounts[rsvp.status] || 0) + 1;
  });
  
  console.log('📝 RSVP Status Breakdown:');
  Object.entries(rsvpStatusCounts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });
  console.log('');
  
  // Top events by RSVP count
  const eventRsvpCounts = new Map();
  rsvps.forEach(rsvp => {
    eventRsvpCounts.set(rsvp.event_id, (eventRsvpCounts.get(rsvp.event_id) || 0) + 1);
  });
  
  const topEvents = Array.from(eventRsvpCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  console.log('🏆 Top Events by RSVP Count:');
  topEvents.forEach(([eventId, count]) => {
    const event = events.find(e => e.event_id === eventId);
    const title = event ? event.title : 'Unknown';
    console.log(`   ${eventId}: ${count} RSVPs (${title})`);
  });
  console.log('');
  
  // Validation results
  if (allIssues.length === 0) {
    console.log('✅ Validation Results: PASSED');
    console.log('   No data integrity issues found!');
  } else {
    console.log('❌ Validation Results: FAILED');
    console.log(`   Found ${allIssues.length} issues:`);
    
    // Group issues by category
    const issueCategories = {
      'Event Issues': allIssues.filter(issue => issue.includes('Event')),
      'Volunteer Issues': allIssues.filter(issue => issue.includes('Volunteer')),
      'RSVP Issues': allIssues.filter(issue => issue.includes('RSVP')),
      'Business Logic Issues': allIssues.filter(issue => 
        issue.includes('exceeds') || issue.includes('metrics') || issue.includes('count')
      ),
      'File Issues': allIssues.filter(issue => issue.includes('file') || issue.includes('Markdown')),
      'Other Issues': allIssues.filter(issue => 
        !issue.includes('Event') && !issue.includes('Volunteer') && 
        !issue.includes('RSVP') && !issue.includes('file') && 
        !issue.includes('Markdown') && !issue.includes('exceeds') && 
        !issue.includes('metrics') && !issue.includes('count')
      )
    };
    
    Object.entries(issueCategories).forEach(([category, issues]) => {
      if (issues.length > 0) {
        console.log(`\n   ${category}:`);
        issues.forEach(issue => console.log(`     - ${issue}`));
      }
    });
  }
  
  console.log('');
}

/**
 * Main validation function
 */
async function runValidation() {
  try {
    console.log('🚀 Starting migration validation...\n');
    
    // Get all data from tables
    const events = await getAllRecords(EVENTS_TABLE, 'events');
    const volunteers = await getAllRecords(VOLUNTEERS_TABLE, 'volunteers');
    const rsvps = await getAllRecords(RSVPS_TABLE, 'RSVPs');
    
    console.log('');
    
    // Run all validations
    const allIssues = [];
    
    allIssues.push(...validateEvents(events));
    allIssues.push(...validateVolunteers(volunteers));
    allIssues.push(...validateRsvps(rsvps, events, volunteers));
    allIssues.push(...validateBusinessLogic(events, volunteers, rsvps));
    allIssues.push(...validateAgainstOriginalFiles(events));
    
    // Generate report
    generateReport(events, volunteers, rsvps, allIssues);
    
    // Exit with appropriate code
    if (allIssues.length === 0) {
      console.log('🎉 Migration validation completed successfully!');
      process.exit(0);
    } else {
      console.log('⚠️  Migration validation found issues that should be addressed.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run validation
runValidation();