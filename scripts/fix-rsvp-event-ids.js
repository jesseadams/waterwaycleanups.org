#!/usr/bin/env node

/**
 * Fix RSVP Event IDs Script
 * 
 * This script fixes existing RSVP records in DynamoDB to use the correct event IDs
 * that match Hugo's URL generation (based on titles) instead of just the filename.
 * 
 * Usage: node scripts/fix-rsvp-event-ids.js [--dry-run] [--environment staging|prod]
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configuration
const REGION = 'us-east-1';
const ENVIRONMENTS = {
  staging: 'staging',
  prod: 'prod'
};

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!ENVIRONMENTS[environment]) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
}

const TABLE_NAME = `event_rsvps-${environment}`;

console.log(`🔧 RSVP Event ID Fix Script`);
console.log(`Environment: ${environment}`);
console.log(`Table: ${TABLE_NAME}`);
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
console.log('');

// Configure AWS
AWS.config.update({ region: REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Convert a title to a Hugo-style slug
 * @param {string} title - The title to convert
 * @returns {string} The slug
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
 * Get Hugo-generated URL slug for a content file
 * @param {string} filePath - Path to the Hugo content file
 * @returns {string} The slug that Hugo would generate
 */
function getHugoSlug(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (frontMatterMatch) {
      const frontMatter = frontMatterMatch[1];
      
      // Check for custom URL or slug in front matter first
      const urlMatch = frontMatter.match(/^url:\s*(.+)$/m);
      if (urlMatch) {
        return urlMatch[1].trim().replace(/^\/events\//, '').replace(/\/$/, '');
      }
      
      const slugMatch = frontMatter.match(/^slug:\s*(.+)$/m);
      if (slugMatch) {
        return slugMatch[1].trim();
      }
      
      // Get title and convert to slug (Hugo's default behavior)
      const titleMatch = frontMatter.match(/^title:\s*(.+)$/m);
      if (titleMatch) {
        const title = titleMatch[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes
        return titleToSlug(title);
      }
    }
    
    // Fallback to filename if no title found
    return path.basename(filePath, '.md');
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}:`, error.message);
    return path.basename(filePath, '.md');
  }
}

/**
 * Get all event files from the Hugo content directory
 * @returns {Array} Array of event objects with filename and correct slug
 */
function getEventMappings() {
  const eventsDir = path.join(__dirname, '../content/en/events');
  const eventFiles = fs.readdirSync(eventsDir).filter(file => file.endsWith('.md'));
  
  const mappings = [];
  
  for (const file of eventFiles) {
    const filename = path.basename(file, '.md');
    const filePath = path.join(eventsDir, file);
    
    // Get the actual slug that Hugo would generate
    const hugoSlug = getHugoSlug(filePath);
    
    mappings.push({
      filename: filename,
      hugoSlug: hugoSlug,
      filePath: filePath,
      needsMapping: filename !== hugoSlug
    });
  }
  
  return mappings;
}

/**
 * Scan all RSVP records from DynamoDB
 * @returns {Promise<Array>} Array of RSVP records
 */
async function getAllRsvps() {
  console.log('📊 Scanning RSVP records...');
  
  const params = {
    TableName: TABLE_NAME
  };
  
  const allItems = [];
  let lastEvaluatedKey = null;
  
  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    try {
      const result = await dynamodb.scan(params).promise();
      allItems.push(...result.Items);
      lastEvaluatedKey = result.LastEvaluatedKey;
      
      console.log(`   Found ${result.Items.length} records (total: ${allItems.length})`);
    } catch (error) {
      console.error('❌ Error scanning DynamoDB:', error.message);
      throw error;
    }
  } while (lastEvaluatedKey);
  
  console.log(`✅ Total RSVP records found: ${allItems.length}`);
  return allItems;
}

/**
 * Create mapping from old event IDs to correct event IDs
 * @param {Array} eventMappings - Event mappings from Hugo content
 * @param {Array} rsvps - Existing RSVP records from database
 * @returns {Object} Mapping object
 */
function createEventIdMapping(eventMappings, rsvps) {
  const mapping = {};
  
  // Get unique event IDs from database
  const dbEventIds = [...new Set(rsvps.map(rsvp => rsvp.event_id))];
  
  console.log('🔍 Analyzing event ID patterns...');
  
  // Create mappings for known patterns and mismatches
  for (const dbEventId of dbEventIds) {
    console.log(`   Checking database event ID: ${dbEventId}`);
    
    // Check if this exact event ID exists as a Hugo slug
    const exactMatch = eventMappings.find(event => event.hugoSlug === dbEventId);
    if (exactMatch) {
      console.log(`     ✅ Exact match found: ${dbEventId}`);
      continue; // No mapping needed
    }
    
    // Look for potential matches by comparing parts
    const potentialMatches = eventMappings.filter(event => {
      const dbParts = dbEventId.split('-');
      const slugParts = event.hugoSlug.split('-');
      
      // Check if most parts match (allowing for some differences)
      const commonParts = dbParts.filter(part => slugParts.includes(part));
      return commonParts.length >= Math.min(dbParts.length, slugParts.length) * 0.7; // 70% match
    });
    
    if (potentialMatches.length === 1) {
      const match = potentialMatches[0];
      console.log(`     🔄 Potential match found: ${dbEventId} -> ${match.hugoSlug}`);
      mapping[dbEventId] = match.hugoSlug;
    } else if (potentialMatches.length > 1) {
      console.log(`     ⚠️  Multiple potential matches for ${dbEventId}:`);
      potentialMatches.forEach(match => {
        console.log(`        - ${match.hugoSlug} (from: ${match.filename})`);
      });
      
      // Try to find the best match by looking for the most similar one
      let bestMatch = potentialMatches[0];
      let bestScore = 0;
      
      for (const match of potentialMatches) {
        const dbParts = dbEventId.split('-');
        const slugParts = match.hugoSlug.split('-');
        const commonParts = dbParts.filter(part => slugParts.includes(part));
        const score = commonParts.length / Math.max(dbParts.length, slugParts.length);
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = match;
        }
      }
      
      console.log(`     🎯 Best match selected: ${dbEventId} -> ${bestMatch.hugoSlug} (score: ${bestScore.toFixed(2)})`);
      mapping[dbEventId] = bestMatch.hugoSlug;
    } else {
      console.log(`     ❌ No match found for: ${dbEventId}`);
    }
  }
  
  return mapping;
}

/**
 * Update a single RSVP record
 * @param {Object} rsvp - The RSVP record to update
 * @param {string} newEventId - The new event ID
 * @returns {Promise<boolean>} Success status
 */
async function updateRsvpRecord(rsvp, newEventId) {
  if (isDryRun) {
    console.log(`   [DRY RUN] Would update: ${rsvp.event_id} -> ${newEventId} (${rsvp.email})`);
    return true;
  }
  
  try {
    // Delete the old record
    await dynamodb.delete({
      TableName: TABLE_NAME,
      Key: {
        event_id: rsvp.event_id,
        email: rsvp.email
      }
    }).promise();
    
    // Create new record with updated event_id
    const updatedRsvp = {
      ...rsvp,
      event_id: newEventId,
      updated_at: new Date().toISOString()
    };
    
    await dynamodb.put({
      TableName: TABLE_NAME,
      Item: updatedRsvp
    }).promise();
    
    console.log(`   ✅ Updated: ${rsvp.event_id} -> ${newEventId} (${rsvp.email})`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to update ${rsvp.event_id} -> ${newEventId} (${rsvp.email}):`, error.message);
    return false;
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Get event mappings from Hugo content
    console.log('📁 Reading Hugo event files...');
    const eventMappings = getEventMappings();
    console.log(`✅ Found ${eventMappings.length} event files`);
    
    // Show some examples of filename vs slug differences
    console.log('📋 Hugo slug generation examples:');
    eventMappings.slice(0, 3).forEach(event => {
      console.log(`   File: ${event.filename}`);
      console.log(`   Slug: ${event.hugoSlug}`);
      console.log(`   ${event.needsMapping ? '⚠️  Different!' : '✅ Same'}`);
      console.log('');
    });
    
    // Get all RSVP records
    const rsvps = await getAllRsvps();
    
    if (rsvps.length === 0) {
      console.log('ℹ️  No RSVP records found');
      return;
    }
    
    // Create event ID mapping (now with RSVP data for better analysis)
    const eventIdMapping = createEventIdMapping(eventMappings, rsvps);
    
    console.log('');
    console.log('🗺️  Final Event ID mappings:');
    if (Object.keys(eventIdMapping).length === 0) {
      console.log('   No mappings needed - all event IDs are already correct');
    } else {
      for (const [oldId, newId] of Object.entries(eventIdMapping)) {
        console.log(`   ${oldId} -> ${newId}`);
      }
    }
    console.log('');
    
    // Find records that need updating
    const recordsToUpdate = [];
    const uniqueEventIds = new Set();
    
    for (const rsvp of rsvps) {
      uniqueEventIds.add(rsvp.event_id);
      
      if (eventIdMapping[rsvp.event_id]) {
        recordsToUpdate.push({
          rsvp: rsvp,
          newEventId: eventIdMapping[rsvp.event_id]
        });
      }
    }
    
    console.log('📋 Analysis:');
    console.log(`   Total RSVP records: ${rsvps.length}`);
    console.log(`   Unique event IDs: ${uniqueEventIds.size}`);
    console.log(`   Records needing update: ${recordsToUpdate.length}`);
    console.log('');
    
    console.log('🔍 Current event IDs in database:');
    for (const eventId of Array.from(uniqueEventIds).sort()) {
      const count = rsvps.filter(r => r.event_id === eventId).length;
      const needsUpdate = eventIdMapping[eventId] ? ' ⚠️  NEEDS UPDATE' : ' ✅';
      console.log(`   ${eventId} (${count} RSVPs)${needsUpdate}`);
    }
    console.log('');
    
    if (recordsToUpdate.length === 0) {
      console.log('✅ All RSVP records already have correct event IDs!');
      return;
    }
    
    // Update records
    console.log(`🔄 ${isDryRun ? 'Simulating updates' : 'Updating records'}...`);
    let successCount = 0;
    let failureCount = 0;
    
    for (const { rsvp, newEventId } of recordsToUpdate) {
      const success = await updateRsvpRecord(rsvp, newEventId);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
    
    console.log('');
    console.log('📊 Summary:');
    console.log(`   ${isDryRun ? 'Would update' : 'Successfully updated'}: ${successCount} records`);
    if (failureCount > 0) {
      console.log(`   Failed: ${failureCount} records`);
    }
    
    if (isDryRun) {
      console.log('');
      console.log('🚀 To apply these changes, run:');
      console.log(`   node scripts/fix-rsvp-event-ids.js --environment=${environment}`);
    } else {
      console.log('');
      console.log('✅ RSVP event ID fix completed!');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();