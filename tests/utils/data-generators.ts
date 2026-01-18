/**
 * Test Data Generators
 * Provides utilities for generating unique test data for users, waivers, events, and minors
 */

/**
 * Generate a unique timestamp-based identifier
 */
function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random element from an array
 */
function randomElement<T>(array: T[]): T {
  return array[randomInt(0, array.length - 1)];
}

/**
 * User Data Generator
 */

export interface TestUser {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
}

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey',
  'Riley', 'Avery', 'Quinn', 'Sage', 'River',
  'Dakota', 'Skyler', 'Phoenix', 'Rowan', 'Kai'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones',
  'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'
];

/**
 * Generate a unique test user with random data
 * @param overrides - Optional overrides for specific fields
 * @returns Test user data
 */
export function generateTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const uniqueId = generateUniqueId();
  const firstName = overrides.firstName || randomElement(FIRST_NAMES);
  const lastName = overrides.lastName || randomElement(LAST_NAMES);
  
  // Generate date of birth for adult (guaranteed to be 18+ years old)
  // Subtract 18-80 years AND ensure birthday has already passed this year
  const age = randomInt(18, 80);
  const today = new Date();
  const birthDate = new Date(today);
  birthDate.setFullYear(today.getFullYear() - age);
  
  // Subtract an additional 1-365 days to ensure they've already had their birthday
  const additionalDays = randomInt(1, 365);
  birthDate.setDate(birthDate.getDate() - additionalDays);
  
  const birthYear = birthDate.getFullYear();
  const birthMonth = String(birthDate.getMonth() + 1).padStart(2, '0');
  const birthDay = String(birthDate.getDate()).padStart(2, '0');
  const dateOfBirth = `${birthYear}-${birthMonth}-${birthDay}`;
  
  // Generate phone number
  const areaCode = randomInt(200, 999);
  const prefix = randomInt(200, 999);
  const lineNumber = randomInt(1000, 9999);
  const phoneNumber = `${areaCode}-${prefix}-${lineNumber}`;
  
  return {
    email: `test-${uniqueId}@waterwaycleanups-test.org`,
    firstName,
    lastName,
    dateOfBirth,
    phoneNumber,
    ...overrides,
  };
}

/**
 * Generate multiple unique test users
 * @param count - Number of users to generate
 * @returns Array of test users
 */
export function generateTestUsers(count: number): TestUser[] {
  return Array.from({ length: count }, () => generateTestUser());
}

/**
 * Waiver Data Generator
 */

export interface WaiverFormData {
  fullLegalName: string;
  phoneNumber: string;
  dateOfBirth: string;
  waiverAcknowledgement: boolean;
  adultSignature?: string;
  adultTodaysDate?: string;
}

/**
 * Generate waiver data from user data
 * @param user - Test user data
 * @param overrides - Optional overrides for specific fields
 * @returns Waiver form data
 */
export function generateWaiverData(
  user: TestUser,
  overrides: Partial<WaiverFormData> = {}
): WaiverFormData {
  const today = new Date().toISOString().split('T')[0];
  
  return {
    fullLegalName: `${user.firstName} ${user.lastName}`,
    phoneNumber: user.phoneNumber,
    dateOfBirth: user.dateOfBirth,
    waiverAcknowledgement: true,
    adultSignature: `${user.firstName} ${user.lastName}`,
    adultTodaysDate: today,
    ...overrides,
  };
}

/**
 * Generate waiver data with missing fields (for validation testing)
 * @param missingFields - Array of field names to omit
 * @returns Partial waiver form data
 */
export function generateIncompleteWaiverData(
  missingFields: string[] = []
): Partial<WaiverFormData> {
  const user = generateTestUser();
  const completeData = generateWaiverData(user);
  
  const incompleteData: any = { ...completeData };
  
  for (const field of missingFields) {
    delete incompleteData[field];
  }
  
  return incompleteData;
}

/**
 * Generate waiver data with past expiration date (for testing expired waivers)
 * @param user - Test user data
 * @returns Waiver form data with past expiration
 */
export function generateExpiredWaiver(user: TestUser): WaiverFormData {
  // Generate waiver with date from 2 years ago (well past 1-year expiration)
  const pastDate = new Date();
  pastDate.setFullYear(pastDate.getFullYear() - 2);
  const expiredDate = pastDate.toISOString().split('T')[0];
  
  return generateWaiverData(user, {
    adultTodaysDate: expiredDate,
  });
}

/**
 * Generate waiver data expiring in N days (for testing expiration warnings)
 * @param days - Number of days until expiration
 * @param user - Test user data
 * @returns Waiver form data expiring in N days
 */
export function generateWaiverExpiringIn(days: number, user: TestUser): WaiverFormData {
  // Calculate the submission date that would result in expiration in N days
  // If waiver expires in N days, it was submitted (365 - N) days ago
  const submissionDate = new Date();
  submissionDate.setDate(submissionDate.getDate() - (365 - days));
  
  const submissionDateStr = submissionDate.toISOString().split('T')[0];
  
  return generateWaiverData(user, {
    adultTodaysDate: submissionDateStr,
  });
}

/**
 * Event Data Generator
 */

export interface EventData {
  eventId: string;
  title: string;
  date: string;
  displayDate: string;
  capacity: number;
  location: string;
  description?: string;
}

const EVENT_LOCATIONS = [
  'Anacostia River',
  'Potomac River',
  'Rock Creek',
  'Chesapeake Bay',
  'Tidal Basin',
  'Washington Channel',
  'Georgetown Waterfront',
  'National Harbor'
];

const EVENT_TYPES = [
  'Waterway Cleanup',
  'Beach Cleanup',
  'River Restoration',
  'Park Cleanup',
  'Trail Maintenance'
];

/**
 * Generate a test event
 * @param overrides - Optional overrides for specific fields
 * @returns Event data
 */
export function generateTestEvent(overrides: Partial<EventData> = {}): EventData {
  const uniqueId = generateUniqueId();
  const location = randomElement(EVENT_LOCATIONS);
  const eventType = randomElement(EVENT_TYPES);
  
  // Generate future date (1-90 days from now)
  const daysFromNow = randomInt(1, 90);
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + daysFromNow);
  
  const year = eventDate.getFullYear();
  const month = String(eventDate.getMonth() + 1).padStart(2, '0');
  const day = String(eventDate.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  
  // Format display date
  const displayDate = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return {
    eventId: `event-${uniqueId}`,
    title: `${eventType} at ${location}`,
    date,
    displayDate,
    capacity: randomInt(10, 50),
    location,
    description: `Join us for a ${eventType.toLowerCase()} at ${location}. Help keep our waterways clean!`,
    ...overrides,
  };
}

/**
 * Generate a past event (for testing historical data)
 * @param daysAgo - Number of days in the past (default: random 1-365)
 * @param overrides - Optional overrides for specific fields
 * @returns Event data with past date
 */
export function generatePastEvent(daysAgo?: number, overrides: Partial<EventData> = {}): EventData {
  const daysInPast = daysAgo !== undefined ? daysAgo : randomInt(1, 365);
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() - daysInPast);
  
  const year = eventDate.getFullYear();
  const month = String(eventDate.getMonth() + 1).padStart(2, '0');
  const day = String(eventDate.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  
  const displayDate = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return generateTestEvent({
    date,
    displayDate,
    ...overrides,
  });
}

/**
 * Generate an event within the 24-hour cancellation window (for testing time restrictions)
 * @param overrides - Optional overrides for specific fields
 * @returns Event data within 24 hours
 */
export function generateEventWithinCancellationWindow(overrides: Partial<EventData> = {}): EventData {
  // Generate event 12 hours from now (within 24-hour window)
  const hoursFromNow = randomInt(1, 23);
  const eventDate = new Date();
  eventDate.setHours(eventDate.getHours() + hoursFromNow);
  
  const year = eventDate.getFullYear();
  const month = String(eventDate.getMonth() + 1).padStart(2, '0');
  const day = String(eventDate.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  
  const displayDate = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return generateTestEvent({
    date,
    displayDate,
    ...overrides,
  });
}

/**
 * Generate an event outside the 24-hour cancellation window (for testing cancellation allowed)
 * @param overrides - Optional overrides for specific fields
 * @returns Event data more than 24 hours away
 */
export function generateEventOutsideCancellationWindow(overrides: Partial<EventData> = {}): EventData {
  // Generate event 25-90 days from now (well outside 24-hour window)
  const daysFromNow = randomInt(2, 90);
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + daysFromNow);
  
  const year = eventDate.getFullYear();
  const month = String(eventDate.getMonth() + 1).padStart(2, '0');
  const day = String(eventDate.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  
  const displayDate = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return generateTestEvent({
    date,
    displayDate,
    ...overrides,
  });
}

/**
 * Generate an event at capacity (for testing capacity limits)
 * @param overrides - Optional overrides for specific fields
 * @returns Event data with capacity set to a small number
 */
export function generateFullCapacityEvent(overrides: Partial<EventData> = {}): EventData {
  return generateTestEvent({
    capacity: 1, // Small capacity for easy testing
    ...overrides,
  });
}

/**
 * Generate multiple test events
 * @param count - Number of events to generate
 * @returns Array of event data
 */
export function generateTestEvents(count: number): EventData[] {
  return Array.from({ length: count }, () => generateTestEvent());
}

/**
 * Minor Data Generator
 */

export interface MinorData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email?: string;
}

/**
 * Generate a test minor
 * @param overrides - Optional overrides for specific fields
 * @returns Minor data
 */
export function generateTestMinor(overrides: Partial<MinorData> = {}): MinorData {
  const firstName = randomElement(FIRST_NAMES);
  const lastName = randomElement(LAST_NAMES);
  
  // Generate date of birth for minor (1-17 years old)
  const age = randomInt(1, 17);
  const birthYear = new Date().getFullYear() - age;
  const birthMonth = String(randomInt(1, 12)).padStart(2, '0');
  const birthDay = String(randomInt(1, 28)).padStart(2, '0');
  const dateOfBirth = `${birthYear}-${birthMonth}-${birthDay}`;
  
  return {
    firstName,
    lastName,
    dateOfBirth,
    ...overrides,
  };
}

/**
 * Generate multiple test minors
 * @param count - Number of minors to generate
 * @returns Array of minor data
 */
export function generateTestMinors(count: number): MinorData[] {
  return Array.from({ length: count }, () => generateTestMinor());
}

/**
 * Generate a minor with invalid date of birth (for validation testing)
 * @param invalidType - Type of invalid date ('future', 'adult', 'invalid-format')
 * @returns Minor data with invalid date of birth
 */
export function generateInvalidMinor(
  invalidType: 'future' | 'adult' | 'invalid-format' = 'future'
): MinorData {
  const minor = generateTestMinor();
  
  switch (invalidType) {
    case 'future':
      // Future date
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      minor.dateOfBirth = futureDate.toISOString().split('T')[0];
      break;
      
    case 'adult':
      // Adult age (18+)
      const adultDate = new Date();
      adultDate.setFullYear(adultDate.getFullYear() - 20);
      minor.dateOfBirth = adultDate.toISOString().split('T')[0];
      break;
      
    case 'invalid-format':
      // Invalid format
      minor.dateOfBirth = '13/32/2020';
      break;
  }
  
  return minor;
}

/**
 * RSVP Data Generator
 */

export interface RsvpData {
  firstName: string;
  lastName: string;
  eventId: string;
  email: string;
}

/**
 * Generate RSVP data from user and event
 * @param user - Test user data
 * @param event - Event data
 * @returns RSVP data
 */
export function generateRsvpData(user: TestUser, event: EventData): RsvpData {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    eventId: event.eventId,
    email: user.email,
  };
}

/**
 * Validation Code Generator
 */

/**
 * Generate a 6-digit validation code
 * @returns 6-digit code as string
 */
export function generateValidationCode(): string {
  return String(randomInt(100000, 999999));
}

/**
 * Generate an expired validation code (for testing)
 * Note: This is a mock - actual expiration is handled server-side
 * @returns 6-digit code as string
 */
export function generateExpiredValidationCode(): string {
  return '000000'; // Mock expired code
}

/**
 * Session Token Generator
 */

/**
 * Generate a mock session token
 * @returns Session token string
 */
export function generateSessionToken(): string {
  return `session-${generateUniqueId()}`;
}

/**
 * Date Helpers
 */

/**
 * Get date string for N days from now
 * @param days - Number of days from now (negative for past)
 * @returns Date string in YYYY-MM-DD format
 */
export function getDateFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date string
 * @returns Date string in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  return getDateFromNow(0);
}

/**
 * Get date one year from now
 * @returns Date string in YYYY-MM-DD format
 */
export function getDateOneYearFromNow(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Calculate age from date of birth
 * @param dateOfBirth - Date of birth in YYYY-MM-DD format
 * @returns Age in years
 */
export function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}
