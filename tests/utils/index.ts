/**
 * Test Utilities Index
 * Central export point for all test utilities
 */

// API Helpers
export {
  sendValidationCode,
  verifyCode,
  validateSession,
  createTestWaiver,
  getWaiverStatus,
  createTestEvent,
  submitEventRsvp,
  getRsvpCount,
  getUserDashboard,
  addMinor,
  listMinors,
  deleteMinor,
  deleteTestData,
  getSessionStorageKey,
} from './api-helpers';

// Export API helper types with aliases to avoid conflicts
export type {
  WaiverData,
  EventData as ApiEventData,
  MinorData as ApiMinorData,
} from './api-helpers';

// Wait and Network Helpers
export * from './wait-helpers';

// Data Generators
export {
  generateTestUser,
  generateTestUsers,
  generateWaiverData,
  generateIncompleteWaiverData,
  generateTestEvent,
  generatePastEvent,
  generateFullCapacityEvent,
  generateTestEvents,
  generateTestMinor,
  generateTestMinors,
  generateInvalidMinor,
  generateRsvpData,
  generateValidationCode,
  generateExpiredValidationCode,
  generateSessionToken,
  getDateFromNow,
  getTodayDate,
  getDateOneYearFromNow,
  calculateAge,
} from './data-generators';

// Export data generator types
export type {
  TestUser,
  WaiverFormData,
  EventData,
  MinorData,
  RsvpData,
} from './data-generators';

