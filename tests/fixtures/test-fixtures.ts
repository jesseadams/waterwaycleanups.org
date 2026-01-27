import { test as base } from '@playwright/test';

/**
 * Worker-isolated test data fixtures
 * 
 * Each worker gets its own set of test events to prevent race conditions
 * when multiple tests run in parallel.
 */

// Available test events from the site
const ALL_TEST_EVENTS = [
  'brooke-road-and-thorny-point-road-cleanup-february-2026',
  'widewater-state-park-aquia-creek-cleanup-april-2026',
  'potomac-run-road-cleanup-june-2026',
  'crows-nest-wetlands-accokeek-creek-cleanup-may-2026',
  'widewater-state-park-aquia-creek-cleanup-september-2026',
  'river-road-cleanup-october-2026',
  'brooke-road-and-thorny-point-road-cleanup-november-2026',
  'potomac-run-road-cleanup-december-2026',
];

export type TestFixtures = {
  /**
   * Primary test event for this worker
   * Each worker gets a unique event to prevent capacity conflicts
   */
  testEvent: string;
  
  /**
   * Array of test events for this worker
   * Useful for tests that need multiple events
   */
  testEvents: string[];
  
  /**
   * Worker index for debugging
   */
  workerIndex: number;
};

export const test = base.extend<TestFixtures>({
  workerIndex: [async ({}, use, workerInfo) => {
    await use(workerInfo.workerIndex);
  }, { scope: 'worker' }],
  
  testEvent: [async ({ workerIndex }, use) => {
    // Assign events to workers in a round-robin fashion
    const eventIndex = workerIndex % ALL_TEST_EVENTS.length;
    const event = ALL_TEST_EVENTS[eventIndex];
    
    console.log(`Worker ${workerIndex} using primary event: ${event}`);
    await use(event);
  }, { scope: 'worker' }],
  
  testEvents: [async ({ workerIndex }, use) => {
    // Give each worker a subset of events
    // Worker 0 gets events [0,1,2], Worker 1 gets events [1,2,3], etc.
    const eventsPerWorker = 3;
    const startIndex = workerIndex % ALL_TEST_EVENTS.length;
    const events: string[] = [];
    
    for (let i = 0; i < eventsPerWorker; i++) {
      const index = (startIndex + i) % ALL_TEST_EVENTS.length;
      events.push(ALL_TEST_EVENTS[index]);
    }
    
    console.log(`Worker ${workerIndex} using events: ${events.join(', ')}`);
    await use(events);
  }, { scope: 'worker' }],
});

export { expect } from '@playwright/test';
