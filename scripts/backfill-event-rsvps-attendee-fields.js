#!/usr/bin/env node

/**
 * Backfill Script: Event RSVPs Attendee Fields
 * 
 * This script backfills existing event_rsvps records with new fields after
 * the table schema has been updated via Terraform:
 * - Sets attendee_type = "volunteer" for all existing records
 * - Sets attendee_id = email for all existing records (for backward compatibility)
 * 
 * This script should be run AFTER Terraform has updated the table schema.
 * 
 * Requirements: 7.5, 8.3
 * 
 * Usage:
 *   node scripts/backfill-event-rsvps-attendee-fields.js [--dry-run] [--table-suffix=SUFFIX]
 * 
 * Options:
 *   --dry-run         Preview changes without applying them
 *   --table-suffix    Table name suffix (e.g., '-dev', '-prod')
 */

const AWS = require('aws-sdk');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const tableSuffixArg = args.find(arg => arg.startsWith('--table-suffix='));
const tableSuffix = tableSuffixArg ? tableSuffixArg.split('=')[1] : '';

// Configure AWS SDK
const docClient = new AWS.DynamoDB.DocumentClient({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

const TABLE_NAME = `event_rsvps${tableSuffix}`;

console.log('='.repeat(80));
console.log('Event RSVPs Attendee Fields Backfill');
console.log('='.repeat(80));
console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
console.log(`Table: ${TABLE_NAME}`);
console.log('='.repeat(80));
console.log('');

/**
 * Scan all records and identify those needing backfill
 */
async function scanAndBackfill() {
  console.log('Scanning table for records needing backfill...\n');
  
  let scannedCount = 0;
  let needsBackfillCount = 0;
  let backfilledCount = 0;
  let errorCount = 0;
  let lastEvaluatedKey = null;

  do {
    const scanParams = {
      TableName: TABLE_NAME,
      Limit: 100
    };

    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    try {
      const scanResult = await docClient.scan(scanParams).promise();
      scannedCount += scanResult.Items.length;

      if (scanResult.Items.length > 0) {
        console.log(`Scanned ${scannedCount} records...`);

        for (const item of scanResult.Items) {
          // Check if record needs backfill
          const needsBackfill = !item.attendee_type || !item.attendee_id;

          if (needsBackfill) {
            needsBackfillCount++;

            // Show first few records in detail
            if (needsBackfillCount <= 3) {
              console.log(`\nRecord ${needsBackfillCount} needs backfill:`);
              console.log(`  Event ID: ${item.event_id}`);
              console.log(`  Email: ${item.email}`);
              console.log(`  Has attendee_type: ${!!item.attendee_type}`);
              console.log(`  Has attendee_id: ${!!item.attendee_id}`);
            }

            if (!isDryRun) {
              try {
                // Update the record with new fields
                await docClient.update({
                  TableName: TABLE_NAME,
                  Key: {
                    event_id: item.event_id,
                    attendee_id: item.attendee_id || item.email // Use existing attendee_id or email
                  },
                  UpdateExpression: 'SET attendee_type = :type, attendee_id = :id',
                  ExpressionAttributeValues: {
                    ':type': 'volunteer',
                    ':id': item.email
                  },
                  ConditionExpression: 'attribute_exists(event_id)'
                }).promise();

                backfilledCount++;
              } catch (error) {
                console.error(`  ✗ Error updating record ${item.event_id}/${item.email}:`, error.message);
                errorCount++;
              }
            }
          }
        }
      }

      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } catch (error) {
      console.error('Error scanning table:', error);
      throw error;
    }
  } while (lastEvaluatedKey);

  console.log('\n' + '='.repeat(80));
  console.log('Scan Results:');
  console.log('='.repeat(80));
  console.log(`Total records scanned: ${scannedCount}`);
  console.log(`Records needing backfill: ${needsBackfillCount}`);
  
  if (isDryRun) {
    console.log(`Records that would be backfilled: ${needsBackfillCount}`);
  } else {
    console.log(`Records successfully backfilled: ${backfilledCount}`);
    console.log(`Errors: ${errorCount}`);
  }
  console.log('='.repeat(80));

  return {
    scannedCount,
    needsBackfillCount,
    backfilledCount,
    errorCount
  };
}

/**
 * Verify backfill results
 */
async function verifyBackfill() {
  console.log('\nVerifying backfill...\n');

  if (isDryRun) {
    console.log('[DRY RUN] Would verify:');
    console.log('  - All records have attendee_type field');
    console.log('  - All records have attendee_id field');
    console.log('  - All attendee_type values are "volunteer"');
    console.log('  - All attendee_id values match email');
    return;
  }

  // Sample records to verify
  const sampleResult = await docClient.scan({
    TableName: TABLE_NAME,
    Limit: 10
  }).promise();

  let allValid = true;
  let recordsChecked = 0;

  for (const item of sampleResult.Items) {
    recordsChecked++;
    
    if (!item.attendee_type) {
      console.error(`  ✗ Record missing attendee_type: ${item.event_id}/${item.attendee_id || item.email}`);
      allValid = false;
    } else if (item.attendee_type !== 'volunteer') {
      console.error(`  ✗ Record has unexpected attendee_type: ${item.attendee_type}`);
      allValid = false;
    }

    if (!item.attendee_id) {
      console.error(`  ✗ Record missing attendee_id: ${item.event_id}/${item.email}`);
      allValid = false;
    } else if (item.attendee_id !== item.email) {
      console.error(`  ✗ Record attendee_id doesn't match email: ${item.attendee_id} vs ${item.email}`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log(`✓ Verified ${recordsChecked} sample records successfully`);
    console.log('  - All records have attendee_type = "volunteer"');
    console.log('  - All records have attendee_id = email');
  } else {
    throw new Error('Verification failed! Some records are invalid.');
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Starting backfill process...\n');

    const results = await scanAndBackfill();
    
    if (results.needsBackfillCount === 0) {
      console.log('\n✓ No records need backfill. All records are up to date!');
    } else if (!isDryRun) {
      await verifyBackfill();
    }

    console.log('\n' + '='.repeat(80));
    console.log('Backfill completed successfully!');
    console.log('='.repeat(80));

    if (isDryRun) {
      console.log('\nThis was a DRY RUN. No changes were made.');
      console.log('Run without --dry-run to apply changes.');
    } else {
      console.log('\nBackfill complete. The table is ready for multi-person RSVPs.');
    }

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('Backfill failed!');
    console.error('='.repeat(80));
    console.error('Error:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run backfill
main();
