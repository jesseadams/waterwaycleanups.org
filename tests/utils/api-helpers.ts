import { APIRequestContext, Page } from '@playwright/test';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';

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

// Get the volunteer waivers table name based on environment
const getVolunteerWaiversTableName = (): string => {
  const env = process.env.TEST_ENV || 'local';
  switch (env) {
    case 'staging':
      return 'volunteer_waivers-staging';
    case 'production':
      return 'volunteer_waivers-prod';
    default:
      return 'volunteer_waivers-staging';
  }
};

// Get the event RSVPs table name based on environment
const getEventRsvpsTableName = (): string => {
  const env = process.env.TEST_ENV || 'local';
  switch (env) {
    case 'staging':
      return 'event_rsvps-staging';
    case 'production':
      return 'event_rsvps-prod';
    default:
      return 'event_rsvps-staging';
  }
};

// Get the events table name based on environment
const getEventsTableName = (): string => {
  const env = process.env.TEST_ENV || 'local';
  switch (env) {
    case 'staging':
      return 'events-staging';
    case 'production':
      return 'events-prod';
    default:
      return 'events-staging';
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
 * Set waiver expiration date directly in DynamoDB for testing purposes
 * This allows tests to simulate expired or expiring waivers
 * @param email - Email address of the volunteer
 * @param expirationDate - ISO date string for the new expiration date
 */
export async function setWaiverExpiration(
  email: string,
  expirationDate: string
): Promise<void> {
  const client = getDynamoDBClient();
  const tableName = getVolunteerWaiversTableName();
  
  try {
    // First, get the waiver_id for this email
    const { QueryCommand } = await import('@aws-sdk/client-dynamodb');
    const queryResult = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': { S: email.toLowerCase().trim() }
      },
      Limit: 1
    }));
    
    if (!queryResult.Items || queryResult.Items.length === 0) {
      throw new Error(`No waiver found for email: ${email}`);
    }
    
    const waiverId = queryResult.Items[0].waiver_id.S;
    
    // Update the expiration date
    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: {
        email: { S: email.toLowerCase().trim() },
        waiver_id: { S: waiverId! }
      },
      UpdateExpression: 'SET expiration_date = :expiration',
      ExpressionAttributeValues: {
        ':expiration': { S: expirationDate }
      }
    });
    
    await client.send(command);
    console.log(`Waiver expiration updated for ${email}: ${expirationDate}`);
  } catch (error) {
    console.error(`Failed to set waiver expiration:`, error);
    throw error;
  }
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
 * Create a test event directly in DynamoDB for testing purposes
 * This allows tests to create events with specific dates and properties
 * @param eventData - Event data including id, title, date, capacity, location
 * @returns Event ID
 */
export async function createTestEvent(
  eventData: EventData
): Promise<string> {
  const client = getDynamoDBClient();
  const tableName = getEventsTableName();
  
  try {
    const now = new Date().toISOString();
    
    // Create a slug from the event ID if not provided
    const slug = eventData.eventId;
    
    const command = new PutItemCommand({
      TableName: tableName,
      Item: {
        event_id: { S: eventData.eventId },
        title: { S: eventData.title },
        date: { S: eventData.date },
        capacity: { N: eventData.capacity.toString() },
        location: { S: eventData.location },
        slug: { S: slug },
        status: { S: 'active' },
        created_at: { S: now },
        updated_at: { S: now },
        // Add default fields that might be expected
        description: { S: `Test event: ${eventData.title}` },
        start_time: { S: '09:00' },
        end_time: { S: '12:00' },
        attendance_count: { N: '0' }
      }
    });
    
    await client.send(command);
    console.log(`✅ Test event created: ${eventData.eventId}`);
    return eventData.eventId;
  } catch (error) {
    console.error(`Failed to create test event:`, error);
    throw error;
  }
}

/**
 * Delete a test event from DynamoDB
 * This cleans up test events after tests complete
 * @param eventId - Event ID to delete
 */
export async function deleteTestEvent(eventId: string): Promise<void> {
  const client = getDynamoDBClient();
  const tableName = getEventsTableName();
  
  try {
    const { DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
    
    const command = new DeleteItemCommand({
      TableName: tableName,
      Key: {
        event_id: { S: eventId }
      }
    });
    
    await client.send(command);
    console.log(`✅ Test event deleted: ${eventId}`);
  } catch (error) {
    console.error(`Failed to delete test event:`, error);
    // Don't throw - cleanup is best effort
  }
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
 * Create a multi-person RSVP directly in DynamoDB for testing purposes
 * This allows tests to set up multi-person RSVP scenarios
 * @param guardianEmail - Guardian's email address
 * @param eventId - Event ID
 * @param attendees - Array of attendee IDs (email for guardian, minor_id for minors)
 */
export async function createMultiPersonRsvp(
  guardianEmail: string,
  eventId: string,
  attendees: string[]
): Promise<void> {
  const client = getDynamoDBClient();
  const tableName = getEventRsvpsTableName();
  
  try {
    const now = new Date().toISOString();
    
    for (const attendeeId of attendees) {
      const isGuardian = attendeeId === guardianEmail;
      const attendeeType = isGuardian ? 'volunteer' : 'minor';
      
      const command = new PutItemCommand({
        TableName: tableName,
        Item: {
          event_id: { S: eventId },
          attendee_id: { S: attendeeId },
          attendee_type: { S: attendeeType },
          guardian_email: { S: guardianEmail.toLowerCase().trim() },
          email: { S: guardianEmail.toLowerCase().trim() },
          rsvp_date: { S: now },
          status: { S: 'confirmed' }
        }
      });
      
      await client.send(command);
      console.log(`Multi-person RSVP created: ${attendeeId} for event ${eventId}`);
    }
  } catch (error) {
    console.error(`Failed to create multi-person RSVP:`, error);
    throw error;
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
 * Get event capacity from DynamoDB
 * This retrieves the maximum capacity for an event
 * @param eventId - Event ID
 * @returns Event capacity number
 */
export async function getEventCapacity(eventId: string): Promise<number> {
  const client = getDynamoDBClient();
  const tableName = getEventsTableName();
  
  try {
    const command = new GetItemCommand({
      TableName: tableName,
      Key: {
        event_id: { S: eventId }
      }
    });
    
    const result = await client.send(command);
    
    if (!result.Item) {
      throw new Error(`Event not found: ${eventId}`);
    }
    
    // Capacity can be stored as N (number) or S (string)
    const capacity = result.Item.capacity?.N || result.Item.capacity?.S;
    
    if (!capacity) {
      throw new Error(`Event ${eventId} does not have a capacity field`);
    }
    
    return parseInt(capacity, 10);
  } catch (error) {
    console.error(`Failed to get event capacity:`, error);
    throw error;
  }
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
 * Network Simulation Utilities
 */

/**
 * Simulate network failure by setting the page to offline mode
 * This allows testing of offline/network error scenarios
 * @param page - Playwright Page object
 */
export async function simulateNetworkFailure(page: Page): Promise<void> {
  try {
    // Set the browser context to offline mode
    await page.context().setOffline(true);
    console.log('Network failure simulated - page is now offline');
  } catch (error) {
    console.error('Failed to simulate network failure:', error);
    throw error;
  }
}

/**
 * Restore network connection after simulating failure
 * @param page - Playwright Page object
 */
export async function restoreNetwork(page: Page): Promise<void> {
  try {
    // Restore the browser context to online mode
    await page.context().setOffline(false);
    console.log('Network connection restored - page is now online');
  } catch (error) {
    console.error('Failed to restore network:', error);
    throw error;
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
