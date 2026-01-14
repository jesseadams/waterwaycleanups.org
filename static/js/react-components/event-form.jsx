import React, { useState, useEffect } from 'react';

const EventForm = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  editingEvent = null, 
  isLoading = false 
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    location: { 
      name: '', 
      address: '',
      coordinates: { lat: null, lng: null }
    },
    attendance_cap: 50,
    status: 'active',
    hugo_config: { 
      tags: [], 
      preheader_is_light: false,
      image: ''
    },
    metadata: {}
  });

  const [errors, setErrors] = useState({});
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (editingEvent) {
      setFormData({
        title: editingEvent.title || '',
        description: editingEvent.description || '',
        start_time: editingEvent.start_time || '',
        end_time: editingEvent.end_time || '',
        location: editingEvent.location || { name: '', address: '', coordinates: { lat: null, lng: null } },
        attendance_cap: editingEvent.attendance_cap || 50,
        status: editingEvent.status || 'active',
        hugo_config: editingEvent.hugo_config || { tags: [], preheader_is_light: false, image: '' },
        metadata: editingEvent.metadata || {}
      });
      
      // Set tag input for display
      if (editingEvent.hugo_config?.tags) {
        setTagInput(editingEvent.hugo_config.tags.join(', '));
      }
    } else {
      resetForm();
    }
  }, [editingEvent, isOpen]);

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      start_time: '',
      end_time: '',
      location: { name: '', address: '', coordinates: { lat: null, lng: null } },
      attendance_cap: 50,
      status: 'active',
      hugo_config: { tags: [], preheader_is_light: false, image: '' },
      metadata: {}
    });
    setTagInput('');
    setErrors({});
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Event title is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Event description is required';
    }

    if (!formData.start_time) {
      newErrors.start_time = 'Start time is required';
    }

    if (!formData.end_time) {
      newErrors.end_time = 'End time is required';
    }

    if (formData.start_time && formData.end_time) {
      const startDate = new Date(formData.start_time);
      const endDate = new Date(formData.end_time);
      
      if (endDate <= startDate) {
        newErrors.end_time = 'End time must be after start time';
      }
    }

    if (!formData.location.name.trim()) {
      newErrors.location_name = 'Location name is required';
    }

    if (!formData.location.address.trim()) {
      newErrors.location_address = 'Location address is required';
    }

    if (formData.attendance_cap < 1) {
      newErrors.attendance_cap = 'Attendance cap must be at least 1';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // Process tags
    const tags = tagInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const submitData = {
      ...formData,
      hugo_config: {
        ...formData.hugo_config,
        tags
      }
    };

    onSubmit(submitData);
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toISOString().slice(0, 16);
    } catch (error) {
      return '';
    }
  };

  const handleDateChange = (field, value) => {
    if (value) {
      const isoString = new Date(value).toISOString();
      setFormData(prev => ({ ...prev, [field]: isoString }));
    } else {
      setFormData(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleLocationChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      location: {
        ...prev.location,
        [field]: value
      }
    }));
  };

  const handleHugoConfigChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      hugo_config: {
        ...prev.hugo_config,
        [field]: value
      }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold">
            {editingEvent ? 'Edit Event' : 'Create New Event'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="lg:col-span-2">
              <h4 className="text-lg font-semibold mb-4 text-gray-800">Basic Information</h4>
            </div>
            
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.title ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., Potomac River Cleanup - March 2026"
              />
              {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
            </div>
            
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
                rows="4"
                placeholder="Describe the cleanup event, what volunteers should expect, and any special instructions..."
              />
              {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
            </div>

            {/* Date and Time */}
            <div className="lg:col-span-2">
              <h4 className="text-lg font-semibold mb-4 text-gray-800 border-t pt-4">Date & Time</h4>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date & Time *
              </label>
              <input
                type="datetime-local"
                value={formatDateForInput(formData.start_time)}
                onChange={(e) => handleDateChange('start_time', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.start_time ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.start_time && <p className="text-red-500 text-sm mt-1">{errors.start_time}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date & Time *
              </label>
              <input
                type="datetime-local"
                value={formatDateForInput(formData.end_time)}
                onChange={(e) => handleDateChange('end_time', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.end_time ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.end_time && <p className="text-red-500 text-sm mt-1">{errors.end_time}</p>}
            </div>

            {/* Location */}
            <div className="lg:col-span-2">
              <h4 className="text-lg font-semibold mb-4 text-gray-800 border-t pt-4">Location</h4>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location Name *
              </label>
              <input
                type="text"
                value={formData.location.name}
                onChange={(e) => handleLocationChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.location_name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., Widewater State Park"
              />
              {errors.location_name && <p className="text-red-500 text-sm mt-1">{errors.location_name}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Address *
              </label>
              <input
                type="text"
                value={formData.location.address}
                onChange={(e) => handleLocationChange('address', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.location_address ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., 1430 Widewater Beach Rd, Stafford, VA 22554"
              />
              {errors.location_address && <p className="text-red-500 text-sm mt-1">{errors.location_address}</p>}
            </div>

            {/* Event Settings */}
            <div className="lg:col-span-2">
              <h4 className="text-lg font-semibold mb-4 text-gray-800 border-t pt-4">Event Settings</h4>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attendance Cap *
              </label>
              <input
                type="number"
                value={formData.attendance_cap}
                onChange={(e) => setFormData({...formData, attendance_cap: parseInt(e.target.value) || 0})}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.attendance_cap ? 'border-red-500' : 'border-gray-300'
                }`}
                min="1"
                placeholder="50"
              />
              {errors.attendance_cap && <p className="text-red-500 text-sm mt-1">{errors.attendance_cap}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* Hugo Configuration */}
            <div className="lg:col-span-2">
              <h4 className="text-lg font-semibold mb-4 text-gray-800 border-t pt-4">Website Configuration</h4>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., potomac-river, state-park, cleanup"
              />
              <p className="text-sm text-gray-500 mt-1">
                Tags help categorize events on the website
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Featured Image Path
              </label>
              <input
                type="text"
                value={formData.hugo_config.image}
                onChange={(e) => handleHugoConfigChange('image', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., /uploads/events/cleanup-photo.jpg"
              />
              <p className="text-sm text-gray-500 mt-1">
                Optional: Path to the main image for this event
              </p>
            </div>
            
            <div className="lg:col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.hugo_config.preheader_is_light}
                  onChange={(e) => handleHugoConfigChange('preheader_is_light', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  Use light preheader (for dark background images)
                </span>
              </label>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 mt-8 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Saving...' : (editingEvent ? 'Update Event' : 'Create Event')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EventForm;