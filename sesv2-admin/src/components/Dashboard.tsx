import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listContactLists, listEmailTemplates } from '../utils/sesv2';

const Dashboard: React.FC = () => {
  const [contactLists, setContactLists] = useState<any[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contactListsResponse, templatesResponse] = await Promise.all([
          listContactLists(),
          listEmailTemplates()
        ]);
        
        setContactLists(contactListsResponse.ContactLists || []);
        setEmailTemplates(templatesResponse.TemplatesMetadata || []);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load data. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <DashboardCard
          title="Contact Management"
          count={contactLists.length}
          description="Manage your contact lists and subscribers"
          link="/contacts"
          loading={loading}
          error={error}
        />
        
        <DashboardCard
          title="Template Management"
          count={emailTemplates.length}
          description="Create and manage email templates"
          link="/templates"
          loading={loading}
          error={error}
        />
        
        <DashboardCard
          title="Send Emails"
          count="New"
          description="Send emails to your contacts using templates"
          link="/send-emails"
          loading={false}
        />
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Quick Tips</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Create contact lists before adding contacts</li>
          <li>Set up email templates for consistent communication</li>
          <li>Use attributes to personalize your emails</li>
          <li>Test emails before sending to large audiences</li>
        </ul>
      </div>
    </div>
  );
};

interface DashboardCardProps {
  title: string;
  count: number | string;
  description: string;
  link: string;
  loading: boolean;
  error?: string | null;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  count,
  description,
  link,
  loading,
  error,
}) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-2 mb-4">
        {loading ? (
          <div className="animate-pulse h-8 w-8 bg-gray-200 rounded"></div>
        ) : error ? (
          <p className="text-red-500">Error loading data</p>
        ) : (
          <p className="text-3xl font-bold text-blue-600">{count}</p>
        )}
      </div>
      <p className="text-gray-600">{description}</p>
      <Link
        to={link}
        className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Manage
      </Link>
    </div>
  );
};

export default Dashboard;
