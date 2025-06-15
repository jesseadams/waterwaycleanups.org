import React, { useState } from 'react';
import { deleteContact, getContact, TopicPreference } from '../../utils/sesv2';
import EditContactForm from './EditContactForm';

interface Contact {
  EmailAddress: string;
  TopicPreferences?: TopicPreference[];
  LastUpdatedTimestamp?: Date;
  CreatedTimestamp?: Date;
  AttributesData?: string;
  [key: string]: any;
}

interface ContactsTableProps {
  contacts: Contact[];
  contactListName: string;
  selectedTopic?: string | null;
  onContactUpdate: () => void;
}

const ContactsTable: React.FC<ContactsTableProps> = ({
  contacts,
  contactListName,
  selectedTopic,
  onContactUpdate,
}) => {
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [detailedContact, setDetailedContact] = useState<Contact | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<string | null>(null);

  const handleDeleteContact = async (emailAddress: string) => {
    if (window.confirm(`Are you sure you want to delete the contact ${emailAddress}?`)) {
      try {
        await deleteContact(contactListName, emailAddress);
        onContactUpdate();
      } catch (error) {
        console.error('Error deleting contact:', error);
        alert('Failed to delete contact. Please try again.');
      }
    }
  };

  const toggleExpandContact = async (emailAddress: string) => {
    if (expandedContact === emailAddress) {
      setExpandedContact(null);
      setDetailedContact(null);
    } else {
      setExpandedContact(emailAddress);
      setIsLoadingDetails(true);
      setLoadError(null);
      
      try {
        const response = await getContact(contactListName, emailAddress);
        console.log('Contact details response:', response);
        
        // AWS SESv2 API returns contact details in a specific structure
        // We need to extract and format the data properly
        if (response) {
          const contactData: Contact = {
            EmailAddress: emailAddress,
            AttributesData: response.AttributesData,
            TopicPreferences: response.TopicPreferences,
            LastUpdatedTimestamp: response.LastUpdatedTimestamp,
            CreatedTimestamp: response.CreatedTimestamp
          };
          
          setDetailedContact(contactData);
        } else {
          throw new Error('Contact data not found in response');
        }
      } catch (error) {
        console.error('Error fetching contact details:', error);
        setLoadError('Failed to load contact details');
      } finally {
        setIsLoadingDetails(false);
      }
    }
  };

  const parseAttributes = (attributesData: string | undefined) => {
    if (!attributesData) return {};
    try {
      return JSON.parse(attributesData);
    } catch (e) {
      return {};
    }
  };

  const handleEditContact = (emailAddress: string) => {
    // Close any other expanded contact details
    if (expandedContact !== emailAddress) {
      toggleExpandContact(emailAddress);
    }
    setEditingContact(emailAddress);
  };

  const handleCancelEdit = () => {
    setEditingContact(null);
  };

  const handleEditSuccess = () => {
    setEditingContact(null);
    setExpandedContact(null); // Hide details after successful update
    onContactUpdate();
  };

  // Filter contacts based on selected topic
  const filteredContacts = selectedTopic 
    ? contacts.filter(contact => {
        // Include contacts that have the selected topic with any subscription status
        return contact.TopicPreferences?.some(
          (pref: any) => pref.TopicName === selectedTopic
        );
      })
    : contacts;

  if (filteredContacts.length === 0) {
    return <p className="text-gray-500">No contacts found in this list.</p>;
  }

  return (
    <div className="overflow-x-auto max-w-full">
      <table className="w-full divide-y divide-gray-200 table-fixed">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
              Email
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
              Created
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
              Last Updated
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredContacts.map((contact) => {
            // Determine if contact is opted out of the selected topic
            const isOptedOut = selectedTopic && contact.TopicPreferences?.some(
              (pref: any) => pref.TopicName === selectedTopic && pref.SubscriptionStatus === 'OPT_OUT'
            );
            
            return (
            <React.Fragment key={contact.EmailAddress}>
              <tr className={`hover:bg-gray-50 ${isOptedOut ? 'text-gray-400' : ''}`}>
                <td className="px-4 py-3 whitespace-nowrap overflow-hidden text-ellipsis">
                  {contact.EmailAddress}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {contact.CreatedTimestamp ? new Date(contact.CreatedTimestamp).toLocaleString() : 'N/A'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {contact.LastUpdatedTimestamp ? new Date(contact.LastUpdatedTimestamp).toLocaleString() : 'N/A'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => toggleExpandContact(contact.EmailAddress)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      {expandedContact === contact.EmailAddress ? 'Hide Details' : 'View Details'}
                    </button>
                    <button
                      onClick={() => handleEditContact(contact.EmailAddress)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteContact(contact.EmailAddress)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
              {expandedContact === contact.EmailAddress && (
                <tr>
                  <td colSpan={4} className="px-4 py-3 bg-gray-50">
                    {isLoadingDetails ? (
                      <div className="text-center py-4">
                        <p className="text-gray-600">Loading contact details...</p>
                      </div>
                    ) : loadError ? (
                      <div className="text-center py-4">
                        <p className="text-red-600">{loadError}</p>
                      </div>
                    ) : editingContact === contact.EmailAddress ? (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Edit Contact</h4>
                        <EditContactForm 
                          contactListName={contactListName}
                          emailAddress={contact.EmailAddress}
                          initialAttributes={parseAttributes(detailedContact?.AttributesData)}
                          initialTopicPreferences={detailedContact?.TopicPreferences || []}
                          onSuccess={handleEditSuccess}
                          onCancel={handleCancelEdit}
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700">Attributes</h4>
                          <div className="mt-1 pl-2 border-l-2 border-gray-300">
                            {detailedContact && Object.entries(parseAttributes(detailedContact.AttributesData)).length > 0 ? (
                              Object.entries(parseAttributes(detailedContact.AttributesData)).map(([key, value]) => (
                                <div key={key} className="grid grid-cols-2 gap-2 text-sm overflow-hidden">
                                  <span className="font-medium truncate">{key}:</span>
                                  <span className="truncate">{String(value)}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500">No attributes</p>
                            )}
                          </div>
                        </div>
                      
                        <div>
                          <h4 className="text-sm font-medium text-gray-700">Topic Preferences</h4>
                          <div className="mt-1 pl-2 border-l-2 border-gray-300">
                            {detailedContact && detailedContact.TopicPreferences && detailedContact.TopicPreferences.length > 0 ? (
                              detailedContact.TopicPreferences.map((topic, index) => (
                                <div key={index} className="grid grid-cols-2 gap-2 text-sm overflow-hidden">
                                  <span className="font-medium truncate">{topic.TopicName}:</span>
                                  <span className="truncate">{topic.SubscriptionStatus}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500">No topic preferences</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ContactsTable;
