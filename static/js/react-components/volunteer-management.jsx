import React, { useState, useEffect } from 'react';

const VolunteerManagement = ({ 
  volunteers = [], 
  onVolunteerUpdate,
  onLoadVolunteerRSVPs,
  isLoading = false 
}) => {
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);
  const [volunteerRSVPs, setVolunteerRSVPs] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    hasWaiver: '',
    experience: '',
    sortBy: 'name'
  });
  const [showVolunteerDetails, setShowVolunteerDetails] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState(null);
  const [volunteerFormData, setVolunteerFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    emergency_contact: '',
    dietary_restrictions: '',
    volunteer_experience: '',
    how_did_you_hear: ''
  });

  const handleVolunteerSelect = async (volunteer) => {
    setSelectedVolunteer(volunteer);
    setShowVolunteerDetails(true);
    
    try {
      if (onLoadVolunteerRSVPs) {
        const rsvps = await onLoadVolunteerRSVPs(volunteer.email);
        setVolunteerRSVPs(rsvps);
      }
    } catch (error) {
      console.error('Error loading volunteer RSVPs:', error);
    }
  };

  const handleVolunteerEdit = (volunteer) => {
    setEditingVolunteer(volunteer);
    setVolunteerFormData({
      first_name: volunteer.first_name || '',
      last_name: volunteer.last_name || '',
      email: volunteer.email || '',
      phone: volunteer.phone || '',
      emergency_contact: volunteer.emergency_contact || '',
      dietary_restrictions: volunteer.dietary_restrictions || '',
      volunteer_experience: volunteer.volunteer_experience || '',
      how_did_you_hear: volunteer.how_did_you_hear || ''
    });
  };

  const handleVolunteerSave = async () => {
    try {
      if (onVolunteerUpdate) {
        await onVolunteerUpdate(editingVolunteer.email, volunteerFormData);
        setEditingVolunteer(null);
        // Refresh the selected volunteer data
        if (selectedVolunteer && selectedVolunteer.email === editingVolunteer.email) {
          setSelectedVolunteer({ ...selectedVolunteer, ...volunteerFormData });
        }
      }
    } catch (error) {
      console.error('Error updating volunteer:', error);
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

  const getVolunteerStats = (volunteer) => {
    const metrics = volunteer.volunteer_metrics || {};
    return {
      totalRSVPs: metrics.total_rsvps || 0,
      totalAttended: metrics.total_attended || 0,
      totalCancellations: metrics.total_cancellations || 0,
      totalNoShows: metrics.total_no_shows || 0,
      attendanceRate: metrics.total_rsvps > 0 
        ? Math.round((metrics.total_attended / metrics.total_rsvps) * 100) 
        : 0
    };
  };

  const filteredVolunteers = volunteers.filter(volunteer => {
    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const matchesName = volunteer.full_name?.toLowerCase().includes(search);
      const matchesEmail = volunteer.email?.toLowerCase().includes(search);
      if (!matchesName && !matchesEmail) return false;
    }

    // Experience filter
    if (filters.experience && volunteer.volunteer_experience !== filters.experience) {
      return false;
    }

    return true;
  }).sort((a, b) => {
    switch (filters.sortBy) {
      case 'name':
        return (a.full_name || '').localeCompare(b.full_name || '');
      case 'email':
        return (a.email || '').localeCompare(b.email || '');
      case 'rsvps':
        return (b.volunteer_metrics?.total_rsvps || 0) - (a.volunteer_metrics?.total_rsvps || 0);
      case 'attendance':
        const aRate = a.volunteer_metrics?.total_rsvps > 0 
          ? (a.volunteer_metrics.total_attended / a.volunteer_metrics.total_rsvps) 
          : 0;
        const bRate = b.volunteer_metrics?.total_rsvps > 0 
          ? (b.volunteer_metrics.total_attended / b.volunteer_metrics.total_rsvps) 
          : 0;
        return bRate - aRate;
      default:
        return 0;
    }
  });

  const renderVolunteerCard = (volunteer) => {
    const stats = getVolunteerStats(volunteer);
    
    return (
      <div
        key={volunteer.email}
        onClick={() => handleVolunteerSelect(volunteer)}
        className={`p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
          selectedVolunteer?.email === volunteer.email ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
        }`}
      >
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="font-semibold text-lg">{volunteer.full_name || 'Unknown Name'}</h4>
            <p className="text-sm text-gray-600">{volunteer.email}</p>
            {volunteer.phone && (
              <p className="text-sm text-gray-600">📞 {volunteer.phone}</p>
            )}
          </div>
          <div className="text-right text-sm">
            <div className="font-medium text-blue-600">{stats.totalRSVPs} RSVPs</div>
            <div className="text-gray-600">{stats.attendanceRate}% attendance</div>
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-2 text-xs text-gray-600">
          <div>
            <span className="font-medium">Attended:</span> {stats.totalAttended}
          </div>
          <div>
            <span className="font-medium">Cancelled:</span> {stats.totalCancellations}
          </div>
          <div>
            <span className="font-medium">No Shows:</span> {stats.totalNoShows}
          </div>
          <div>
            <span className="font-medium">Experience:</span> {volunteer.volunteer_experience || 'N/A'}
          </div>
        </div>
        
        {volunteer.created_at && (
          <div className="text-xs text-gray-500 mt-2">
            Joined: {formatDate(volunteer.created_at)}
          </div>
        )}
      </div>
    );
  };

  const renderVolunteerDetails = () => {
    if (!selectedVolunteer) return null;
    
    const stats = getVolunteerStats(selectedVolunteer);
    
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-xl font-bold">{selectedVolunteer.full_name}</h3>
            <p className="text-gray-600">{selectedVolunteer.email}</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleVolunteerEdit(selectedVolunteer)}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
            >
              Edit Profile
            </button>
            <button
              onClick={() => setShowVolunteerDetails(false)}
              className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-400"
            >
              Close
            </button>
          </div>
        </div>

        {/* Volunteer Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h4 className="font-semibold mb-3">Contact Information</h4>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Email:</span> {selectedVolunteer.email}</div>
              <div><span className="font-medium">Phone:</span> {selectedVolunteer.phone || 'Not provided'}</div>
              <div><span className="font-medium">Emergency Contact:</span> {selectedVolunteer.emergency_contact || 'Not provided'}</div>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-3">Volunteer Details</h4>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Experience:</span> {selectedVolunteer.volunteer_experience || 'Not specified'}</div>
              <div><span className="font-medium">Dietary Restrictions:</span> {selectedVolunteer.dietary_restrictions || 'None specified'}</div>
              <div><span className="font-medium">How they heard about us:</span> {selectedVolunteer.how_did_you_hear || 'Not specified'}</div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="mb-6">
          <h4 className="font-semibold mb-3">Participation Statistics</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-2xl font-bold text-blue-600">{stats.totalRSVPs}</div>
              <div className="text-sm text-gray-600">Total RSVPs</div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="text-2xl font-bold text-green-600">{stats.totalAttended}</div>
              <div className="text-sm text-gray-600">Attended</div>
            </div>
            <div className="bg-yellow-50 p-3 rounded">
              <div className="text-2xl font-bold text-yellow-600">{stats.totalCancellations}</div>
              <div className="text-sm text-gray-600">Cancelled</div>
            </div>
            <div className="bg-red-50 p-3 rounded">
              <div className="text-2xl font-bold text-red-600">{stats.totalNoShows}</div>
              <div className="text-sm text-gray-600">No Shows</div>
            </div>
            <div className="bg-purple-50 p-3 rounded">
              <div className="text-2xl font-bold text-purple-600">{stats.attendanceRate}%</div>
              <div className="text-sm text-gray-600">Attendance Rate</div>
            </div>
          </div>
        </div>

        {/* RSVP History */}
        <div>
          <h4 className="font-semibold mb-3">RSVP History ({volunteerRSVPs.length})</h4>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {volunteerRSVPs.map((rsvp, index) => (
              <div key={index} className="bg-gray-50 p-3 rounded border">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{rsvp.event_title || rsvp.event_id}</div>
                    <div className="text-sm text-gray-600">
                      {formatDate(rsvp.event_start_time)}
                    </div>
                    {rsvp.event_location?.name && (
                      <div className="text-sm text-gray-500">📍 {rsvp.event_location.name}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-1 text-xs rounded ${
                      rsvp.status === 'active' ? 'bg-green-100 text-green-800' :
                      rsvp.status === 'cancelled' ? 'bg-yellow-100 text-yellow-800' :
                      rsvp.status === 'attended' ? 'bg-blue-100 text-blue-800' :
                      rsvp.status === 'no_show' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {rsvp.status.toUpperCase()}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">
                      RSVP'd: {formatDate(rsvp.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {volunteerRSVPs.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No RSVP history found for this volunteer.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVolunteerEditForm = () => {
    if (!editingVolunteer) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
          <h3 className="text-xl font-bold mb-4">Edit Volunteer Profile</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name
              </label>
              <input
                type="text"
                value={volunteerFormData.first_name}
                onChange={(e) => setVolunteerFormData({...volunteerFormData, first_name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name
              </label>
              <input
                type="text"
                value={volunteerFormData.last_name}
                onChange={(e) => setVolunteerFormData({...volunteerFormData, last_name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={volunteerFormData.email}
                onChange={(e) => setVolunteerFormData({...volunteerFormData, email: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <input
                type="tel"
                value={volunteerFormData.phone}
                onChange={(e) => setVolunteerFormData({...volunteerFormData, phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Emergency Contact
              </label>
              <input
                type="text"
                value={volunteerFormData.emergency_contact}
                onChange={(e) => setVolunteerFormData({...volunteerFormData, emergency_contact: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Name and phone number"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Volunteer Experience
              </label>
              <select
                value={volunteerFormData.volunteer_experience}
                onChange={(e) => setVolunteerFormData({...volunteerFormData, volunteer_experience: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select experience level</option>
                <option value="Beginner">Beginner</option>
                <option value="Some Experience">Some Experience</option>
                <option value="Experienced">Experienced</option>
                <option value="Very Experienced">Very Experienced</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How did you hear about us?
              </label>
              <input
                type="text"
                value={volunteerFormData.how_did_you_hear}
                onChange={(e) => setVolunteerFormData({...volunteerFormData, how_did_you_hear: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dietary Restrictions
              </label>
              <textarea
                value={volunteerFormData.dietary_restrictions}
                onChange={(e) => setVolunteerFormData({...volunteerFormData, dietary_restrictions: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="2"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => setEditingVolunteer(null)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={handleVolunteerSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Filters */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
              placeholder="Search by name or email..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Experience Level</label>
            <select
              value={filters.experience}
              onChange={(e) => setFilters({...filters, experience: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Levels</option>
              <option value="Beginner">Beginner</option>
              <option value="Some Experience">Some Experience</option>
              <option value="Experienced">Experienced</option>
              <option value="Very Experienced">Very Experienced</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({...filters, sortBy: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="rsvps">Total RSVPs</option>
              <option value="attendance">Attendance Rate</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <div className="text-sm text-gray-600">
              Showing {filteredVolunteers.length} of {volunteers.length} volunteers
            </div>
          </div>
        </div>
      </div>

      {/* Volunteers List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Volunteers List */}
        <div>
          <h4 className="font-semibold mb-4">Volunteers ({filteredVolunteers.length})</h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Loading volunteers...</p>
              </div>
            ) : filteredVolunteers.length > 0 ? (
              filteredVolunteers.map(renderVolunteerCard)
            ) : (
              <div className="text-center py-8 text-gray-500">
                No volunteers found matching your filters.
              </div>
            )}
          </div>
        </div>
        
        {/* Volunteer Details */}
        <div>
          {showVolunteerDetails && selectedVolunteer ? (
            renderVolunteerDetails()
          ) : (
            <div className="text-center py-8 text-gray-500 border border-gray-200 rounded-lg">
              Select a volunteer to view details
            </div>
          )}
        </div>
      </div>

      {/* Edit Form Modal */}
      {renderVolunteerEditForm()}
    </div>
  );
};

export default VolunteerManagement;