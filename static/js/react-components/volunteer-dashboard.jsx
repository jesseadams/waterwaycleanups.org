import React, { useState, useEffect } from 'react';
import MinorsManagement from './MinorsManagement';

const VolunteerDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [validationCode, setValidationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState('email'); // 'email', 'code', 'dashboard'
  const [dashboardData, setDashboardData] = useState(null);
  const [showWaiverForm, setShowWaiverForm] = useState(false);

  useEffect(() => {
    // Check if user is already authenticated
    if (window.authClient && window.authClient.isAuthenticated()) {
      setIsAuthenticated(true);
      setEmail(window.authClient.getUserEmail());
      setStep('dashboard');
      loadDashboard();
    }
  }, []);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const data = await window.authClient.getDashboard();
      setDashboardData(data);
    } catch (error) {
      setError(error.message);
      if (error.message.includes('authenticated') || error.message.includes('expired')) {
        setIsAuthenticated(false);
        setStep('email');
      }
    } finally {
      setIsLoading(false);
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
      loadDashboard();
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
    setDashboardData(null);
    setEmail('');
    setValidationCode('');
    setError('');
    setSuccess('');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Date TBD';
    
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'Date TBD';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Date TBD';
    
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return 'Date TBD';
    }
  };

  const calculateDaysRemaining = (expirationDate) => {
    if (!expirationDate) return -1;
    
    try {
      const expiration = new Date(expirationDate);
      const today = new Date();
      const diffTime = expiration.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch (error) {
      return -1;
    }
  };

  const isWaiverExpired = (expirationDate) => {
    const daysRemaining = calculateDaysRemaining(expirationDate);
    return daysRemaining < 0;
  };

  const isWaiverExpiringSoon = (expirationDate) => {
    const daysRemaining = calculateDaysRemaining(expirationDate);
    return daysRemaining >= 0 && daysRemaining <= 30;
  };

  const getEventStatus = (rsvp) => {
    const now = new Date();
    const eventDate = rsvp.event_start_time ? new Date(rsvp.event_start_time) : null;
    
    if (!eventDate) return 'unknown';
    
    if (eventDate > now) {
      return 'upcoming';
    } else {
      return 'past';
    }
  };

  const renderEmailStep = () => (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-center">Volunteer Login</h2>
      <p className="text-gray-600 mb-6 text-center">
        Enter your email to receive a validation code
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
            placeholder="your.email@example.com"
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

  const renderDashboard = () => (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Volunteer Dashboard</h2>
          <p className="text-gray-600">Welcome, {email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
        >
          Logout
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading your information...</p>
        </div>
      ) : dashboardData ? (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Waiver Status */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Waiver Status</h3>
            {dashboardData.waiver.hasWaiver ? (
              <div>
                {isWaiverExpired(dashboardData.waiver.expirationDate) ? (
                  <div className="text-red-600">
                    <p className="font-medium">⚠ Waiver Expired</p>
                    <p className="text-sm text-gray-600 mb-3">
                      Your waiver expired on {formatDate(dashboardData.waiver.expirationDate)}. Please renew to continue volunteering.
                    </p>
                    <a
                      href="/volunteer-waiver"
                      className="inline-block bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
                    >
                      Renew Waiver
                    </a>
                  </div>
                ) : isWaiverExpiringSoon(dashboardData.waiver.expirationDate) ? (
                  <div className="text-yellow-600">
                    <p className="font-medium">⚠ Waiver Expiring Soon</p>
                    <p className="text-sm text-gray-600">
                      Expires: {formatDate(dashboardData.waiver.expirationDate)}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      {calculateDaysRemaining(dashboardData.waiver.expirationDate)} days remaining
                    </p>
                    <p className="text-sm text-gray-600 mb-3">
                      Please renew your waiver soon to avoid interruption.
                    </p>
                    <a
                      href="/volunteer-waiver"
                      className="inline-block bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 text-sm"
                    >
                      Renew Waiver
                    </a>
                  </div>
                ) : (
                  <div className="text-green-600">
                    <p className="font-medium">✓ Valid waiver on file</p>
                    <p className="text-sm text-gray-600">
                      Expires: {formatDate(dashboardData.waiver.expirationDate)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {calculateDaysRemaining(dashboardData.waiver.expirationDate)} days remaining
                    </p>
                    <p className="text-sm text-gray-600">
                      Submitted: {formatDate(dashboardData.waiver.submissionDate)}
                    </p>
                    {dashboardData.minors && dashboardData.minors.length > 0 && (
                      <p className="text-sm text-gray-600 mt-2">
                        ✓ Covers {dashboardData.minors.length} minor{dashboardData.minors.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-orange-600">
                <p className="font-medium">⚠ No valid waiver on file</p>
                <p className="text-sm text-gray-600 mb-3">
                  You need to complete a waiver to volunteer at events
                </p>
                <a
                  href="/volunteer-waiver"
                  className="inline-block bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
                >
                  Complete Waiver
                </a>
              </div>
            )}
          </div>

          {/* Minors on Account */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Minors on Your Account</h3>
            {dashboardData.minors && dashboardData.minors.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.minors.map((minor, index) => (
                  <div key={index} className="p-3 rounded border bg-white border-gray-200">
                    <p className="font-medium text-sm">
                      {minor.first_name} {minor.last_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      Age: {minor.age} years old
                    </p>
                    {minor.email && (
                      <p className="text-xs text-gray-500">
                        {minor.email}
                      </p>
                    )}
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-2">
                  Your waiver covers all minors on your account
                </p>
              </div>
            ) : (
              <p className="text-gray-600 text-sm">
                No minors on your account. You can add minors below - your waiver will cover them.
              </p>
            )}
          </div>

          {/* RSVP History */}
          <div className="bg-gray-50 p-4 rounded-lg md:col-span-2">
            <h3 className="text-lg font-semibold mb-3">Event RSVPs</h3>
            {dashboardData.rsvps && dashboardData.rsvps.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.rsvps.slice(0, 5).map((rsvp, index) => {
                  const eventStatus = getEventStatus(rsvp);
                  const isUpcoming = eventStatus === 'upcoming';
                  
                  return (
                    <div key={index} className={`p-3 rounded border ${isUpcoming ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {rsvp.event_title || rsvp.event_id}
                          </p>
                          <p className="text-sm text-gray-600">
                            {rsvp.event_display_date || formatDateTime(rsvp.event_start_time)}
                          </p>
                          {rsvp.event_location && rsvp.event_location.name && (
                            <p className="text-xs text-gray-500">
                              📍 {rsvp.event_location.name}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`inline-block px-2 py-1 text-xs rounded ${
                            isUpcoming 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {isUpcoming ? 'Upcoming' : 'Past'}
                          </span>
                          {rsvp.status && rsvp.status !== 'active' && (
                            <div className="text-xs text-gray-500 mt-1">
                              Status: {rsvp.status}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        RSVP'd: {formatDate(rsvp.submission_date || rsvp.created_at)}
                      </p>
                    </div>
                  );
                })}
                {dashboardData.rsvps.length > 5 && (
                  <p className="text-sm text-gray-600">
                    ...and {dashboardData.rsvps.length - 5} more
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-600">No event RSVPs yet</p>
            )}
          </div>
        </div>
      ) : null}

      {/* Minors Management Section */}
      {dashboardData && (
        <div className="mt-6">
          <MinorsManagement 
            sessionToken={window.authClient.getSessionToken()} 
            apiBase={window.API_BASE || '/api'}
            onMinorsUpdate={loadDashboard}
          />
        </div>
      )}

      {/* Session Info */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          Session expires: {formatDate(window.authClient.getSessionExpiry())}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        {error && (
          <div className="max-w-md mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        {success && (
          <div className="max-w-md mx-auto mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        {step === 'email' && renderEmailStep()}
        {step === 'code' && renderCodeStep()}
        {step === 'dashboard' && renderDashboard()}
      </div>
    </div>
  );
};

export default VolunteerDashboard;