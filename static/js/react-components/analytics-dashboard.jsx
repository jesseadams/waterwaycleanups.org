import React, { useState, useEffect } from 'react';

const AnalyticsDashboard = ({ 
  events = [], 
  volunteers = [], 
  onExportData,
  isLoading = false 
}) => {
  const [analytics, setAnalytics] = useState({
    totalEvents: 0,
    activeEvents: 0,
    completedEvents: 0,
    totalVolunteers: 0,
    totalRSVPs: 0,
    averageAttendance: 0,
    topLocations: [],
    monthlyStats: [],
    volunteerEngagement: {
      newVolunteers: 0,
      returningVolunteers: 0,
      averageRSVPsPerVolunteer: 0
    }
  });

  useEffect(() => {
    calculateAnalytics();
  }, [events, volunteers]);

  const calculateAnalytics = () => {
    // Basic event statistics
    const totalEvents = events.length;
    const activeEvents = events.filter(e => e.status === 'active').length;
    const completedEvents = events.filter(e => e.status === 'completed').length;
    
    // Volunteer statistics
    const totalVolunteers = volunteers.length;
    const totalRSVPs = volunteers.reduce((sum, v) => sum + (v.volunteer_metrics?.total_rsvps || 0), 0);
    const totalAttended = volunteers.reduce((sum, v) => sum + (v.volunteer_metrics?.total_attended || 0), 0);
    const averageAttendance = totalRSVPs > 0 ? Math.round((totalAttended / totalRSVPs) * 100) : 0;
    
    // Location analysis
    const locationCounts = {};
    events.forEach(event => {
      const location = event.location?.name || 'Unknown';
      locationCounts[location] = (locationCounts[location] || 0) + 1;
    });
    
    const topLocations = Object.entries(locationCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([location, count]) => ({ location, count }));

    // Monthly statistics (last 12 months)
    const monthlyStats = generateMonthlyStats(events);
    
    // Volunteer engagement
    const currentYear = new Date().getFullYear();
    const newVolunteers = volunteers.filter(v => {
      const joinYear = v.created_at ? new Date(v.created_at).getFullYear() : 0;
      return joinYear === currentYear;
    }).length;
    
    const returningVolunteers = volunteers.filter(v => {
      return (v.volunteer_metrics?.total_rsvps || 0) > 1;
    }).length;
    
    const averageRSVPsPerVolunteer = totalVolunteers > 0 ? Math.round(totalRSVPs / totalVolunteers * 10) / 10 : 0;

    setAnalytics({
      totalEvents,
      activeEvents,
      completedEvents,
      totalVolunteers,
      totalRSVPs,
      averageAttendance,
      topLocations,
      monthlyStats,
      volunteerEngagement: {
        newVolunteers,
        returningVolunteers,
        averageRSVPsPerVolunteer
      }
    });
  };

  const generateMonthlyStats = (events) => {
    const months = [];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const monthEvents = events.filter(event => {
        if (!event.start_time) return false;
        const eventDate = new Date(event.start_time);
        return eventDate.getFullYear() === date.getFullYear() && 
               eventDate.getMonth() === date.getMonth();
      });

      months.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        events: monthEvents.length,
        // This would be calculated from actual RSVP data in a real implementation
        rsvps: monthEvents.reduce((sum, e) => sum + (e.attendance_cap || 0), 0) * 0.7 // Estimated
      });
    }
    
    return months;
  };

  const handleExport = async (type, format) => {
    try {
      if (onExportData) {
        await onExportData(type, format);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const renderStatCard = (title, value, subtitle, color = 'blue') => {
    const colorClasses = {
      blue: 'bg-blue-50 text-blue-600 border-blue-200',
      green: 'bg-green-50 text-green-600 border-green-200',
      purple: 'bg-purple-50 text-purple-600 border-purple-200',
      orange: 'bg-orange-50 text-orange-600 border-orange-200',
      red: 'bg-red-50 text-red-600 border-red-200'
    };

    return (
      <div className={`p-6 rounded-lg border ${colorClasses[color]}`}>
        <h4 className="text-lg font-semibold text-gray-700 mb-2">{title}</h4>
        <p className="text-3xl font-bold">{value}</p>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2 text-gray-600">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overview Statistics */}
      <div>
        <h3 className="text-xl font-semibold mb-6">Overview Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {renderStatCard(
            'Total Events', 
            formatNumber(analytics.totalEvents),
            `${analytics.activeEvents} active, ${analytics.completedEvents} completed`,
            'blue'
          )}
          {renderStatCard(
            'Total Volunteers', 
            formatNumber(analytics.totalVolunteers),
            `${analytics.volunteerEngagement.newVolunteers} new this year`,
            'green'
          )}
          {renderStatCard(
            'Total RSVPs', 
            formatNumber(analytics.totalRSVPs),
            `${analytics.averageRSVPsPerVolunteer} avg per volunteer`,
            'purple'
          )}
          {renderStatCard(
            'Attendance Rate', 
            `${analytics.averageAttendance}%`,
            'Overall attendance rate',
            'orange'
          )}
        </div>
      </div>

      {/* Volunteer Engagement */}
      <div>
        <h3 className="text-xl font-semibold mb-6">Volunteer Engagement</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {renderStatCard(
            'New Volunteers', 
            formatNumber(analytics.volunteerEngagement.newVolunteers),
            'Joined this year',
            'green'
          )}
          {renderStatCard(
            'Returning Volunteers', 
            formatNumber(analytics.volunteerEngagement.returningVolunteers),
            'Multiple RSVPs',
            'blue'
          )}
          {renderStatCard(
            'Avg RSVPs per Volunteer', 
            analytics.volunteerEngagement.averageRSVPsPerVolunteer,
            'Engagement level',
            'purple'
          )}
        </div>
      </div>

      {/* Top Locations */}
      <div>
        <h3 className="text-xl font-semibold mb-6">Popular Event Locations</h3>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          {analytics.topLocations.length > 0 ? (
            <div className="space-y-3">
              {analytics.topLocations.map((location, index) => (
                <div key={location.location} className="flex justify-between items-center">
                  <div className="flex items-center">
                    <span className="text-lg font-semibold text-gray-500 w-8">#{index + 1}</span>
                    <span className="font-medium">{location.location}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                      {location.count} events
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No location data available
            </div>
          )}
        </div>
      </div>

      {/* Monthly Trends */}
      <div>
        <h3 className="text-xl font-semibold mb-6">Monthly Activity (Last 12 Months)</h3>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Month</th>
                  <th className="text-right py-2">Events</th>
                  <th className="text-right py-2">Est. RSVPs</th>
                </tr>
              </thead>
              <tbody>
                {analytics.monthlyStats.map((month, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-2 font-medium">{month.month}</td>
                    <td className="py-2 text-right">{month.events}</td>
                    <td className="py-2 text-right">{Math.round(month.rsvps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Export Section */}
      <div>
        <h3 className="text-xl font-semibold mb-6">Data Export</h3>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <p className="text-gray-600 mb-4">
            Export data for further analysis or reporting purposes.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium mb-2">Events Data</h4>
              <div className="space-y-2">
                <button
                  onClick={() => handleExport('events', 'csv')}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                >
                  Export Events (CSV)
                </button>
                <button
                  onClick={() => handleExport('events', 'json')}
                  className="w-full bg-blue-100 text-blue-700 px-4 py-2 rounded-md hover:bg-blue-200 text-sm"
                >
                  Export Events (JSON)
                </button>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Volunteers Data</h4>
              <div className="space-y-2">
                <button
                  onClick={() => handleExport('volunteers', 'csv')}
                  className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm"
                >
                  Export Volunteers (CSV)
                </button>
                <button
                  onClick={() => handleExport('volunteers', 'json')}
                  className="w-full bg-green-100 text-green-700 px-4 py-2 rounded-md hover:bg-green-200 text-sm"
                >
                  Export Volunteers (JSON)
                </button>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">RSVP Data</h4>
              <div className="space-y-2">
                <button
                  onClick={() => handleExport('rsvps', 'csv')}
                  className="w-full bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 text-sm"
                >
                  Export RSVPs (CSV)
                </button>
                <button
                  onClick={() => handleExport('analytics', 'json')}
                  className="w-full bg-purple-100 text-purple-700 px-4 py-2 rounded-md hover:bg-purple-200 text-sm"
                >
                  Export Analytics (JSON)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;