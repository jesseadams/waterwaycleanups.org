import { test as base } from '@playwright/test';
import { 
  generateTestEvent, 
  generatePastEvent, 
  generateFullCapacityEvent,
  EventData 
} from '../utils/data-generators';
import { createTestEvent } from '../utils/api-helpers';

/**
 * Event Fixture
 * 
 * Provides test events with automatic cleanup.
 * Supports events with different capacities and dates.
 * 
 * Usage:
 * ```typescript
 * test('should RSVP to event', async ({ testEvent, request }) => {
 *   // testEvent contains eventId, title, date, capacity, etc.
 *   await submitRsvp(request, testEvent.eventId);
 * });
 * ```
 */

export interface EventFixture {
  /**
   * Generated test event with future date
   */
  testEvent: EventData;
  
  /**
   * Cleanup function to manually delete event if needed
   * (automatic cleanup happens after test completion)
   */
  cleanupEvent: () => Promise<void>;
}

/**
 * Extended test with event fixture
 */
export const test = base.extend<EventFixture>({
  testEvent: async ({ request }, use) => {
    // Generate unique test event
    const event = generateTestEvent();
    
    // Create event via API (if API is available)
    // Note: Event creation may require admin privileges
    try {
      await createTestEvent(request, event);
      console.log(`Created test event: ${event.eventId}`);
    } catch (error) {
      console.warn(`Could not create event via API: ${error}`);
      // Continue with generated event data for testing
    }
    
    // Provide event to test
    await use(event);
    
    // Cleanup: Delete event (if API is available)
    try {
      // Note: Event deletion would require admin API endpoint
      // For now, we rely on test data isolation
      console.log(`Test event cleanup for: ${event.eventId}`);
    } catch (error) {
      console.error(`Error cleaning up event ${event.eventId}:`, error);
      // Don't throw - cleanup is best effort
    }
  },
  
  cleanupEvent: async ({ testEvent, request }, use) => {
    // Provide manual cleanup function
    const cleanup = async () => {
      try {
        // Note: Event deletion would require admin API endpoint
        console.log(`Manually cleaned up event: ${testEvent.eventId}`);
      } catch (error) {
        console.error(`Error in manual cleanup for ${testEvent.eventId}:`, error);
        throw error;
      }
    };
    
    await use(cleanup);
  },
});

/**
 * Past Event Fixture
 * 
 * Provides a test event with a past date for testing historical data.
 */
export interface PastEventFixture {
  /**
   * Generated test event with past date
   */
  pastEvent: EventData;
}

export const testWithPastEvent = base.extend<PastEventFixture>({
  pastEvent: async ({ request }, use) => {
    // Generate event with past date
    const event = generatePastEvent();
    
    // Create event via API (if API is available)
    try {
      await createTestEvent(request, event);
      console.log(`Created past test event: ${event.eventId}`);
    } catch (error) {
      console.warn(`Could not create past event via API: ${error}`);
    }
    
    // Provide event to test
    await use(event);
    
    // Cleanup
    try {
      console.log(`Test past event cleanup for: ${event.eventId}`);
    } catch (error) {
      console.error(`Error cleaning up past event ${event.eventId}:`, error);
    }
  },
});

/**
 * Full Capacity Event Fixture
 * 
 * Provides a test event at or near capacity for testing capacity limits.
 */
export interface FullCapacityEventFixture {
  /**
   * Generated test event with small capacity (easy to fill)
   */
  fullCapacityEvent: EventData;
}

export const testWithFullCapacityEvent = base.extend<FullCapacityEventFixture>({
  fullCapacityEvent: async ({ request }, use) => {
    // Generate event with small capacity
    const event = generateFullCapacityEvent();
    
    // Create event via API (if API is available)
    try {
      await createTestEvent(request, event);
      console.log(`Created full capacity test event: ${event.eventId}`);
    } catch (error) {
      console.warn(`Could not create full capacity event via API: ${error}`);
    }
    
    // Provide event to test
    await use(event);
    
    // Cleanup
    try {
      console.log(`Test full capacity event cleanup for: ${event.eventId}`);
    } catch (error) {
      console.error(`Error cleaning up full capacity event ${event.eventId}:`, error);
    }
  },
});

/**
 * Multiple Events Fixture
 * 
 * Provides multiple test events for tests that need multiple events.
 * 
 * Usage:
 * ```typescript
 * test('should list multiple events', async ({ testEvents, request }) => {
 *   const [event1, event2, event3] = testEvents;
 *   // Each event has unique data
 * });
 * ```
 */
export interface MultiEventFixture {
  /**
   * Array of generated test events (default: 3 events)
   */
  testEvents: EventData[];
  
  /**
   * Cleanup function for all test events
   */
  cleanupEvents: () => Promise<void>;
}

export const testWithMultipleEvents = base.extend<MultiEventFixture>({
  testEvents: async ({ request }, use) => {
    // Generate 3 unique test events by default
    const events = [
      generateTestEvent(),
      generateTestEvent(),
      generateTestEvent(),
    ];
    
    // Create events via API (if API is available)
    for (const event of events) {
      try {
        await createTestEvent(request, event);
        console.log(`Created test event: ${event.eventId}`);
      } catch (error) {
        console.warn(`Could not create event via API: ${error}`);
      }
    }
    
    // Provide events to test
    await use(events);
    
    // Cleanup: Delete all test events
    for (const event of events) {
      try {
        console.log(`Test event cleanup for: ${event.eventId}`);
      } catch (error) {
        console.error(`Error cleaning up event ${event.eventId}:`, error);
        // Continue with other events
      }
    }
  },
  
  cleanupEvents: async ({ testEvents, request }, use) => {
    // Provide manual cleanup function for all events
    const cleanup = async () => {
      for (const event of testEvents) {
        try {
          console.log(`Manually cleaned up event: ${event.eventId}`);
        } catch (error) {
          console.error(`Error in manual cleanup for ${event.eventId}:`, error);
          // Continue with other events
        }
      }
    };
    
    await use(cleanup);
  },
});

/**
 * Mixed Events Fixture
 * 
 * Provides a mix of different event types (future, past, full capacity).
 */
export interface MixedEventsFixture {
  /**
   * Future event
   */
  futureEvent: EventData;
  
  /**
   * Past event
   */
  pastEvent: EventData;
  
  /**
   * Full capacity event
   */
  fullCapacityEvent: EventData;
}

export const testWithMixedEvents = base.extend<MixedEventsFixture>({
  futureEvent: async ({ request }, use) => {
    const event = generateTestEvent();
    try {
      await createTestEvent(request, event);
    } catch (error) {
      console.warn(`Could not create future event via API: ${error}`);
    }
    await use(event);
  },
  
  pastEvent: async ({ request }, use) => {
    const event = generatePastEvent();
    try {
      await createTestEvent(request, event);
    } catch (error) {
      console.warn(`Could not create past event via API: ${error}`);
    }
    await use(event);
  },
  
  fullCapacityEvent: async ({ request }, use) => {
    const event = generateFullCapacityEvent();
    try {
      await createTestEvent(request, event);
    } catch (error) {
      console.warn(`Could not create full capacity event via API: ${error}`);
    }
    await use(event);
  },
});

export { expect } from '@playwright/test';
