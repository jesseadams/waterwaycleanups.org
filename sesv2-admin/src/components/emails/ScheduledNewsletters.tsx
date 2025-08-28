import React, { useState, useEffect } from 'react';
import {
  listScheduledNewsletters,
  deleteScheduledNewsletter,
  formatScheduledTime,
  type ScheduledNewsletter,
} from '../../utils/scheduledNewsletters';

interface ScheduledNewslettersProps {
  onEdit?: (newsletter: ScheduledNewsletter) => void;
}

const ScheduledNewsletters: React.FC<ScheduledNewslettersProps> = ({ onEdit }) => {
  const [newsletters, setNewsletters] = useState<ScheduledNewsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchNewsletters();
  }, [refreshKey]);

  const fetchNewsletters = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await listScheduledNewsletters();
      setNewsletters(response.newsletters);
    } catch (err) {
      console.error('Error fetching scheduled newsletters:', err);
      setError('Failed to load scheduled newsletters');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled newsletter?')) {
      return;
    }

    try {
      await deleteScheduledNewsletter(id);
      setRefreshKey(prev => prev + 1); // Refresh the list
    } catch (err) {
      console.error('Error canceling newsletter:', err);
      setError('Failed to cancel newsletter');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading scheduled newsletters...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Scheduled Newsletters</h2>
          <button
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="px-6 py-4">
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
            <p>{error}</p>
          </div>
        </div>
      )}

      {newsletters.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-500">
          No scheduled newsletters found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Template
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scheduled Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact List
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Topic
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipients
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {newsletters.map((newsletter) => (
                <tr key={newsletter.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {newsletter.templateName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatScheduledTime(newsletter.scheduledTime)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {newsletter.contactList}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {newsletter.topic || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(newsletter.status)}`}>
                      {newsletter.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {newsletter.recipientCount !== undefined ? newsletter.recipientCount : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {newsletter.status === 'pending' && (
                      <button
                        onClick={() => handleCancel(newsletter.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Cancel
                      </button>
                    )}
                    {newsletter.status === 'failed' && newsletter.error && (
                      <span className="text-red-600" title={newsletter.error}>
                        ⚠️ Error
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ScheduledNewsletters;
