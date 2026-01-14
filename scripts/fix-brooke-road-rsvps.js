#!/usr/bin/env node

/**
 * Fix Brooke Road RSVP Event IDs
 * 
 * This script specifically fixes the known issue where Brooke Road event RSVPs
 * were stored with "brooke-road-thorny-point-cleanup-february-2026" but should be
 * "brooke-road-and-thorny-point-road-cleanup-february-2026"
 * 
 * Usage: node scripts/fix-brooke-road-rsvps.js [--dry-run] [--environment staging|prod]
 */

const AWS = require('aws-sdk');

// Configuration
const REGION = 'us-east-1';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
}

const TABLE_NAME = `event_rsvps-${environment}`;

// Known mapping for the Brooke Road event
const EVENT_ID_MAPPING = {
  'brooke-road-thorny-point-cleanup-february-2026': 'brooke-road-and-thorny-point-road-cleanup-february-2026'
};

console.log(`🔧 Brooke Road RSVP Fix Script`);
console.log(`Environment: ${environment}`);
console.log(`Table: ${TABLE_NAME}`);
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
console.log('');

// Configure AWS
AWS.config.update({ region: REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Get all RSVPs for the incorrect event ID
 * @param {string} oldEventId - The incorrect event ID to search for
 * @returns {Promise<Array>} Array of RSVP records
 */
async function getRsvpsForEvent(oldEventId) {
  console.log(`📊 Querying RSVPs for event: ${oldEventId}`);
  
  try {
    const result = await dynamodb.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'event_id = :event_id',
      ExpressionAttributeValues: {
        ':event_id': oldEventId
      }
    }).promise();
    
    console.log(`✅ Found ${result.Items.length} RSVP records for ${oldEventId}`);
    return result.Items;
  } catch (error) {
    console.error('❌ Error querying DynamoDB:', error.message);
    throw error;
  }
}

/**
 * Update a single RSVP record
 * @param {Object} rsvp - The RSVP record to update
 * @param {string} newEventId - The new event ID
 * @returns {Promise<boolean>} Success status
 */
async function updateRsvpRecord(rsvp, newEventId) {
  if (isDryRun) {
    console.log(`   [DRY RUN] Would update RSVP for ${rsvp.email}: ${rsvp.event_id} -> ${newEventId}`);
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
    
    console.log(`   ✅ Updated RSVP for ${rsvp.email}: ${rsvp.event_id} -> ${newEventId}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to update RSVP for ${rsvp.email}:`, error.message);
    return false;
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    let totalUpdated = 0;
    let totalFailed = 0;
    
    for (const [oldEventId, newEventId] of Object.entries(EVENT_ID_MAPPING)) {
      console.log(`🔄 Processing: ${oldEventId} -> ${newEventId}`);
      
      // Get all RSVPs for this event
      const rsvps = await getRsvpsForEvent(oldEventId);
      
      if (rsvps.length === 0) {
        console.log(`   ℹ️  No RSVPs found for ${oldEventId}`);
        continue;
      }
      
      // Show RSVP details
      console.log(`   📋 RSVPs to update:`);
      for (const rsvp of rsvps) {
        const name = `${rsvp.first_name || ''} ${rsvp.last_name || ''}`.trim();
        const date = rsvp.created_at ? new Date(rsvp.created_at).toLocaleDateString() : 'Unknown date';
        console.log(`      - ${name} (${rsvp.email}) - ${date}`);
      }
      
      if (!isDryRun) {
        const confirm = await new Promise((resolve) => {
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          readline.question(`   ❓ Update ${rsvps.length} RSVP(s)? (y/N): `, (answer) => {
            readline.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
          });
        });
        
        if (!confirm) {
          console.log(`   ⏭️  Skipped ${oldEventId}`);
          continue;
        }
      }
      
      // Update each RSVP
      let successCount = 0;
      let failureCount = 0;
      
      for (const rsvp of rsvps) {
        const success = await updateRsvpRecord(rsvp, newEventId);
        if (success) {
          successCount++;
        } else {
          failureCount++;
        }
      }
      
      totalUpdated += successCount;
      totalFailed += failureCount;
      
      console.log(`   📊 ${oldEventId}: ${successCount} updated, ${failureCount} failed`);
      console.log('');
    }
    
    console.log('📊 Final Summary:');
    console.log(`   ${isDryRun ? 'Would update' : 'Successfully updated'}: ${totalUpdated} RSVPs`);
    if (totalFailed > 0) {
      console.log(`   Failed: ${totalFailed} RSVPs`);
    }
    
    if (isDryRun) {
      console.log('');
      console.log('🚀 To apply these changes, run:');
      console.log(`   node scripts/fix-brooke-road-rsvps.js --environment=${environment}`);
    } else {
      console.log('');
      console.log('✅ Brooke Road RSVP fix completed!');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();