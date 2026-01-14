/**
 * Admin Demo Mode
 * Provides mock data for admin interface when APIs are not available
 */

window.AdminDemoMode = {
  enabled: false,
  
  // Enable demo mode
  enable() {
    this.enabled = true;
    console.log('🎭 Admin Demo Mode enabled - using mock data');
    this.setupMockAPI();
  },
  
  // Disable demo mode
  disable() {
    this.enabled = false;
    console.log('🎭 Admin Demo Mode disabled');
  },
  
  // Setup mock API responses
  setupMockAPI() {
    // Mock Events API
    if (window.eventsAPI) {
      const originalGetEvents = window.eventsAPI.getEvents.bind(window.eventsAPI);
      const originalGetVolunteers = window.eventsAPI.getVolunteers.bind(window.eventsAPI);
      const originalCreateEvent = window.eventsAPI.createEvent.bind(window.eventsAPI);
      const originalUpdateEvent = window.eventsAPI.updateEvent.bind(window.eventsAPI);
      const originalDeleteEvent = window.eventsAPI.deleteEvent.bind(window.eventsAPI);
      
      // Override getEvents
      window.eventsAPI.getEvents = async (filters = {}) => {
        if (!this.enabled) return originalGetEvents(filters);
        
        console.log('🎭 Demo: Returning mock events');
        return {
          events: this.getMockEvents(),
          count: this.getMockEvents().length,
          success: true
        };
      };
      
      // Override getVolunteers
      window.eventsAPI.getVolunteers = async (filters = {}) => {
        if (!this.enabled) return originalGetVolunteers(filters);
        
        console.log('🎭 Demo: Returning mock volunteers');
        return {
          volunteers: this.getMockVolunteers(),
          count: this.getMockVolunteers().length,
          success: true
        };
      };
      
      // Override createEvent
      window.eventsAPI.createEvent = async (eventData) => {
        if (!this.enabled) return originalCreateEvent(eventData);
        
        console.log('🎭 Demo: Mock event created', eventData);
        return {
          message: 'Event created successfully (demo mode)',
          event: { ...eventData, event_id: `demo-event-${Date.now()}` },
          success: true
        };
      };
      
      // Override updateEvent
      window.eventsAPI.updateEvent = async (eventId, eventData) => {
        if (!this.enabled) return originalUpdateEvent(eventId, eventData);
        
        console.log('🎭 Demo: Mock event updated', eventId, eventData);
        return {
          message: 'Event updated successfully (demo mode)',
          event: { ...eventData, event_id: eventId },
          success: true
        };
      };
      
      // Override deleteEvent
      window.eventsAPI.deleteEvent = async (eventId) => {
        if (!this.enabled) return originalDeleteEvent(eventId);
        
        console.log('🎭 Demo: Mock event deleted', eventId);
        return {
          message: 'Event deleted successfully (demo mode)',
          deleted_event: { event_id: eventId },
          success: true
        };
      };
    }
  },
  
  // Generate mock events data
  getMockEvents() {
    return [
      {
        event_id: 'demo-potomac-cleanup-march-2026',
        title: 'Potomac River Cleanup - March 2026',
        description: 'Join us for a spring cleanup along the Potomac River. We\'ll be focusing on the shoreline areas and removing debris that has accumulated over the winter months.',
        start_time: '2026-03-15T09:00:00Z',
        end_time: '2026-03-15T12:00:00Z',
        location: {
          name: 'Widewater State Park',
          address: '1430 Widewater Beach Rd, Stafford, VA 22554'
        },
        attendance_cap: 50,
        status: 'active',
        created_at: '2026-01-12T15:46:17Z',
        updated_at: '2026-01-12T15:46:17Z',
        hugo_config: {
          tags: ['potomac-river', 'state-park', 'cleanup'],
          preheader_is_light: false
        }
      },
      {
        event_id: 'demo-aquia-creek-cleanup-april-2026',
        title: 'Aquia Creek Cleanup - April 2026',
        description: 'Help us clean up Aquia Creek and its surrounding wetlands. This is a great opportunity for families and experienced volunteers alike.',
        start_time: '2026-04-20T08:30:00Z',
        end_time: '2026-04-20T11:30:00Z',
        location: {
          name: 'Aquia Landing',
          address: '2846 Brooke Rd, Stafford, VA 22554'
        },
        attendance_cap: 30,
        status: 'active',
        created_at: '2026-01-10T10:30:00Z',
        updated_at: '2026-01-10T10:30:00Z',
        hugo_config: {
          tags: ['aquia-creek', 'wetlands', 'family-friendly'],
          preheader_is_light: true
        }
      },
      {
        event_id: 'demo-completed-cleanup-january-2026',
        title: 'Winter Cleanup - January 2026',
        description: 'Our first cleanup of the year was a great success! Thank you to all volunteers who participated.',
        start_time: '2026-01-15T10:00:00Z',
        end_time: '2026-01-15T13:00:00Z',
        location: {
          name: 'Potomac Creek',
          address: '123 Creek Rd, Stafford, VA 22556'
        },
        attendance_cap: 25,
        status: 'completed',
        created_at: '2025-12-20T14:00:00Z',
        updated_at: '2026-01-16T09:00:00Z',
        hugo_config: {
          tags: ['potomac-creek', 'winter', 'completed'],
          preheader_is_light: false
        }
      }
    ];
  },
  
  // Generate mock volunteers data
  getMockVolunteers() {
    return [
      {
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        phone: '+1-555-0123',
        emergency_contact: 'Jane Doe +1-555-0124',
        dietary_restrictions: 'None',
        volunteer_experience: 'Experienced',
        how_did_you_hear: 'Website',
        created_at: '2025-06-15T10:00:00Z',
        updated_at: '2026-01-10T15:30:00Z',
        profile_complete: true,
        volunteer_metrics: {
          total_rsvps: 8,
          total_attended: 7,
          total_cancellations: 1,
          total_no_shows: 0,
          first_event_date: '2025-07-01T09:00:00Z',
          last_event_date: '2026-01-15T10:00:00Z'
        }
      },
      {
        email: 'sarah.smith@example.com',
        first_name: 'Sarah',
        last_name: 'Smith',
        full_name: 'Sarah Smith',
        phone: '+1-555-0456',
        emergency_contact: 'Mike Smith +1-555-0457',
        dietary_restrictions: 'Vegetarian',
        volunteer_experience: 'Some Experience',
        how_did_you_hear: 'Friend referral',
        created_at: '2025-08-20T14:00:00Z',
        updated_at: '2025-12-05T11:20:00Z',
        profile_complete: true,
        volunteer_metrics: {
          total_rsvps: 5,
          total_attended: 4,
          total_cancellations: 1,
          total_no_shows: 0,
          first_event_date: '2025-09-10T09:00:00Z',
          last_event_date: '2025-12-15T10:00:00Z'
        }
      },
      {
        email: 'admin@waterwaycleanups.org',
        first_name: 'Admin',
        last_name: 'User',
        full_name: 'Admin User',
        phone: '+1-555-0789',
        emergency_contact: 'Emergency Contact +1-555-0790',
        dietary_restrictions: 'None',
        volunteer_experience: 'Very Experienced',
        how_did_you_hear: 'Organization staff',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2026-01-12T12:00:00Z',
        profile_complete: true,
        volunteer_metrics: {
          total_rsvps: 15,
          total_attended: 14,
          total_cancellations: 1,
          total_no_shows: 0,
          first_event_date: '2025-02-01T09:00:00Z',
          last_event_date: '2026-01-15T10:00:00Z'
        }
      }
    ];
  }
};

// Auto-enable demo mode if we detect API issues
window.addEventListener('eventsAPIError', function(event) {
  console.warn('Events API error detected:', event.detail.error);
  console.log('🎭 Consider enabling demo mode: window.AdminDemoMode.enable()');
});

// Provide easy access for debugging
window.enableAdminDemo = () => window.AdminDemoMode.enable();
window.disableAdminDemo = () => window.AdminDemoMode.disable();