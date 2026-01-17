import React, { useState, useEffect } from 'react';

const MinorsManagement = ({ sessionToken, apiBase = '/api' }) => {
  const [minors, setMinors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMinor, setEditingMinor] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    email: ''
  });

  useEffect(() => {
    if (sessionToken) {
      loadMinors();
    }
  }, [sessionToken]);

  const loadMinors = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/minors-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken })
      });

      const result = await response.json();

      if (result.success) {
        setMinors(result.minors);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to load minors: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const endpoint = editingMinor ? 'minors-update' : 'minors-add';
    const payload = {
      session_token: sessionToken,
      ...formData
    };

    if (editingMinor) {
      payload.minor_id = editingMinor.minor_id;
    }

    try {
      const response = await fetch(`${apiBase}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(result.message);
        setFormData({ first_name: '', last_name: '', date_of_birth: '', email: '' });
        setShowAddForm(false);
        setEditingMinor(null);
        loadMinors();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to save minor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (minor) => {
    setEditingMinor(minor);
    setFormData({
      first_name: minor.first_name,
      last_name: minor.last_name,
      date_of_birth: minor.date_of_birth,
      email: minor.email || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async (minorId) => {
    if (!confirm('Are you sure you want to remove this minor from your account?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/minors-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          minor_id: minorId
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Minor removed successfully');
        loadMinors();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Failed to delete minor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditingMinor(null);
    setShowAddForm(false);
    setFormData({ first_name: '', last_name: '', date_of_birth: '', email: '' });
  };

  return (
    <div className="minors-management">
      <div className="minors-header">
        <h2>Minors on Your Account</h2>
        <p className="text-sm text-gray-600">
          Your waiver covers all minors attached to your account.
        </p>
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success mb-4">
          {success}
        </div>
      )}

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="btn btn-primary mb-4"
          disabled={loading}
        >
          Add Minor
        </button>
      )}

      {showAddForm && (
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <h3 className="card-title">
              {editingMinor ? 'Edit Minor' : 'Add Minor'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">First Name *</span>
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  className="input input-bordered"
                  required
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Last Name *</span>
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  className="input input-bordered"
                  required
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Date of Birth *</span>
                </label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleInputChange}
                  className="input input-bordered"
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Email (Optional)</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="input input-bordered"
                />
              </div>

              <div className="card-actions justify-end mt-4">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="btn btn-ghost"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : editingMinor ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading && minors.length === 0 ? (
        <div className="text-center py-8">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : minors.length === 0 ? (
        <div className="alert alert-info">
          <p>No minors on your account yet. Add one above!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {minors.map(minor => (
            <div key={minor.minor_id} className="card bg-base-100 shadow-md">
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="card-title">
                      {minor.first_name} {minor.last_name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Age: {minor.age} years old
                    </p>
                    <p className="text-sm text-gray-600">
                      Date of Birth: {minor.date_of_birth}
                    </p>
                    {minor.email && (
                      <p className="text-sm text-gray-600">
                        Email: {minor.email}
                      </p>
                    )}
                  </div>
                  <div className="card-actions">
                    <button
                      onClick={() => handleEdit(minor)}
                      className="btn btn-sm btn-ghost"
                      disabled={loading}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(minor.minor_id)}
                      className="btn btn-sm btn-error btn-outline"
                      disabled={loading}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MinorsManagement;
