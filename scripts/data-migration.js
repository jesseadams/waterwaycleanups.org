#!/usr/bin/env node

/**
 * Data Migration Script for Database-Driven Events System
 * 
 * This script migrates existing event markdown files and RSVP data
 * to the new normalized database structure.
 * 
 * Usage: node scripts/data-migration.js [--dry-run] [--environment staging|prod] [--verbose]
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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
const suffix = environment === 'prod' ? '' : `-${environment}`;
const EVENTS_TABLE = `events${suffix}`;
const VOLUNTEERS_TABLE = `volunteers${suffix}`;
const RSVPS_TABLE = `rsvps${suffix}`;
const OLD_EVENT_RSVPS_TABLE = `event_rsvps${suffix}`;

console.log(`🔄 Data Migration Script`);
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
 * Convert a title to a Hugo-style slug (event_id)
 */
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
}

/**
 * Parse Hugo markdown file and extract frontmatter and content
 */
function parseMarkdownFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontMatterMatch) {
      throw new Error('No frontmatter found');
    }
    
    const frontMatter = yaml.load(frontMatterMatch[1]);
    const markdownContent = frontMatterMatch[2];
    
    return { frontMatter, content: markdownContent };
  } catch (error) {
    console.error(`Error parsing ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Extract location information from markdown content
 */
function extractLocationFromContent(content) {
  // Look for location section in tabs
  const locationMatch = content.match(/## Location\s*\n\n([\s\S]*?)(?=\n---|\n##|$)/);
  if (locationMatch) {
    const locationText = locationMatch[1].trim();
    
    // Parse location name and address
    const lines = locationText.split('\n').map(line => 
      line.replace(/<br\s*\/?>/gi, '').trim()
    ).filter(line => line && !line.startsWith('We will be'));
    
    if (lines.length > 0) {
      return {
        name: lines[0],
        address: lines.slice(1).join(', ')
      };
    }
  }
  
  return {
    name: 'Location TBD',
    address: ''
  };
}

/**
 * Extract attendance cap from RSVP shortcode
 */
function extractAttendanceCap(content) {
  const rsvpMatch = content.match(/{{<\s*event_rsvp\s+attendance_cap="(\d+)"\s*>}}/);
  return rsvpMatch ? parseInt(rsvpMatch[1]) : 20; // Default to 20
}

/**
 * Convert markdown event to database event record
 */
function convertEventToRecord(filePath, frontMatter, content) {
  const filename = path.basename(filePath, '.md');
  
  // Generate event_id from title or use filename
  let eventId = filename;
  if (frontMatter.title) {
    eventId = titleToSlug(frontMatter.title);
  }
  
  // Extract location from content
  const location = extractLocationFromContent(content);
  
  // Extract attendance cap
  const attendanceCap = extractAttendanceCap(content);
  
  // Determine event status based on date
  let status = 'active';
  if (frontMatter.start_time) {
    const startTime = new Date(frontMatter.start_time);
    const now = new Date();
    if (startTime < now) {
      status = 'completed';
    }
  }
  
  const event = {
    event_id: eventId,
    title: frontMatter.title || 'Untitled Event',
    description: frontMatter.seo?.description || `Join us for ${frontMatter.title || 'this event'}!`,
    start_time: frontMatter.start_time || new Date().toISOString(),
    end_time: frontMatter.end_time || frontMatter.start_time || new Date().toISOString(),
    location: location,
    attendance_cap: attendanceCap,
    status: status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    hugo_config: {
      image: frontMatter.image || null,
      tags: frontMatter.tags || [],
      preheader_is_light: frontMatter.preheader_is_light || false
    },
    metadata: {
      original_filename: filename,
      migrated_from: 'markdown',
      migration_date: new Date().toISOString()
    }
  };
  
  return event;
}

/**
 * Get all existing event markdown files
 */
function getExistingEventFiles() {
  const eventsDir = path.join(__dirname, '..', 'content', 'en', 'events');
  
  if (!fs.existsSync(eventsDir)) {
    console.error(`Events directory not found: ${eventsDir}`);
    return [];
  }
  
  const files = fs.readdirSync(eventsDir)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(eventsDir, file));
  
  log(`Found ${files.length} event markdown files`);
  return files;
}

/**
 * Parse all event files and convert to database records
 */
function parseAllEvents() {
  const eventFiles = getExistingEventFiles();
  const events = [];
  const errors = [];
  
  for (const filePath of eventFiles) {
    log(`Parsing: ${path.basename(filePath)}`);
    
    const parsed = parseMarkdownFile(filePath);
    if (parsed) {
      try {
        const event = convertEventToRecord(filePath, parsed.frontMatter, parsed.content);
        events.push(event);
        log(`  ✅ Converted to event_id: ${event.event_id}`);
      } catch (error) {
        errors.push({ file: filePath, error: error.message });
        log(`  ❌ Error: ${error.message}`);
      }
    } else {
      errors.push({ file: filePath, error: 'Failed to parse markdown' });
    }
  }
  
  return { events, errors };
}

/**
 * Get all existing RSVP records from old table
 */
async function getExistingRsvps() {
  log('Scanning existing RSVP records...');
  
  try {
    const params = {
      TableName: OLD_EVENT_RSVPS_TABLE
    };
    
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
    
    log(`✅ Total existing RSVP records: ${allItems.length}`);
    return allItems;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      log(`⚠️  Old RSVP table ${OLD_EVENT_RSVPS_TABLE} not found, skipping RSVP migration`);
      return [];
    }
    console.error('Error scanning existing RSVPs:', error.message);
    throw error;
  }
}

/**
 * Create volunteer record from RSVP data
 */
function createVolunteerFromRsvp(rsvp) {
  const volunteer = {
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
  
  return volunteer;
}

/**
 * Create normalized RSVP record
 */
function createNormalizedRsvp(oldRsvp, eventIdMapping) {
  // Map old event ID to new event ID
  const newEventId = eventIdMapping[oldRsvp.event_id] || oldRsvp.event_id;
  
  const rsvp = {
    event_id: newEventId,
    email: oldRsvp.email,
    status: oldRsvp.status || 'active',
    created_at: oldRsvp.created_at || new Date().toISOString(),
    updated_at: oldRsvp.updated_at || oldRsvp.created_at || new Date().toISOString(),
    cancelled_at: oldRsvp.cancelled_at || null,
    hours_before_event: oldRsvp.hours_before_event || null,
    additional_comments: oldRsvp.additional_comments || null
  };
  
  return rsvp;
}

/**
 * Create event ID mapping from old to new format
 */
function createEventIdMapping(events, existingRsvps) {
  const mapping = {};
  
  // Get unique event IDs from existing RSVPs
  const rsvpEventIds = [...new Set(existingRsvps.map(rsvp => rsvp.event_id))];
  
  log('Creating event ID mapping...');
  
  for (const rsvpEventId of rsvpEventIds) {
    // Try to find matching event by exact ID first
    const exactMatch = events.find(event => event.event_id === rsvpEventId);
    if (exactMatch) {
      log(`  ✅ Exact match: ${rsvpEventId}`);
      continue; // No mapping needed
    }
    
    // Try to find by original filename
    const filenameMatch = events.find(event => 
      event.metadata.original_filename === rsvpEventId
    );
    if (filenameMatch) {
      mapping[rsvpEventId] = filenameMatch.event_id;
      log(`  🔄 Filename match: ${rsvpEventId} -> ${filenameMatch.event_id}`);
      continue;
    }
    
    // Try fuzzy matching by comparing parts
    const potentialMatches = events.filter(event => {
      const rsvpParts = rsvpEventId.split('-');
      const eventParts = event.event_id.split('-');
      
      const commonParts = rsvpParts.filter(part => eventParts.includes(part));
      return commonParts.length >= Math.min(rsvpParts.length, eventParts.length) * 0.7;
    });
    
    if (potentialMatches.length === 1) {
      mapping[rsvpEventId] = potentialMatches[0].event_id;
      log(`  🎯 Fuzzy match: ${rsvpEventId} -> ${potentialMatches[0].event_id}`);
    } else if (potentialMatches.length > 1) {
      log(`  ⚠️  Multiple matches for ${rsvpEventId}, using first: ${potentialMatches[0].event_id}`);
      mapping[rsvpEventId] = potentialMatches[0].event_id;
    } else {
      log(`  ❌ No match found for: ${rsvpEventId}`);
    }
  }
  
  return mapping;
}

/**
 * Write events to database
 */
async function writeEventsToDatabase(events) {
  log(`Writing ${events.length} events to database...`, true);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const event of events) {
    if (isDryRun) {
      log(`  [DRY RUN] Would create event: ${event.event_id}`);
      successCount++;
      continue;
    }
    
    try {
      await dynamodb.put({
        TableName: EVENTS_TABLE,
        Item: event,
        ConditionExpression: 'attribute_not_exists(event_id)' // Prevent overwrites
      }).promise();
      
      log(`  ✅ Created event: ${event.event_id}`);
      successCount++;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        log(`  ⚠️  Event already exists: ${event.event_id}`);
      } else {
        log(`  ❌ Failed to create event ${event.event_id}: ${error.message}`);
        errorCount++;
      }
    }
  }
  
  return { successCount, errorCount };
}

/**
 * Write volunteers to database
 */
async function writeVolunteersToDatabase(volunteers) {
  log(`Writing ${volunteers.length} volunteers to database...`, true);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const volunteer of volunteers) {
    if (isDryRun) {
      log(`  [DRY RUN] Would create volunteer: ${volunteer.email}`);
      successCount++;
      continue;
    }
    
    try {
      await dynamodb.put({
        TableName: VOLUNTEERS_TABLE,
        Item: volunteer,
        ConditionExpression: 'attribute_not_exists(email)' // Prevent overwrites
      }).promise();
      
      log(`  ✅ Created volunteer: ${volunteer.email}`);
      successCount++;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        log(`  ⚠️  Volunteer already exists: ${volunteer.email}`);
      } else {
        log(`  ❌ Failed to create volunteer ${volunteer.email}: ${error.message}`);
        errorCount++;
      }
    }
  }
  
  return { successCount, errorCount };
}

/**
 * Write RSVPs to database
 */
async function writeRsvpsToDatabase(rsvps) {
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
        ConditionExpression: 'attribute_not_exists(event_id) AND attribute_not_exists(email)' // Prevent overwrites
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
 * Validate data integrity after migration
 */
async function validateDataIntegrity(events, volunteers, rsvps) {
  log('Validating data integrity...', true);
  
  const issues = [];
  
  // Check that all RSVPs reference valid events
  const eventIds = new Set(events.map(e => e.event_id));
  const invalidEventRefs = rsvps.filter(rsvp => !eventIds.has(rsvp.event_id));
  if (invalidEventRefs.length > 0) {
    issues.push(`${invalidEventRefs.length} RSVPs reference non-existent events`);
  }
  
  // Check that all RSVPs reference valid volunteers
  const volunteerEmails = new Set(volunteers.map(v => v.email));
  const invalidVolunteerRefs = rsvps.filter(rsvp => !volunteerEmails.has(rsvp.email));
  if (invalidVolunteerRefs.length > 0) {
    issues.push(`${invalidVolunteerRefs.length} RSVPs reference non-existent volunteers`);
  }
  
  // Check for duplicate events
  const duplicateEvents = events.filter((event, index, arr) => 
    arr.findIndex(e => e.event_id === event.event_id) !== index
  );
  if (duplicateEvents.length > 0) {
    issues.push(`${duplicateEvents.length} duplicate events found`);
  }
  
  // Check for duplicate volunteers
  const duplicateVolunteers = volunteers.filter((volunteer, index, arr) => 
    arr.findIndex(v => v.email === volunteer.email) !== index
  );
  if (duplicateVolunteers.length > 0) {
    issues.push(`${duplicateVolunteers.length} duplicate volunteers found`);
  }
  
  // Check for duplicate RSVPs
  const duplicateRsvps = rsvps.filter((rsvp, index, arr) => 
    arr.findIndex(r => r.event_id === rsvp.event_id && r.email === rsvp.email) !== index
  );
  if (duplicateRsvps.length > 0) {
    issues.push(`${duplicateRsvps.length} duplicate RSVPs found`);
  }
  
  if (issues.length === 0) {
    log('✅ Data integrity validation passed');
  } else {
    log('❌ Data integrity issues found:');
    issues.forEach(issue => log(`  - ${issue}`));
  }
  
  return issues;
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    console.log('🚀 Starting data migration...\n');
    
    // Step 1: Parse existing event markdown files
    console.log('📁 Step 1: Parsing event markdown files...');
    const { events, errors } = parseAllEvents();
    
    if (errors.length > 0) {
      console.log('⚠️  Parsing errors:');
      errors.forEach(error => console.log(`  - ${path.basename(error.file)}: ${error.error}`));
    }
    
    console.log(`✅ Parsed ${events.length} events successfully\n`);
    
    // Step 2: Get existing RSVP data
    console.log('📊 Step 2: Retrieving existing RSVP data...');
    const existingRsvps = await getExistingRsvps();
    console.log(`✅ Found ${existingRsvps.length} existing RSVPs\n`);
    
    // Step 3: Create event ID mapping
    console.log('🗺️  Step 3: Creating event ID mapping...');
    const eventIdMapping = createEventIdMapping(events, existingRsvps);
    console.log(`✅ Created ${Object.keys(eventIdMapping).length} event ID mappings\n`);
    
    // Step 4: Create volunteers from RSVP data
    console.log('👥 Step 4: Creating volunteer records...');
    const volunteerMap = new Map();
    
    for (const rsvp of existingRsvps) {
      if (!volunteerMap.has(rsvp.email)) {
        volunteerMap.set(rsvp.email, createVolunteerFromRsvp(rsvp));
      }
    }
    
    const volunteers = Array.from(volunteerMap.values());
    console.log(`✅ Created ${volunteers.length} volunteer records\n`);
    
    // Step 5: Create normalized RSVP records
    console.log('📝 Step 5: Creating normalized RSVP records...');
    const normalizedRsvps = existingRsvps.map(rsvp => 
      createNormalizedRsvp(rsvp, eventIdMapping)
    );
    console.log(`✅ Created ${normalizedRsvps.length} normalized RSVP records\n`);
    
    // Step 6: Validate data integrity
    console.log('🔍 Step 6: Validating data integrity...');
    const integrityIssues = await validateDataIntegrity(events, volunteers, normalizedRsvps);
    
    if (integrityIssues.length > 0 && !isDryRun) {
      console.log('❌ Data integrity issues found. Please fix before proceeding.');
      return;
    }
    console.log('');
    
    // Step 7: Write to database
    console.log('💾 Step 7: Writing to database...');
    
    const eventResults = await writeEventsToDatabase(events);
    console.log(`Events: ${eventResults.successCount} created, ${eventResults.errorCount} errors`);
    
    const volunteerResults = await writeVolunteersToDatabase(volunteers);
    console.log(`Volunteers: ${volunteerResults.successCount} created, ${volunteerResults.errorCount} errors`);
    
    const rsvpResults = await writeRsvpsToDatabase(normalizedRsvps);
    console.log(`RSVPs: ${rsvpResults.successCount} created, ${rsvpResults.errorCount} errors`);
    
    console.log('\n✅ Migration completed successfully!');
    
    if (isDryRun) {
      console.log('\n🚀 To apply these changes, run:');
      console.log(`   node scripts/data-migration.js --environment=${environment}`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Check for required dependencies
try {
  require('js-yaml');
} catch (error) {
  console.error('❌ Missing dependency: js-yaml');
  console.log('Install with: npm install js-yaml');
  process.exit(1);
}

// Run migration
runMigration();