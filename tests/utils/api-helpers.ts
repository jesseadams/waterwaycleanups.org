import { APIRequestContext } from '@playwright/test';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

/**
 * API Helper utilities for direct API calls in tests
 * Provides functions for authentication, data setup, verification, and cleanup
 */

// Environment-specific API base URL
const getApiBaseUrl = (): string => {
  const env = process.env.TEST_ENV || 'local';
  
  switch (env) {
    case 'staging':
      return 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/staging';
    case 'production':
      return 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/prod';
    case 'local':
    case 'ci':
    default:
      // For local/CI, use staging APIs
      return 'https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/staging';
  }
};

const API_BASE_URL = getApiBaseUrl();

// DynamoDB client for test data setup
const getDynamoDBClient = (): DynamoDBClient => {
  return new DynamoDBClient({ region: 'us-east-1' });
};

// Get the auth table name based on environment
const getAuthTableName = (): string => {
  const env = process.env.TEST_ENV || 'local';
  switch (env) {
    case 'staging':
      return 'auth_codes-staging';
    case 'production':
      return 'auth_codes-prod';
    default:
      return 'auth_codes-staging';
  }
};

/**
 * Authentication API Helpers
 */

/**
 * Insert a test validation code directly into DynamoDB for testing purposes
 * This allows tests to use a known validation code for successful authentication
 * @param email - Email address to associate with the code
 * @param validationCode - The validation code to insert
 * @param expirationMinutes - How many minutes until the code expires (default: 15)
 */
export async function insertTestValidationCode(
  email: string,
  validationCode: string,
  expirationMinutes: number = 15
): Promise<void> {
  const client = getDynamoDBClient();
  const tableName = getAuthTableName();
  
  const now = new Date();
  const expirationTime = new Date(now.getTime() + expirationMinutes * 60000);
  
  const command = new PutItemCommand({
    TableName: tableName,
    Item: {
      email: { S: email.toLowerCase().trim() },
      validation_code: { S: validationCode },
      expiration_time: { S: expirationTime.toISOString() },
      created_at: { S: now.toISOString() },
      attempts: { N: '0' },
      ttl: { N: Math.floor(expirationTime.getTime() / 1000).toString() }
    }
  });
  
  try {
    await client.send(command);
    console.log(`Test validation code inserted for ${email}: ${validationCode}`);
  } catch (error) {
    console.error(`Failed to insert test validation code:`, error);
    throw error;
  }
}

/**
 * Send a validation code to an email address
 * @param request - Playwright API request context
 * @param email - Email address to send code to
 * @returns The validation code (for testing purposes, we'll need to retrieve it)
 */
export async function sendValidationCode(
  request: APIRequestContext,
  email: string
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/auth-send-code`, {
    data: { email },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to send validation code: ${response.status()} - ${body}`);
  }
}

/**
 * Generate a 6-digit validation code for testing
 * This mimics the server-side code generation logic
 * @returns A 6-digit validation code string
 */
export function generateValidationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Verify a validation code and get session token
 * @param request - Playwright API request context
 * @param email - Email address
 * @param code - Validation code
 * @returns Session token
 */
export async function verifyCode(
  request: APIRequestContext,
  email: string,
  code: string
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/auth-verify-code`, {
    data: { email, code },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to verify code: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.sessionToken;
}

/**
 * Validate an existing session token
 * @param request - Playwright API request context
 * @param sessionToken - Session token to validate
 * @returns User email if valid
 */
export async function validateSession(
  request: APIRequestContext,
  sessionToken: string
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/auth-validate-session`, {
    data: { sessionToken },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to validate session: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.email;
}

/**
 * Waiver API Helpers
 */

export interface WaiverData {
  email: string;
  fullLegalName: string;
  phoneNumber: string;
  dateOfBirth: string;
  waiverAcknowledgement: boolean;
  adultSignature?: string;
  adultTodaysDate?: string;
}

/**
 * Create a test waiver
 * @param request - Playwright API request context
 * @param waiverData - Waiver form data
 * @param sessionToken - Session token for authentication
 */
export async function createTestWaiver(
  request: APIRequestContext,
  waiverData: WaiverData,
  sessionToken: string
): Promise<void> {
  // Convert camelCase to snake_case for API
  const apiPayload = {
    session_token: sessionToken,
    full_legal_name: waiverData.fullLegalName,
    phone_number: waiverData.phoneNumber,
    date_of_birth: waiverData.dateOfBirth,
    waiver_acknowledgement: waiverData.waiverAcknowledgement,
    adult_signature: waiverData.adultSignature,
    adult_todays_date: waiverData.adultTodaysDate,
  };

  const response = await request.post(`${API_BASE_URL}/submit-volunteer-waiver`, {
    data: apiPayload,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to create waiver: ${response.status()} - ${body}`);
  }
}

/**
 * Get waiver status for a user
 * @param request - Playwright API request context
 * @param email - User email
 * @returns Waiver status information
 */
export async function getWaiverStatus(
  request: APIRequestContext,
  email: string
): Promise<{
  hasWaiver: boolean;
  expirationDate: string | null;
  submissionDate: string | null;
}> {
  const response = await request.post(`${API_BASE_URL}/check-volunteer-waiver`, {
    data: { email },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to get waiver status: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return {
    hasWaiver: data.hasWaiver || false,
    expirationDate: data.expirationDate || null,
    submissionDate: data.submissionDate || null,
  };
}

/**
 * Event RSVP API Helpers
 */

export interface EventData {
  eventId: string;
  title: string;
  date: string;
  capacity: number;
  location: string;
}

/**
 * Note: Event creation is typically done through admin APIs
 * For testing, we'll work with existing events or mock event data
 * This is a placeholder for future implementation if needed
 */
export async function createTestEvent(
  request: APIRequestContext,
  eventData: EventData
): Promise<string> {
  // This would require admin API access
  // For now, return the eventId as-is
  console.warn('createTestEvent: Using provided eventId, actual event creation not implemented');
  return eventData.eventId;
}

/**
 * Submit an RSVP for an event
 * @param request - Playwright API request context
 * @param email - User email
 * @param eventId - Event ID
 * @param firstName - First name
 * @param lastName - Last name
 * @param sessionToken - Session token for authentication
 */
export async function submitEventRsvp(
  request: APIRequestContext,
  email: string,
  eventId: string,
  firstName: string,
  lastName: string,
  sessionToken: string
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/submit-event-rsvp`, {
    data: {
      email,
      event_id: eventId,
      first_name: firstName,
      last_name: lastName,
      session_token: sessionToken,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to submit RSVP: ${response.status()} - ${body}`);
  }
}

/**
 * Get RSVP count for an event
 * @param request - Playwright API request context
 * @param eventId - Event ID
 * @returns Number of RSVPs
 */
export async function getRsvpCount(
  request: APIRequestContext,
  eventId: string
): Promise<number> {
  const response = await request.post(`${API_BASE_URL}/check-event-rsvp`, {
    data: { eventId },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to get RSVP count: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.attendanceCount || 0;
}

/**
 * Get user dashboard data
 * @param request - Playwright API request context
 * @param email - User email
 * @param sessionToken - Session token for authentication
 * @returns Dashboard data including RSVPs, waiver status, and minors
 */
export async function getUserDashboard(
  request: APIRequestContext,
  email: string,
  sessionToken: string
): Promise<any> {
  const response = await request.post(`${API_BASE_URL}/user-dashboard`, {
    data: { 
      email,
      session_token: sessionToken,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to get user dashboard: ${response.status()} - ${body}`);
  }

  return await response.json();
}

/**
 * Minors API Helpers
 */

export interface MinorData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email?: string;
}

/**
 * Add a minor to a guardian's account
 * @param request - Playwright API request context
 * @param guardianEmail - Guardian's email
 * @param minorData - Minor's data
 * @param sessionToken - Session token for authentication
 * @returns Minor ID
 */
export async function addMinor(
  request: APIRequestContext,
  guardianEmail: string,
  minorData: MinorData,
  sessionToken: string
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/minors-add`, {
    data: {
      guardianEmail,
      ...minorData,
      session_token: sessionToken,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to add minor: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.minorId;
}

/**
 * List minors for a guardian
 * @param request - Playwright API request context
 * @param guardianEmail - Guardian's email
 * @param sessionToken - Session token for authentication
 * @returns List of minors
 */
export async function listMinors(
  request: APIRequestContext,
  guardianEmail: string,
  sessionToken: string
): Promise<any[]> {
  const response = await request.post(`${API_BASE_URL}/minors-list`, {
    data: { 
      guardianEmail,
      session_token: sessionToken,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to list minors: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.minors || [];
}

/**
 * Delete a minor
 * @param request - Playwright API request context
 * @param guardianEmail - Guardian's email
 * @param minorId - Minor ID to delete
 * @param sessionToken - Session token for authentication
 */
export async function deleteMinor(
  request: APIRequestContext,
  guardianEmail: string,
  minorId: string,
  sessionToken: string
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/minors-delete`, {
    data: {
      guardianEmail,
      minorId,
      session_token: sessionToken,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to delete minor: ${response.status()} - ${body}`);
  }
}

/**
 * Cleanup Utilities
 */

/**
 * Cancel an RSVP for a specific attendee
 * @param request - Playwright API request context
 * @param eventId - Event ID
 * @param attendeeId - Attendee ID (email for volunteer, minor_id for minor)
 * @param attendeeType - Type of attendee ('volunteer' or 'minor')
 * @param sessionToken - Session token for authentication
 */
export async function cancelRsvp(
  request: APIRequestContext,
  eventId: string,
  attendeeId: string,
  attendeeType: 'volunteer' | 'minor',
  sessionToken: string
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/cancel-event-rsvp`, {
    data: {
      session_token: sessionToken,
      event_id: eventId,
      attendee_id: attendeeId,
      attendee_type: attendeeType,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to cancel RSVP: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Failed to cancel RSVP: ${data.message || 'Unknown error'}`);
  }
}

/**
 * Get all RSVPs for a user from the dashboard
 * @param request - Playwright API request context
 * @param sessionToken - Session token for authentication
 */
export async function getUserRsvps(
  request: APIRequestContext,
  sessionToken: string
): Promise<any[]> {
  const response = await request.post(`${API_BASE_URL}/user-dashboard`, {
    data: {
      session_token: sessionToken,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to get user dashboard: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.rsvps || [];
}

/**
 * Delete all test data for a user
 * This includes waiver, RSVPs, minors, and session data
 * @param request - Playwright API request context
 * @param email - User email
 * @param sessionToken - Session token for authentication (may be expired)
 */
export async function deleteTestData(
  request: APIRequestContext,
  email: string,
  sessionToken: string
): Promise<void> {
  console.log(`\n🧹 Starting cleanup for ${email}...`);
  
  try {
    // Delete RSVPs directly from DynamoDB (session token may be expired)
    try {
      console.log('  📋 Deleting RSVPs directly from DynamoDB...');
      
      const dynamoClient = getDynamoDBClient();
      const tableName = 'event_rsvps-staging';
      
      // Scan for all RSVPs with this email as attendee_id or guardian_email
      const { ScanCommand, DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
      const scanResult = await dynamoClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: 'attendee_id = :email OR guardian_email = :email',
        ExpressionAttributeValues: {
          ':email': { S: email }
        }
      }));
      
      if (scanResult.Items && scanResult.Items.length > 0) {
        console.log(`  📋 Found ${scanResult.Items.length} RSVPs to delete`);
        
        for (const item of scanResult.Items) {
          try {
            await dynamoClient.send(new DeleteItemCommand({
              TableName: tableName,
              Key: {
                event_id: item.event_id,
                attendee_id: item.attendee_id
              }
            }));
            console.log(`  ✅ Deleted RSVP: ${item.attendee_id.S} from ${item.event_id.S}`);
          } catch (error) {
            console.error(`  ❌ Error deleting RSVP:`, error);
          }
        }
      } else {
        console.log('  📋 No RSVPs found to delete');
      }
    } catch (error) {
      console.error('  ❌ Error deleting RSVPs from DynamoDB:', error);
      // Continue with other cleanup
    }

    // Delete minors directly from DynamoDB
    try {
      console.log('  👶 Deleting minors directly from DynamoDB...');
      
      const dynamoClient = getDynamoDBClient();
      const tableName = 'minors-staging';
      
      const { ScanCommand, DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
      const scanResult = await dynamoClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: 'guardian_email = :email',
        ExpressionAttributeValues: {
          ':email': { S: email }
        }
      }));
      
      if (scanResult.Items && scanResult.Items.length > 0) {
        console.log(`  👶 Found ${scanResult.Items.length} minors to delete`);
        
        for (const item of scanResult.Items) {
          try {
            await dynamoClient.send(new DeleteItemCommand({
              TableName: tableName,
              Key: {
                guardian_email: item.guardian_email,
                minor_id: item.minor_id
              }
            }));
            console.log(`  ✅ Deleted minor: ${item.minor_id.S}`);
          } catch (error) {
            console.error(`  ❌ Error deleting minor:`, error);
          }
        }
      } else {
        console.log('  👶 No minors found to delete');
      }
    } catch (error) {
      console.error('  ❌ Error deleting minors from DynamoDB:', error);
    }

    console.log(`✅ Cleanup complete for ${email}\n`);
  } catch (error) {
    console.error(`❌ Error cleaning up test data for ${email}:`, error);
    // Don't throw - cleanup is best effort
  }
}

/**
 * Clear session data (client-side operation, not API)
 * This is a helper for page-based cleanup
 */
export function getSessionStorageKey(): string {
  return 'sessionToken';
}
