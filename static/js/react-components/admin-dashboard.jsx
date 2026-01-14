import React, { useState, useEffect } from 'react';

const AdminDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [validationCode, setValidationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState('loading'); // 'loading', 'email', 'code', 'dashboard'
  const [activeTab, setActiveTab] = useState('events'); // 'events', 'volunteers', 'analytics'
  
  // Events state
  const [events, setEvents] = useState([]);
  const [eventFilters, setEventFilters] = useState({
    status: '',
    start_date: '',
    end_date: '',
    location: ''
  });
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventFormData, setEventFormData] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    location: { name: '', address: '' },
    attendance_cap: 50,
    status: 'active',
    hugo_config: { tags: [], preheader_is_light: false }
  });

  // Volunteers state
  const [volunteers, setVolunteers] = useState([]);
  const [volunteerFilters, setVolunteerFilters] = useState({
    search: '',
    has_waiver: '',
    experience: ''
  });
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);
  const [volunteerRSVPs, setVolunteerRSVPs] = useState([]);

  // Analytics state
  const [analytics, setAnalytics] = useState({
    totalEvents: 0,
    totalVolunteers: 0,
    totalRSVPs: 0,
    attendanceRate: 0,
    cancellationRate: 0
  });

  useEffect(() => {
    // Check if user is already authenticated
    if (window.authClient && window.authClient.isAuthenticated()) {
      setIsAuthenticated(true);
      setEmail(window.authClient.getUserEmail());
      setStep('dashboard');
      loadDashboardData();
    } else {
      setStep('email');
    }
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadEvents(),
        loadVolunteers(),
        loadAnalytics()
      ]);
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      if (!window.eventsAPI) {
        throw new Error('Events API not initialized');
      }
      
      // Set the session token for admin operations
      if (window.authClient && window.authClient.isAuthenticated()) {
        const sessionToken = window.authClient.getSessionToken();
        window.eventsAPI.setSessionToken(sessionToken);
      }
      
      const response = await window.eventsAPI.getEvents(eventFilters);
      setEvents(response.events || []);
    } catch (error) {
      console.error('Error loading events:', error);
      // Set empty array to prevent infinite loading
      setEvents([]);
      throw error;
    }
  };

  const loadVolunteers = async () => {
    try {
      if (!window.eventsAPI) {
        throw new Error('Events API not initialized');
      }
      
      // Set the session token from the auth client
      if (window.authClient && window.authClient.isAuthenticated()) {
        const sessionToken = window.authClient.getSessionToken();
        window.eventsAPI.setSessionToken(sessionToken);
      }
      
      const response = await window.eventsAPI.getVolunteers();
      setVolunteers(response.volunteers || []);
    } catch (error) {
      console.error('Error loading volunteers:', error);
      // Set empty array to prevent infinite loading
      setVolunteers([]);
      throw error;
    }
  };

  const loadAnalytics = async () => {
    try {
      // Calculate analytics from loaded data
      const totalEvents = events.length;
      const totalVolunteers = volunteers.length;
      
      // This would be replaced with actual API calls for analytics
      setAnalytics({
        totalEvents,
        totalVolunteers,
        totalRSVPs: 0, // Would be calculated from API
        attendanceRate: 0,
        cancellationRate: 0
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await window.authClient.sendValidationCode(email);
      setSuccess('Validation code sent to your email!');
      setStep('code');
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!validationCode.trim()) {
      setError('Please enter the validation code');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await window.authClient.verifyCode(email, validationCode);
      setSuccess('Successfully authenticated!');
      setIsAuthenticated(true);
      setStep('dashboard');
      loadDashboardData();
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    window.authClient.logout();
    setIsAuthenticated(false);
    setStep('email');
    setEmail('');
    setValidationCode('');
    setError('');
    setSuccess('');
  };

  const handleEventSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError('');

      if (editingEvent) {
        await window.eventsAPI.updateEvent(editingEvent.event_id, eventFormData);
        setSuccess('Event updated successfully!');
      } else {
        await window.eventsAPI.createEvent(eventFormData);
        setSuccess('Event created successfully!');
      }

      setShowEventForm(false);
      setEditingEvent(null);
      resetEventForm();
      await loadEvents();
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEventDelete = async (eventId) => {
    if (!confirm('Are you sure you want to delete this event? This will also delete all associated RSVPs.')) {
      return;
    }

    try {
      setIsLoading(true);
      await window.eventsAPI.deleteEvent(eventId);
      setSuccess('Event deleted successfully!');
      await loadEvents();
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEventEdit = (event) => {
    setEditingEvent(event);
    setEventFormData({
      title: event.title,
      description: event.description,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      attendance_cap: event.attendance_cap,
      status: event.status,
      hugo_config: event.hugo_config || { tags: [], preheader_is_light: false }
    });
    setShowEventForm(true);
  };

  const resetEventForm = () => {
    setEventFormData({
      title: '',
      description: '',
      start_time: '',
      end_time: '',
      location: { name: '', address: '' },
      attendance_cap: 50,
      status: 'active',
      hugo_config: { tags: [], preheader_is_light: false }
    });
  };

  const handleVolunteerSelect = async (volunteer) => {
    try {
      setSelectedVolunteer(volunteer);
      const response = await window.eventsAPI.getVolunteerRSVPs(volunteer.email);
      setVolunteerRSVPs(response.rsvps || []);
    } catch (error) {
      setError(error.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toISOString().slice(0, 16);
    } catch (error) {
      return '';
    }
  };

  const filteredEvents = events.filter(event => {
    if (eventFilters.status && event.status !== eventFilters.status) return false;
    if (eventFilters.location && !event.location.name.toLowerCase().includes(eventFilters.location.toLowerCase())) return false;
    return true;
  });

  const filteredVolunteers = volunteers.filter(volunteer => {
    if (volunteerFilters.search) {
      const search = volunteerFilters.search.toLowerCase();
      if (!volunteer.full_name.toLowerCase().includes(search) && 
          !volunteer.email.toLowerCase().includes(search)) return false;
    }
    return true;
  });

  // Render methods
  const renderLoadingState = () => (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <h2 className="text-2xl font-bold mb-2">Loading...</h2>
        <p className="text-gray-600">Checking your authentication status</p>
      </div>
    </div>
  );

  const renderEmailStep = () => (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-center">Admin Login</h2>
      <p className="text-gray-600 mb-6 text-center">
        Enter your admin email to receive a validation code
      </p>
      
      <form onSubmit={handleSendCode}>
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="admin@example.com"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Sending...' : 'Send Validation Code'}
        </button>
      </form>
    </div>
  );

  const renderCodeStep = () => (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-center">Enter Validation Code</h2>
      <p className="text-gray-600 mb-6 text-center">
        We sent a 6-digit code to <strong>{email}</strong>
      </p>
      
      <form onSubmit={handleVerifyCode}>
        <div className="mb-4">
          <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
            Validation Code
          </label>
          <input
            type="text"
            id="code"
            value={validationCode}
            onChange={(e) => setValidationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
            placeholder="123456"
            maxLength="6"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoading || validationCode.length !== 6}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
        >
          {isLoading ? 'Verifying...' : 'Verify Code'}
        </button>
        
        <button
          type="button"
          onClick={() => setStep('email')}
          className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
        >
          Back to Email
        </button>
      </form>
    </div>
  );

  const renderEventForm = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">
          {editingEvent ? 'Edit Event' : 'Create New Event'}
        </h3>
        
        <form onSubmit={handleEventSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Title
              </label>
              <input
                type="text"
                value={eventFormData.title}
                onChange={(e) => setEventFormData({...eventFormData, title: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={eventFormData.description}
                onChange={(e) => setEventFormData({...eventFormData, description: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="3"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time
              </label>
              <input
                type="datetime-local"
                value={formatDateForInput(eventFormData.start_time)}
                onChange={(e) => setEventFormData({...eventFormData, start_time: new Date(e.target.value).toISOString()})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Time
              </label>
              <input
                type="datetime-local"
                value={formatDateForInput(eventFormData.end_time)}
                onChange={(e) => setEventFormData({...eventFormData, end_time: new Date(e.target.value).toISOString()})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location Name
              </label>
              <input
                type="text"
                value={eventFormData.location.name}
                onChange={(e) => setEventFormData({
                  ...eventFormData, 
                  location: {...eventFormData.location, name: e.target.value}
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location Address
              </label>
              <input
                type="text"
                value={eventFormData.location.address}
                onChange={(e) => setEventFormData({
                  ...eventFormData, 
                  location: {...eventFormData.location, address: e.target.value}
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attendance Cap
              </label>
              <input
                type="number"
                value={eventFormData.attendance_cap}
                onChange={(e) => setEventFormData({...eventFormData, attendance_cap: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={eventFormData.status}
                onChange={(e) => setEventFormData({...eventFormData, status: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={() => {
                setShowEventForm(false);
                setEditingEvent(null);
                resetEventForm();
              }}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : (editingEvent ? 'Update Event' : 'Create Event')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderEventsTab = () => (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold">Event Management</h3>
        <button
          onClick={() => setShowEventForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Create New Event
        </button>
      </div>
      
      {/* Event Filters */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={eventFilters.status}
              onChange={(e) => setEventFilters({...eventFilters, status: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={eventFilters.location}
              onChange={(e) => setEventFilters({...eventFilters, location: e.target.value})}
              placeholder="Search by location..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={loadEvents}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
      
      {/* Events List */}
      <div className="space-y-4">
        {filteredEvents.map(event => (
          <div key={event.event_id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h4 className="text-lg font-semibold">{event.title}</h4>
                <p className="text-gray-600 text-sm mb-2">{event.description}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                  <div>📅 {formatDate(event.start_time)}</div>
                  <div>📍 {event.location.name}</div>
                  <div>👥 Cap: {event.attendance_cap}</div>
                </div>
                <div className="mt-2">
                  <span className={`inline-block px-2 py-1 text-xs rounded ${
                    event.status === 'active' ? 'bg-green-100 text-green-800' :
                    event.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    event.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {event.status.toUpperCase()}
                  </span>
                </div>
              </div>
              
              <div className="flex space-x-2 ml-4">
                <button
                  onClick={() => handleEventEdit(event)}
                  className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleEventDelete(event.event_id)}
                  className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {filteredEvents.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No events found matching your filters.
          </div>
        )}
      </div>
    </div>
  );

  const renderVolunteersTab = () => (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold">Volunteer Management</h3>
      </div>
      
      {/* Volunteer Filters */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={volunteerFilters.search}
              onChange={(e) => setVolunteerFilters({...volunteerFilters, search: e.target.value})}
              placeholder="Search by name or email..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
      
      {/* Volunteers List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-4">Volunteers ({filteredVolunteers.length})</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredVolunteers.map(volunteer => (
              <div
                key={volunteer.email}
                onClick={() => handleVolunteerSelect(volunteer)}
                className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                  selectedVolunteer?.email === volunteer.email ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="font-medium">{volunteer.full_name}</div>
                <div className="text-sm text-gray-600">{volunteer.email}</div>
                <div className="text-xs text-gray-500">
                  RSVPs: {volunteer.volunteer_metrics?.total_rsvps || 0} | 
                  Attended: {volunteer.volunteer_metrics?.total_attended || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          {selectedVolunteer ? (
            <div>
              <h4 className="font-semibold mb-4">Volunteer Details</h4>
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                <h5 className="font-medium">{selectedVolunteer.full_name}</h5>
                <p className="text-sm text-gray-600">{selectedVolunteer.email}</p>
                {selectedVolunteer.phone && (
                  <p className="text-sm text-gray-600">📞 {selectedVolunteer.phone}</p>
                )}
                
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Total RSVPs:</span> {selectedVolunteer.volunteer_metrics?.total_rsvps || 0}
                  </div>
                  <div>
                    <span className="font-medium">Attended:</span> {selectedVolunteer.volunteer_metrics?.total_attended || 0}
                  </div>
                  <div>
                    <span className="font-medium">Cancelled:</span> {selectedVolunteer.volunteer_metrics?.total_cancellations || 0}
                  </div>
                  <div>
                    <span className="font-medium">No Shows:</span> {selectedVolunteer.volunteer_metrics?.total_no_shows || 0}
                  </div>
                </div>
              </div>
              
              <h5 className="font-medium mb-2">RSVP History</h5>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {volunteerRSVPs.map((rsvp, index) => (
                  <div key={index} className="bg-gray-50 p-3 rounded">
                    <div className="font-medium text-sm">{rsvp.event_title || rsvp.event_id}</div>
                    <div className="text-xs text-gray-600">
                      {formatDate(rsvp.event_start_time)} | Status: {rsvp.status}
                    </div>
                  </div>
                ))}
                
                {volunteerRSVPs.length === 0 && (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No RSVP history found.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Select a volunteer to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderAnalyticsTab = () => (
    <div>
      <h3 className="text-xl font-semibold mb-6">Analytics & Reports</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h4 className="text-lg font-semibold text-gray-700">Total Events</h4>
          <p className="text-3xl font-bold text-blue-600">{analytics.totalEvents}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h4 className="text-lg font-semibold text-gray-700">Total Volunteers</h4>
          <p className="text-3xl font-bold text-green-600">{analytics.totalVolunteers}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h4 className="text-lg font-semibold text-gray-700">Total RSVPs</h4>
          <p className="text-3xl font-bold text-purple-600">{analytics.totalRSVPs}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h4 className="text-lg font-semibold text-gray-700">Attendance Rate</h4>
          <p className="text-3xl font-bold text-orange-600">{analytics.attendanceRate}%</p>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h4 className="text-lg font-semibold mb-4">Export Data</h4>
        <div className="space-x-4">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
            Export Events (CSV)
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700">
            Export Volunteers (CSV)
          </button>
          <button className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700">
            Export RSVPs (CSV)
          </button>
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center p-6 border-b">
        <div>
          <h2 className="text-2xl font-bold">Admin Dashboard</h2>
          <p className="text-gray-600">Welcome, {email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
        >
          Logout
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="border-b">
        <nav className="flex space-x-8 px-6">
          {[
            { id: 'events', label: 'Events', icon: '📅' },
            { id: 'volunteers', label: 'Volunteers', icon: '👥' },
            { id: 'analytics', label: 'Analytics', icon: '📊' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        ) : (
          <>
            {activeTab === 'events' && renderEventsTab()}
            {activeTab === 'volunteers' && renderVolunteersTab()}
            {activeTab === 'analytics' && renderAnalyticsTab()}
          </>
        )}
      </div>

      {/* Event Form Modal */}
      {showEventForm && renderEventForm()}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        {error && (
          <div className="max-w-4xl mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        {success && (
          <div className="max-w-4xl mx-auto mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        {step === 'loading' && renderLoadingState()}
        {step === 'email' && renderEmailStep()}
        {step === 'code' && renderCodeStep()}
        {step === 'dashboard' && renderDashboard()}
      </div>
    </div>
  );
};

export default AdminDashboard;