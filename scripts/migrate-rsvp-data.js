#!/usr/bin/env node

/**
 * RSVP Data Migration Script
 * 
 * Specifically handles migration of RSVP data from the old event_rsvps table
 * to the new normalized structure with separate volunteers and rsvps tables.
 * 
 * Usage: node scripts/migrate-rsvp-data.js [--dry-run] [--environment staging|prod] [--verbose]
 */

require('dotenv').config();
const AWS = require('aws-sdk');

// Configuration
const REGION = process.env.AWS_REGION || 'us-east-1';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
}

// Table names with environment suffix
const suffix = environment === 'prod' ? '-production' : `-${environment}`;
const OLD_EVENT_RSVPS_TABLE = `event_rsvps`; // Old table has no suffix
const EVENTS_TABLE = `events${suffix}`;
const VOLUNTEERS_TABLE = `volunteers${suffix}`;
const RSVPS_TABLE = `event_rsvps${suffix}`;

console.log(`🔄 RSVP Data Migration Script`);
console.log(`Environment: ${environment}`);
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
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
 * Get all records from old RSVP table
 */
async function getOldRsvpRecords() {
  log('Scanning old RSVP records...', true);
  
  try {
    const params = { TableName: OLD_EVENT_RSVPS_TABLE };
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
    
    log(`✅ Total old RSVP records: ${allItems.length}`, true);
    return allItems;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      log(`⚠️  Old RSVP table ${OLD_EVENT_RSVPS_TABLE} not found`, true);
      return [];
    }
    throw error;
  }
}

/**
 * Get existing events to validate event IDs
 */
async function getExistingEvents() {
  log('Getting existing events for validation...', true);
  
  try {
    const params = { TableName: EVENTS_TABLE };
    const allItems = [];
    let lastEvaluatedKey = null;
    
    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const result = await dynamodb.scan(params).promise();
      allItems.push(...result.Items);
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    log(`✅ Found ${allItems.length} existing events`, true);
    return allItems;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      log(`⚠️  Events table ${EVENTS_TABLE} not found`, true);
      return [];
    }
    throw error;
  }
}

/**
 * Create event ID mapping for RSVP migration
 */
function createEventIdMapping(events, oldRsvps) {
  log('Creating event ID mapping...', true);
  
  const mapping = {};
  const eventIds = new Set(events.map(e => e.event_id));
  const rsvpEventIds = [...new Set(oldRsvps.map(r => r.event_id))];
  
  for (const rsvpEventId of rsvpEventIds) {
    // Check if event ID exists as-is
    if (eventIds.has(rsvpEventId)) {
      log(`  ✅ Direct match: ${rsvpEventId}`);
      continue; // No mapping needed
    }
    
    // Try to find by original filename in metadata
    const filenameMatch = events.find(event => 
      event.metadata?.original_filename === rsvpEventId
    );
    if (filenameMatch) {
      mapping[rsvpEventId] = filenameMatch.event_id;
      log(`  🔄 Filename match: ${rsvpEventId} -> ${filenameMatch.event_id}`);
      continue;
    }
    
    // Try fuzzy matching by title similarity
    const potentialMatches = events.filter(event => {
      const rsvpParts = rsvpEventId.split('-');
      const eventParts = event.event_id.split('-');
      
      // Count common parts
      const commonParts = rsvpParts.filter(part => eventParts.includes(part));
      return commonParts.length >= Math.min(rsvpParts.length, eventParts.length) * 0.6;
    });
    
    if (potentialMatches.length === 1) {
      mapping[rsvpEventId] = potentialMatches[0].event_id;
      log(`  🎯 Fuzzy match: ${rsvpEventId} -> ${potentialMatches[0].event_id}`);
    } else if (potentialMatches.length > 1) {
      // Use the best match based on similarity score
      let bestMatch = potentialMatches[0];
      let bestScore = 0;
      
      for (const match of potentialMatches) {
        const rsvpParts = rsvpEventId.split('-');
        const eventParts = match.event_id.split('-');
        const commonParts = rsvpParts.filter(part => eventParts.includes(part));
        const score = commonParts.length / Math.max(rsvpParts.length, eventParts.length);
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = match;
        }
      }
      
      mapping[rsvpEventId] = bestMatch.event_id;
      log(`  🎯 Best fuzzy match: ${rsvpEventId} -> ${bestMatch.event_id} (score: ${bestScore.toFixed(2)})`);
    } else {
      log(`  ❌ No match found for: ${rsvpEventId}`);
    }
  }
  
  log(`✅ Created ${Object.keys(mapping).length} event ID mappings`, true);
  return mapping;
}

/**
 * Extract volunteer data from old RSVP record
 */
function extractVolunteerData(rsvp) {
  return {
    email: rsvp.email,
    first_name: rsvp.first_name || '',
    last_name: rsvp.last_name || '',
    full_name: `${rsvp.first_name || ''} ${rsvp.last_name || ''}`.trim(),
    phone: rsvp.phone || null,
    emergency_contact: rsvp.emergency_contact || null,
    dietary_restrictions: rsvp.dietary_restrictions || null,
    volunteer_experience: rsvp.volunteer_experience || null,
    how_did_you_hear: rsvp.how_did_you_hear || null,
    created_at: rsvp.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    profile_complete: !!(rsvp.first_name && rsvp.last_name),
    communication_preferences: {
      email_notifications: true,
      sms_notifications: false
    },
    volunteer_metrics: {
      total_rsvps: 0,
      total_cancellations: 0,
      total_no_shows: 0,
      total_attended: 0,
      first_event_date: null,
      last_event_date: null
    }
  };
}

/**
 * Create normalized RSVP record
 */
function createNormalizedRsvp(oldRsvp, eventIdMapping) {
  const newEventId = eventIdMapping[oldRsvp.event_id] || oldRsvp.event_id;
  
  return {
    event_id: newEventId,
    email: oldRsvp.email,
    status: oldRsvp.status || 'active',
    created_at: oldRsvp.created_at || new Date().toISOString(),
    updated_at: oldRsvp.updated_at || oldRsvp.created_at || new Date().toISOString(),
    cancelled_at: oldRsvp.cancelled_at || null,
    hours_before_event: oldRsvp.hours_before_event || null,
    additional_comments: oldRsvp.additional_comments || null
  };
}

/**
 * Calculate volunteer metrics from RSVP history
 */
function calculateVolunteerMetrics(email, allRsvps) {
  const volunteerRsvps = allRsvps.filter(rsvp => rsvp.email === email);
  
  const metrics = {
    total_rsvps: volunteerRsvps.length,
    total_cancellations: volunteerRsvps.filter(r => r.status === 'cancelled').length,
    total_no_shows: volunteerRsvps.filter(r => r.status === 'no_show').length,
    total_attended: volunteerRsvps.filter(r => r.status === 'attended').length,
    first_event_date: null,
    last_event_date: null
  };
  
  // Calculate date range
  const dates = volunteerRsvps
    .map(r => r.created_at)
    .filter(date => date)
    .map(date => new Date(date))
    .sort((a, b) => a - b);
  
  if (dates.length > 0) {
    metrics.first_event_date = dates[0].toISOString();
    metrics.last_event_date = dates[dates.length - 1].toISOString();
  }
  
  return metrics;
}

/**
 * Process old RSVP records into volunteers and normalized RSVPs
 */
function processRsvpRecords(oldRsvps, eventIdMapping) {
  log('Processing RSVP records...', true);
  
  const volunteerMap = new Map();
  const normalizedRsvps = [];
  const skippedRsvps = [];
  
  for (const oldRsvp of oldRsvps) {
    // Skip RSVPs for events that couldn't be mapped
    const newEventId = eventIdMapping[oldRsvp.event_id] || oldRsvp.event_id;
    if (eventIdMapping[oldRsvp.event_id] === undefined && !eventIdMapping.hasOwnProperty(oldRsvp.event_id)) {
      // Only skip if we explicitly couldn't find a mapping
      const eventExists = Object.values(eventIdMapping).includes(oldRsvp.event_id);
      if (!eventExists) {
        skippedRsvps.push(oldRsvp);
        log(`  ⚠️  Skipping RSVP for unmapped event: ${oldRsvp.event_id} (${oldRsvp.email})`);
        continue;
      }
    }
    
    // Create or update volunteer record
    if (!volunteerMap.has(oldRsvp.email)) {
      volunteerMap.set(oldRsvp.email, extractVolunteerData(oldRsvp));
    } else {
      // Update volunteer with any additional information
      const existing = volunteerMap.get(oldRsvp.email);
      const updated = extractVolunteerData(oldRsvp);
      
      // Keep the most complete information
      if (!existing.first_name && updated.first_name) existing.first_name = updated.first_name;
      if (!existing.last_name && updated.last_name) existing.last_name = updated.last_name;
      if (!existing.phone && updated.phone) existing.phone = updated.phone;
      if (!existing.emergency_contact && updated.emergency_contact) existing.emergency_contact = updated.emergency_contact;
      
      // Update full name
      existing.full_name = `${existing.first_name} ${existing.last_name}`.trim();
      existing.profile_complete = !!(existing.first_name && existing.last_name);
      existing.updated_at = new Date().toISOString();
    }
    
    // Create normalized RSVP
    const normalizedRsvp = createNormalizedRsvp(oldRsvp, eventIdMapping);
    normalizedRsvps.push(normalizedRsvp);
  }
  
  // Calculate metrics for each volunteer
  const volunteers = Array.from(volunteerMap.values());
  for (const volunteer of volunteers) {
    volunteer.volunteer_metrics = calculateVolunteerMetrics(volunteer.email, normalizedRsvps);
  }
  
  log(`✅ Processed ${oldRsvps.length} old RSVPs into:`, true);
  log(`   - ${volunteers.length} volunteer records`, true);
  log(`   - ${normalizedRsvps.length} normalized RSVP records`, true);
  if (skippedRsvps.length > 0) {
    log(`   - ${skippedRsvps.length} RSVPs skipped (unmapped events)`, true);
  }
  
  return { volunteers, normalizedRsvps, skippedRsvps };
}

/**
 * Write volunteers to database
 */
async function writeVolunteers(volunteers) {
  log(`Writing ${volunteers.length} volunteers to database...`, true);
  
  let successCount = 0;
  let updateCount = 0;
  let errorCount = 0;
  
  for (const volunteer of volunteers) {
    if (isDryRun) {
      log(`  [DRY RUN] Would create/update volunteer: ${volunteer.email}`);
      successCount++;
      continue;
    }
    
    try {
      // Try to create new volunteer
      await dynamodb.put({
        TableName: VOLUNTEERS_TABLE,
        Item: volunteer,
        ConditionExpression: 'attribute_not_exists(email)'
      }).promise();
      
      log(`  ✅ Created volunteer: ${volunteer.email}`);
      successCount++;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        // Volunteer exists, update with merged data
        try {
          await dynamodb.put({
            TableName: VOLUNTEERS_TABLE,
            Item: volunteer
          }).promise();
          
          log(`  🔄 Updated volunteer: ${volunteer.email}`);
          updateCount++;
        } catch (updateError) {
          log(`  ❌ Failed to update volunteer ${volunteer.email}: ${updateError.message}`);
          errorCount++;
        }
      } else {
        log(`  ❌ Failed to create volunteer ${volunteer.email}: ${error.message}`);
        errorCount++;
      }
    }
  }
  
  return { successCount, updateCount, errorCount };
}

/**
 * Write RSVPs to database
 */
async function writeRsvps(rsvps) {
  log(`Writing ${rsvps.length} RSVPs to database...`, true);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const rsvp of rsvps) {
    if (isDryRun) {
      log(`  [DRY RUN] Would create RSVP: ${rsvp.event_id} - ${rsvp.email}`);
      successCount++;
      continue;
    }
    
    try {
      await dynamodb.put({
        TableName: RSVPS_TABLE,
        Item: rsvp,
        ConditionExpression: 'attribute_not_exists(event_id) AND attribute_not_exists(email)'
      }).promise();
      
      log(`  ✅ Created RSVP: ${rsvp.event_id} - ${rsvp.email}`);
      successCount++;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        log(`  ⚠️  RSVP already exists: ${rsvp.event_id} - ${rsvp.email}`);
      } else {
        log(`  ❌ Failed to create RSVP ${rsvp.event_id} - ${rsvp.email}: ${error.message}`);
        errorCount++;
      }
    }
  }
  
  return { successCount, errorCount };
}

/**
 * Main migration function
 */
async function runRsvpMigration() {
  try {
    console.log('🚀 Starting RSVP data migration...\n');
    
    // Step 1: Get old RSVP records
    const oldRsvps = await getOldRsvpRecords();
    if (oldRsvps.length === 0) {
      console.log('ℹ️  No old RSVP records found to migrate');
      return;
    }
    
    // Step 2: Get existing events for validation
    const events = await getExistingEvents();
    if (events.length === 0) {
      console.log('⚠️  No events found in database. Run event migration first.');
      return;
    }
    
    // Step 3: Create event ID mapping
    const eventIdMapping = createEventIdMapping(events, oldRsvps);
    
    // Step 4: Process RSVP records
    const { volunteers, normalizedRsvps, skippedRsvps } = processRsvpRecords(oldRsvps, eventIdMapping);
    
    // Step 5: Write to database
    console.log('\n💾 Writing to database...');
    
    const volunteerResults = await writeVolunteers(volunteers);
    console.log(`Volunteers: ${volunteerResults.successCount} created, ${volunteerResults.updateCount} updated, ${volunteerResults.errorCount} errors`);
    
    const rsvpResults = await writeRsvps(normalizedRsvps);
    console.log(`RSVPs: ${rsvpResults.successCount} created, ${rsvpResults.errorCount} errors`);
    
    // Summary
    console.log('\n📊 Migration Summary:');
    console.log(`   Old RSVP records processed: ${oldRsvps.length}`);
    console.log(`   Volunteers created/updated: ${volunteerResults.successCount + volunteerResults.updateCount}`);
    console.log(`   RSVPs migrated: ${rsvpResults.successCount}`);
    if (skippedRsvps.length > 0) {
      console.log(`   RSVPs skipped (unmapped events): ${skippedRsvps.length}`);
    }
    
    console.log('\n✅ RSVP migration completed successfully!');
    
    if (isDryRun) {
      console.log('\n🚀 To apply these changes, run:');
      console.log(`   node scripts/migrate-rsvp-data.js --environment=${environment}`);
    }
    
  } catch (error) {
    console.error('❌ RSVP migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
runRsvpMigration();