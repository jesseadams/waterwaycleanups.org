/**
 * Direct DynamoDB cleanup utilities for faster test setup
 * Bypasses browser UI to speed up test execution
 */

import { DynamoDBClient, QueryCommand, DeleteItemCommand, PutItemCommand, BatchWriteItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

// Get AWS region from environment or default to us-east-1
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Get table names from environment variables with fallback defaults
const TABLE_NAMES = {
  WAIVERS: process.env.DYNAMODB_WAIVERS_TABLE || 'waivers-staging',
  VALIDATION_CODES: process.env.DYNAMODB_VALIDATION_CODES_TABLE || 'validation_codes-staging',
  EVENT_RSVPS: process.env.DYNAMODB_EVENT_RSVPS_TABLE || 'event_rsvps-staging',
  MINORS: process.env.DYNAMODB_MINORS_TABLE || 'minors-staging',
  USER_SESSIONS: process.env.DYNAMODB_USER_SESSIONS_TABLE || 'user_sessions-staging',
};

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });

// Log table configuration on first import (helpful for debugging)
if (process.env.DEBUG === 'true') {
  console.log('DynamoDB Configuration:', {
    region: AWS_REGION,
    tables: TABLE_NAMES
  });
}

export interface TestUser {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string; // Optional for backward compatibility
  phoneNumber?: string; // Support both field names
}

/**
 * Export table names for use in other utilities
 */
export { TABLE_NAMES };

/**
 * Delete all RSVPs for a specific event (FAST - uses Query instead of Scan)
 * Since event_id is the partition key, this is much faster than scanning
 */
export async function cleanupEventRSVPs(eventId: string, tableName?: string): Promise<number> {
  const table = tableName || TABLE_NAMES.EVENT_RSVPS;
  
  // Use Query instead of Scan - event_id is the partition key
  const queryResult = await dynamoClient.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: 'event_id = :eventId',
    ExpressionAttributeValues: {
      ':eventId': { S: eventId }
    }
  }));

  if (!queryResult.Items || queryResult.Items.length === 0) {
    return 0;
  }

  // Batch delete for efficiency
  const deleteRequests = queryResult.Items.map(item => ({
    DeleteRequest: {
      Key: {
        event_id: item.event_id,
        attendee_id: item.attendee_id
      }
    }
  }));

  // DynamoDB batch write limit is 25 items
  for (let i = 0; i < deleteRequests.length; i += 25) {
    const batch = deleteRequests.slice(i, i + 25);
    await dynamoClient.send(new BatchWriteItemCommand({
      RequestItems: {
        [table]: batch
      }
    }));
  }

  return queryResult.Items.length;
}

/**
 * Delete all minors for a specific user
 */
export async function cleanupUserMinors(email: string, tableName?: string): Promise<number> {
  const table = tableName || TABLE_NAMES.MINORS;
  
  const scanResult = await dynamoClient.send(new ScanCommand({
    TableName: table,
    FilterExpression: 'parent_email = :email',
    ExpressionAttributeValues: {
      ':email': { S: email }
    }
  }));

  if (!scanResult.Items || scanResult.Items.length === 0) {
    return 0;
  }

  const deleteRequests = scanResult.Items.map(item => ({
    DeleteRequest: {
      Key: {
        parent_email: item.parent_email,
        minor_id: item.minor_id
      }
    }
  }));

  for (let i = 0; i < deleteRequests.length; i += 25) {
    const batch = deleteRequests.slice(i, i + 25);
    await dynamoClient.send(new BatchWriteItemCommand({
      RequestItems: {
        [table]: batch
      }
    }));
  }

  return scanResult.Items.length;
}

/**
 * Create a waiver directly in DynamoDB (bypasses UI)
 */
export async function createWaiverDirectly(
  email: string,
  waiverData: any,
  tableName?: string
): Promise<void> {
  const table = tableName || TABLE_NAMES.WAIVERS;
  const timestamp = new Date().toISOString();
  
  // Validate that all required fields have values
  if (!email || !waiverData.firstName || !waiverData.lastName || !waiverData.phone) {
    throw new Error('Missing required waiver fields: email, firstName, lastName, or phone');
  }
  
  // Build item with only non-empty values
  const item: any = {
    email: { S: email },
    first_name: { S: waiverData.firstName },
    last_name: { S: waiverData.lastName },
    phone: { S: waiverData.phone },
    agreed_to_terms: { BOOL: true },
    created_at: { S: timestamp },
    updated_at: { S: timestamp }
  };
  
  // Add optional fields only if they have values
  if (waiverData.emergencyContactName) {
    item.emergency_contact_name = { S: waiverData.emergencyContactName };
  }
  if (waiverData.emergencyContactPhone) {
    item.emergency_contact_phone = { S: waiverData.emergencyContactPhone };
  }
  if (waiverData.signature) {
    item.signature = { S: waiverData.signature };
  }
  
  await dynamoClient.send(new PutItemCommand({
    TableName: table,
    Item: item
  }));
}

/**
 * Create a validation code directly in DynamoDB (bypasses email)
 */
export async function createValidationCodeDirectly(
  email: string,
  code: string,
  tableName?: string
): Promise<void> {
  const table = tableName || TABLE_NAMES.VALIDATION_CODES;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
  
  await dynamoClient.send(new PutItemCommand({
    TableName: table,
    Item: {
      email: { S: email },
      code: { S: code },
      expires_at: { S: expiresAt },
      created_at: { S: new Date().toISOString() }
    }
  }));
}

/**
 * Complete fast authentication setup: waiver + validation code
 * This replaces the slow browser-based authenticateFreshUserWithWaiver
 */
export async function setupFastAuth(testUser: TestUser, testCode: string): Promise<void> {
  const waiverData = {
    firstName: testUser.firstName,
    lastName: testUser.lastName,
    phone: testUser.phone || testUser.phoneNumber, // Support both field names
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '555-0199',
    signature: `${testUser.firstName} ${testUser.lastName}`
  };

  // Create waiver and validation code in parallel
  await Promise.all([
    createWaiverDirectly(testUser.email, waiverData),
    createValidationCodeDirectly(testUser.email, testCode)
  ]);
}

/**
 * Clean up all test data for a user
 */
export async function cleanupUserData(email: string): Promise<void> {
  await Promise.all([
    cleanupUserMinors(email),
    // Add other cleanup as needed
  ]);
}
