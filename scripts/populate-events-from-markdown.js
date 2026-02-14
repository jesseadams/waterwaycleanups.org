#!/usr/bin/env node

/**
 * Populate Events Table from Markdown Files
 * 
 * This script reads event markdown files from content/en/events/
 * and populates the events table in staging (or production).
 * 
 * Usage: node scripts/populate-events-from-markdown.js [--environment staging|prod] [--dry-run] [--verbose]
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

// Table name with environment suffix
const suffix = environment === 'prod' ? '-production' : `-${environment}`;
const EVENTS_TABLE = `events${suffix}`;

console.log(`📅 Populate Events from Markdown`);
console.log(`Environment: ${environment}`);
console.log(`Table: ${EVENTS_TABLE}`);
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
console.log(`Verbose: ${isVerbose ? 'ON' : 'OFF'}`);
console.log('');

// Configure AWS
AWS.config.update({ region: REGION });
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
  
  log(`Found ${files.length} event markdown files`, true);
  return files;
}

/**
 * Parse all event files and convert to database records
 */
function parseAllEvents() {
  const eventFiles = getExistingEventFiles();
  const events = [];
  const errors = [];
  
  console.log('\n📖 Parsing event markdown files...\n');
  
  for (const filePath of eventFiles) {
    const filename = path.basename(filePath);
    log(`Parsing: ${filename}`);
    
    const parsed = parseMarkdownFile(filePath);
    if (parsed) {
      try {
        const event = convertEventToRecord(filePath, parsed.frontMatter, parsed.content);
        events.push(event);
        console.log(`  ✅ ${event.title}`);
        console.log(`     ID: ${event.event_id}`);
        console.log(`     Date: ${new Date(event.start_time).toLocaleDateString()}`);
        console.log(`     Status: ${event.status}`);
      } catch (error) {
        errors.push({ file: filePath, error: error.message });
        console.log(`  ❌ Error: ${error.message}`);
      }
    } else {
      errors.push({ file: filePath, error: 'Failed to parse markdown' });
    }
  }
  
  if (errors.length > 0) {
    console.log('\n⚠️  Parsing errors:');
    errors.forEach(error => console.log(`  - ${path.basename(error.file)}: ${error.error}`));
  }
  
  return { events, errors };
}

/**
 * Clear existing events from the table
 */
async function clearEventsTable() {
  console.log(`\n🗑️  Clearing existing events from ${EVENTS_TABLE}...\n`);
  
  try {
    // Scan all items
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
    
    if (allItems.length === 0) {
      console.log('  ℹ️  Table is already empty');
      return { deletedCount: 0 };
    }
    
    console.log(`  Found ${allItems.length} existing events`);
    
    let deletedCount = 0;
    
    for (const item of allItems) {
      if (isDryRun) {
        console.log(`  [DRY RUN] Would delete event: ${item.event_id}`);
        deletedCount++;
        continue;
      }
      
      try {
        await dynamodb.delete({
          TableName: EVENTS_TABLE,
          Key: { event_id: item.event_id }
        }).promise();
        
        deletedCount++;
        if (deletedCount % 5 === 0) {
          log(`  Deleted ${deletedCount}/${allItems.length} events`);
        }
      } catch (error) {
        console.log(`  ❌ Failed to delete event ${item.event_id}: ${error.message}`);
      }
    }
    
    console.log(`  ✅ Deleted ${deletedCount} events\n`);
    return { deletedCount };
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.log(`  ⚠️  Table ${EVENTS_TABLE} not found\n`);
      return { deletedCount: 0 };
    }
    throw error;
  }
}

/**
 * Write events to database
 */
async function writeEventsToDatabase(events) {
  console.log(`💾 Writing ${events.length} events to ${EVENTS_TABLE}...\n`);
  
  let successCount = 0;
  let updateCount = 0;
  let errorCount = 0;
  
  for (const event of events) {
    if (isDryRun) {
      console.log(`  [DRY RUN] Would create/update event: ${event.event_id}`);
      successCount++;
      continue;
    }
    
    try {
      // Try to create new event
      await dynamodb.put({
        TableName: EVENTS_TABLE,
        Item: event,
        ConditionExpression: 'attribute_not_exists(event_id)'
      }).promise();
      
      console.log(`  ✅ Created: ${event.title}`);
      successCount++;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        // Event exists, update it
        try {
          await dynamodb.put({
            TableName: EVENTS_TABLE,
            Item: event
          }).promise();
          
          console.log(`  🔄 Updated: ${event.title}`);
          updateCount++;
        } catch (updateError) {
          console.log(`  ❌ Failed to update ${event.event_id}: ${updateError.message}`);
          errorCount++;
        }
      } else {
        console.log(`  ❌ Failed to create ${event.event_id}: ${error.message}`);
        errorCount++;
      }
    }
  }
  
  return { successCount, updateCount, errorCount };
}

/**
 * Main function
 */
async function run() {
  try {
    console.log('🚀 Starting event population...\n');
    
    // Parse event files
    const { events, errors } = parseAllEvents();
    
    if (events.length === 0) {
      console.log('\n⚠️  No events found to populate');
      return;
    }
    
    console.log(`\n✅ Parsed ${events.length} events successfully`);
    
    // Clear existing events
    const clearResult = await clearEventsTable();
    
    // Write to database
    const results = await writeEventsToDatabase(events);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Events parsed: ${events.length}`);
    if (clearResult.deletedCount > 0) {
      console.log(`Events cleared: ${clearResult.deletedCount}`);
    }
    console.log(`Events created: ${results.successCount}`);
    console.log(`Events updated: ${results.updateCount}`);
    if (results.errorCount > 0) {
      console.log(`Errors: ${results.errorCount}`);
    }
    if (errors.length > 0) {
      console.log(`Parse errors: ${errors.length}`);
    }
    
    console.log('\n✅ Event population completed!');
    
    if (isDryRun) {
      console.log('\n🚀 To apply these changes, run:');
      console.log(`   node scripts/populate-events-from-markdown.js --environment=${environment}`);
    }
    
  } catch (error) {
    console.error('❌ Event population failed:', error.message);
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

// Run
run();
