#!/usr/bin/env node

/**
 * Migration Script: Event RSVPs Multi-Person Support
 * 
 * This script migrates the event_rsvps table to support multi-person RSVPs:
 * 1. Changes the sort key from 'email' to 'attendee_id'
 * 2. Adds new fields: attendee_type, guardian_email, age
 * 3. Adds guardian-email-index GSI for querying minors by guardian
 * 4. Backfills existing records with attendee_type="volunteer" and attendee_id=email
 * 
 * Requirements: 7.5, 8.3
 * 
 * Usage:
 *   node scripts/migrate-event-rsvps-multi-person.js [--dry-run] [--table-suffix=SUFFIX]
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
const dynamodb = new AWS.DynamoDB({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION || 'us-east-1' });

const OLD_TABLE_NAME = `event_rsvps${tableSuffix}`;
const NEW_TABLE_NAME = `event_rsvps_new${tableSuffix}`;

console.log('='.repeat(80));
console.log('Event RSVPs Multi-Person Migration');
console.log('='.repeat(80));
console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
console.log(`Old Table: ${OLD_TABLE_NAME}`);
console.log(`New Table: ${NEW_TABLE_NAME}`);
console.log('='.repeat(80));
console.log('');

/**
 * Step 1: Create new table with updated schema
 */
async function createNewTable() {
  console.log('Step 1: Creating new table with updated schema...');
  
  if (isDryRun) {
    console.log('[DRY RUN] Would create table:', NEW_TABLE_NAME);
    console.log('[DRY RUN] Schema:');
    console.log('  - Hash Key: event_id');
    console.log('  - Range Key: attendee_id (changed from email)');
    console.log('  - GSI: email-index (hash: email)');
    console.log('  - GSI: guardian-email-index (hash: guardian_email, range: event_id)');
    return;
  }

  const params = {
    TableName: NEW_TABLE_NAME,
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'event_id', KeyType: 'HASH' },
      { AttributeName: 'attendee_id', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'event_id', AttributeType: 'S' },
      { AttributeName: 'attendee_id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
      { AttributeName: 'guardian_email', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'email-index',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'guardian-email-index',
        KeySchema: [
          { AttributeName: 'guardian_email', KeyType: 'HASH' },
          { AttributeName: 'event_id', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' }
      }
    ],
    PointInTimeRecoverySpecification: {
      PointInTimeRecoveryEnabled: true
    },
    Tags: [
      { Key: 'Environment', Value: process.env.ENVIRONMENT || 'development' },
      { Key: 'Project', Value: 'waterwaycleanups' },
      { Key: 'Schema', Value: 'event-rsvps-table.json' },
      { Key: 'Migration', Value: 'multi-person-rsvp' }
    ]
  };

  try {
    await dynamodb.createTable(params).promise();
    console.log('✓ New table created successfully');
    
    // Wait for table to be active
    console.log('  Waiting for table to become active...');
    await dynamodb.waitFor('tableExists', { TableName: NEW_TABLE_NAME }).promise();
    console.log('✓ Table is active');
  } catch (error) {
    if (error.code === 'ResourceInUseException') {
      console.log('✓ Table already exists');
    } else {
      throw error;
    }
  }
}

/**
 * Step 2: Scan and migrate all records from old table to new table
 */
async function migrateRecords() {
  console.log('\nStep 2: Migrating records from old table to new table...');
  
  let scannedCount = 0;
  let migratedCount = 0;
  let lastEvaluatedKey = null;

  do {
    const scanParams = {
      TableName: OLD_TABLE_NAME,
      Limit: 100
    };

    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    try {
      const scanResult = await docClient.scan(scanParams).promise();
      scannedCount += scanResult.Items.length;

      if (scanResult.Items.length > 0) {
        console.log(`  Scanned ${scannedCount} records...`);

        for (const item of scanResult.Items) {
          // Transform record for new schema
          const migratedItem = {
            ...item,
            // Set attendee_id to email for existing volunteer RSVPs
            attendee_id: item.email,
            // Set attendee_type to 'volunteer' for all existing records
            attendee_type: 'volunteer',
            // Preserve all existing fields
            // Note: guardian_email and age will be undefined for volunteer RSVPs
          };

          if (isDryRun) {
            if (migratedCount < 3) {
              console.log('[DRY RUN] Would migrate record:');
              console.log('  Old:', JSON.stringify(item, null, 2));
              console.log('  New:', JSON.stringify(migratedItem, null, 2));
            }
          } else {
            await docClient.put({
              TableName: NEW_TABLE_NAME,
              Item: migratedItem
            }).promise();
          }

          migratedCount++;
        }
      }

      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } catch (error) {
      console.error('Error scanning/migrating records:', error);
      throw error;
    }
  } while (lastEvaluatedKey);

  console.log(`✓ Migration complete: ${migratedCount} records ${isDryRun ? 'would be' : ''} migrated`);
}

/**
 * Step 3: Verify migration
 */
async function verifyMigration() {
  console.log('\nStep 3: Verifying migration...');

  if (isDryRun) {
    console.log('[DRY RUN] Would verify:');
    console.log('  - Record counts match');
    console.log('  - All records have attendee_type="volunteer"');
    console.log('  - All records have attendee_id=email');
    console.log('  - GSI queries work correctly');
    return;
  }

  // Count records in both tables
  const oldCount = await docClient.scan({
    TableName: OLD_TABLE_NAME,
    Select: 'COUNT'
  }).promise();

  const newCount = await docClient.scan({
    TableName: NEW_TABLE_NAME,
    Select: 'COUNT'
  }).promise();

  console.log(`  Old table count: ${oldCount.Count}`);
  console.log(`  New table count: ${newCount.Count}`);

  if (oldCount.Count !== newCount.Count) {
    throw new Error('Record counts do not match!');
  }

  // Sample a few records to verify transformation
  const sampleRecords = await docClient.scan({
    TableName: NEW_TABLE_NAME,
    Limit: 5
  }).promise();

  let allValid = true;
  for (const item of sampleRecords.Items) {
    if (item.attendee_type !== 'volunteer') {
      console.error(`  ✗ Record missing attendee_type: ${item.event_id}/${item.attendee_id}`);
      allValid = false;
    }
    if (item.attendee_id !== item.email) {
      console.error(`  ✗ Record attendee_id doesn't match email: ${item.event_id}/${item.attendee_id}`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log('✓ Sample records verified successfully');
  } else {
    throw new Error('Verification failed!');
  }

  // Test GSI queries
  try {
    const testEmail = sampleRecords.Items[0]?.email;
    if (testEmail) {
      const emailIndexResult = await docClient.query({
        TableName: NEW_TABLE_NAME,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': testEmail
        },
        Limit: 1
      }).promise();
      console.log('✓ email-index query successful');
    }
  } catch (error) {
    console.error('✗ GSI query test failed:', error.message);
    throw error;
  }
}

/**
 * Step 4: Swap tables (rename old to backup, new to production)
 */
async function swapTables() {
  console.log('\nStep 4: Swapping tables...');

  if (isDryRun) {
    console.log('[DRY RUN] Would perform table swap:');
    console.log(`  1. Rename ${OLD_TABLE_NAME} to ${OLD_TABLE_NAME}_backup_${Date.now()}`);
    console.log(`  2. Rename ${NEW_TABLE_NAME} to ${OLD_TABLE_NAME}`);
    console.log('\nNote: DynamoDB does not support table renaming.');
    console.log('In production, you would:');
    console.log('  1. Update Terraform to use new schema');
    console.log('  2. Apply Terraform changes (creates new table)');
    console.log('  3. Run this migration to copy data');
    console.log('  4. Update application to use new table');
    console.log('  5. Delete old table after verification period');
    return;
  }

  console.log('⚠ Table swapping requires manual steps:');
  console.log('  1. Update your Terraform configuration to use the new schema');
  console.log('  2. Run terraform apply to update the table definition');
  console.log('  3. The old table will be backed up automatically by Terraform');
  console.log('  4. Monitor the application for any issues');
  console.log(`  5. After verification, delete the backup table: ${OLD_TABLE_NAME}_backup`);
}

/**
 * Main migration function
 */
async function main() {
  try {
    console.log('Starting migration...\n');

    await createNewTable();
    await migrateRecords();
    await verifyMigration();
    await swapTables();

    console.log('\n' + '='.repeat(80));
    console.log('Migration completed successfully!');
    console.log('='.repeat(80));

    if (isDryRun) {
      console.log('\nThis was a DRY RUN. No changes were made.');
      console.log('Run without --dry-run to apply changes.');
    } else {
      console.log('\nNext steps:');
      console.log('1. Verify the application works with the new table');
      console.log('2. Monitor for any issues');
      console.log('3. After 7 days, delete the old table backup');
    }

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('Migration failed!');
    console.error('='.repeat(80));
    console.error('Error:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run migration
main();
