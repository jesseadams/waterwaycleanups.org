#!/usr/bin/env node

/**
 * Clear Test RSVPs from DynamoDB
 * 
 * This script deletes all RSVP records from test users in the event_rsvps-staging table.
 * Test users are identified by email addresses containing '@waterwaycleanups-test.org'
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'event_rsvps-staging';
const REGION = 'us-east-1';

// Create DynamoDB client
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function clearTestRsvps() {
  console.log(`🔍 Scanning ${TABLE_NAME} for test RSVPs...`);
  
  let deletedCount = 0;
  let scannedCount = 0;
  let lastEvaluatedKey = undefined;
  
  do {
    // Scan the table
    const scanParams = {
      TableName: TABLE_NAME,
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
    };
    
    const scanResult = await docClient.send(new ScanCommand(scanParams));
    scannedCount += scanResult.Items.length;
    
    // Filter for test RSVPs
    const testRsvps = scanResult.Items.filter(item => 
      item.attendee_id && (
        item.attendee_id.includes('@waterwaycleanups-test.org') ||
        item.email?.includes('@waterwaycleanups-test.org')
      )
    );
    
    console.log(`📋 Found ${testRsvps.length} test RSVPs in this batch (${scannedCount} total scanned)`);
    
    // Delete each test RSVP
    for (const rsvp of testRsvps) {
      try {
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            event_id: rsvp.event_id,
            attendee_id: rsvp.attendee_id
          }
        }));
        
        deletedCount++;
        console.log(`  ✓ Deleted: ${rsvp.attendee_id} from ${rsvp.event_id}`);
      } catch (error) {
        console.error(`  ✗ Failed to delete ${rsvp.attendee_id}:`, error.message);
      }
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Scanned: ${scannedCount} records`);
  console.log(`   Deleted: ${deletedCount} test RSVPs`);
}

// Run the cleanup
clearTestRsvps()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
