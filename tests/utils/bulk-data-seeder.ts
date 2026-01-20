import { DynamoDBClient, PutItemCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { generateTestMinor } from './data-generators';

/**
 * Bulk Data Seeder for Performance Tests
 * 
 * Provides utilities for seeding large amounts of test data directly into DynamoDB
 * for performance testing scenarios where UI-based data creation is too slow.
 */

// DynamoDB client
const getDynamoDBClient = (): DynamoDBClient => {
  return new DynamoDBClient({ region: 'us-east-1' });
};

// Get table names based on environment
const getTableName = (baseTable: string): string => {
  const env = process.env.TEST_ENV || 'local';
  switch (env) {
    case 'staging':
      return `${baseTable}-staging`;
    case 'production':
      return `${baseTable}-prod`;
    default:
      return `${baseTable}-staging`;
  }
};

/**
 * Seed bulk RSVPs for a user
 * Creates RSVP records directly in DynamoDB
 * 
 * @param email - User email
 * @param eventSlugs - Array of event slugs to RSVP to
 * @param firstName - User first name
 * @param lastName - User last name
 * @param count - Number of RSVPs to create (will cycle through events)
 * @returns Promise that resolves when all RSVPs are created
 */
export async function seedBulkRsvps(
  email: string,
  eventSlugs: string[],
  firstName: string,
  lastName: string,
  count: number
): Promise<void> {
  const client = getDynamoDBClient();
  const tableName = getTableName('event_rsvps');
  
  console.log(`Seeding ${count} RSVPs for ${email}...`);
  
  const now = new Date().toISOString();
  const normalizedEmail = email.toLowerCase().trim();
  
  // DynamoDB event_rsvps table has composite key: event_id + attendee_id
  // We can't have duplicate event_id + attendee_id combinations
  // So we need to ensure each RSVP uses a unique combination
  
  // If we have more RSVPs than events, we need to create multiple attendee IDs
  // by appending a suffix to make them unique
  const rsvpsPerEvent = Math.ceil(count / eventSlugs.length);
  
  // Create RSVPs one at a time to avoid duplicates in batch
  let createdCount = 0;
  
  for (let i = 0; i < count; i++) {
    const eventSlug = eventSlugs[i % eventSlugs.length];
    const eventRsvpIndex = Math.floor(i / eventSlugs.length);
    
    // Create unique attendee_id by appending index if needed
    const attendeeId = eventRsvpIndex === 0 
      ? normalizedEmail 
      : `${normalizedEmail}-rsvp${eventRsvpIndex}`;
    
    try {
      const command = new PutItemCommand({
        TableName: tableName,
        Item: {
          event_id: { S: eventSlug },
          attendee_id: { S: attendeeId },
          attendee_type: { S: 'volunteer' },
          guardian_email: { S: normalizedEmail },
          email: { S: normalizedEmail },
          first_name: { S: firstName },
          last_name: { S: lastName },
          rsvp_date: { S: now },
          status: { S: 'confirmed' },
          created_at: { S: now },
          updated_at: { S: now },
        }
      });
      
      await client.send(command);
      createdCount++;
      
      if (createdCount % 10 === 0) {
        console.log(`  ✅ Created ${createdCount}/${count} RSVPs...`);
      }
    } catch (error) {
      console.error(`  ❌ Failed to create RSVP ${i + 1}:`, error);
      throw error;
    }
  }
  
  console.log(`✅ Seeded ${count} RSVPs for ${email}`);
}

/**
 * Seed bulk minors for a guardian
 * Creates minor records directly in DynamoDB
 * 
 * @param guardianEmail - Guardian's email
 * @param count - Number of minors to create
 * @returns Promise that resolves when all minors are created
 */
export async function seedBulkMinors(
  guardianEmail: string,
  count: number
): Promise<void> {
  const client = getDynamoDBClient();
  const tableName = getTableName('minors');
  
  console.log(`Seeding ${count} minors for ${guardianEmail}...`);
  
  const now = new Date().toISOString();
  const normalizedEmail = guardianEmail.toLowerCase().trim();
  
  // Create minors in batches of 25 (DynamoDB BatchWriteItem limit)
  const batchSize = 25;
  const batches = Math.ceil(count / batchSize);
  
  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const batchStart = batchIndex * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, count);
    const batchCount = batchEnd - batchStart;
    
    const writeRequests = [];
    
    for (let i = 0; i < batchCount; i++) {
      const minorData = generateTestMinor();
      const minorId = `minor-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      writeRequests.push({
        PutRequest: {
          Item: {
            guardian_email: { S: normalizedEmail },
            minor_id: { S: minorId },
            first_name: { S: minorData.firstName },
            last_name: { S: minorData.lastName },
            date_of_birth: { S: minorData.dateOfBirth },
            created_at: { S: now },
            updated_at: { S: now },
          }
        }
      });
    }
    
    // Send batch write request
    try {
      const command = new BatchWriteItemCommand({
        RequestItems: {
          [tableName]: writeRequests
        }
      });
      
      await client.send(command);
      console.log(`  ✅ Batch ${batchIndex + 1}/${batches} complete (${batchCount} minors)`);
    } catch (error) {
      console.error(`  ❌ Batch ${batchIndex + 1} failed:`, error);
      throw error;
    }
  }
  
  console.log(`✅ Seeded ${count} minors for ${guardianEmail}`);
}

/**
 * Seed a complete performance test dataset
 * Creates both RSVPs and minors for comprehensive testing
 * 
 * @param email - User email
 * @param firstName - User first name
 * @param lastName - User last name
 * @param options - Seeding options
 * @returns Promise that resolves when all data is seeded
 */
export async function seedPerformanceTestData(
  email: string,
  firstName: string,
  lastName: string,
  options: {
    rsvpCount?: number;
    minorCount?: number;
    eventSlugs?: string[];
  } = {}
): Promise<void> {
  const {
    rsvpCount = 0,
    minorCount = 0,
    eventSlugs = [
      'brooke-road-and-thorny-point-road-cleanup-february-2026',
      'widewater-state-park-aquia-creek-cleanup-april-2026',
      'potomac-run-road-cleanup-june-2026',
      'crows-nest-wetlands-accokeek-creek-cleanup-may-2026',
      'widewater-state-park-potomac-river-cleanup-july-2026',
    ]
  } = options;
  
  console.log(`\n🌱 Seeding performance test data for ${email}...`);
  console.log(`   RSVPs: ${rsvpCount}, Minors: ${minorCount}`);
  
  const startTime = Date.now();
  
  try {
    // Seed RSVPs if requested
    if (rsvpCount > 0) {
      await seedBulkRsvps(email, eventSlugs, firstName, lastName, rsvpCount);
    }
    
    // Seed minors if requested
    if (minorCount > 0) {
      await seedBulkMinors(email, minorCount);
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Performance test data seeded in ${duration}ms\n`);
  } catch (error) {
    console.error('❌ Failed to seed performance test data:', error);
    throw error;
  }
}

/**
 * Clean up seeded test data
 * Removes all RSVPs and minors for a user
 * 
 * @param email - User email
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupSeededData(email: string): Promise<void> {
  const client = getDynamoDBClient();
  const normalizedEmail = email.toLowerCase().trim();
  
  console.log(`\n🧹 Cleaning up seeded data for ${email}...`);
  
  try {
    // Delete RSVPs (including those with suffixed attendee_ids)
    const rsvpTableName = getTableName('event_rsvps');
    const { ScanCommand, DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
    
    const rsvpScanResult = await client.send(new ScanCommand({
      TableName: rsvpTableName,
      FilterExpression: 'guardian_email = :email OR begins_with(attendee_id, :email)',
      ExpressionAttributeValues: {
        ':email': { S: normalizedEmail }
      }
    }));
    
    if (rsvpScanResult.Items && rsvpScanResult.Items.length > 0) {
      console.log(`  📋 Deleting ${rsvpScanResult.Items.length} RSVPs...`);
      
      for (const item of rsvpScanResult.Items) {
        await client.send(new DeleteItemCommand({
          TableName: rsvpTableName,
          Key: {
            event_id: item.event_id,
            attendee_id: item.attendee_id
          }
        }));
      }
      
      console.log(`  ✅ Deleted ${rsvpScanResult.Items.length} RSVPs`);
    }
    
    // Delete minors
    const minorTableName = getTableName('minors');
    
    const minorScanResult = await client.send(new ScanCommand({
      TableName: minorTableName,
      FilterExpression: 'guardian_email = :email',
      ExpressionAttributeValues: {
        ':email': { S: normalizedEmail }
      }
    }));
    
    if (minorScanResult.Items && minorScanResult.Items.length > 0) {
      console.log(`  👶 Deleting ${minorScanResult.Items.length} minors...`);
      
      for (const item of minorScanResult.Items) {
        await client.send(new DeleteItemCommand({
          TableName: minorTableName,
          Key: {
            guardian_email: item.guardian_email,
            minor_id: item.minor_id
          }
        }));
      }
      
      console.log(`  ✅ Deleted ${minorScanResult.Items.length} minors`);
    }
    
    console.log(`✅ Cleanup complete for ${email}\n`);
  } catch (error) {
    console.error('❌ Failed to cleanup seeded data:', error);
    // Don't throw - cleanup is best effort
  }
}
