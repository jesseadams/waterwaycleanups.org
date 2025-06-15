import React, { useState, useEffect } from 'react';
import { listContactLists, createContactList, deleteContactList, listContacts, getContactList } from '../../utils/sesv2';
import ContactsTable from './ContactsTable';
import ContactForm from './ContactForm';
import ContactListForm from './ContactListForm';

// Using a more flexible type definition to accommodate AWS SDK responses
interface ContactList {
  ContactListName: string | undefined;
  Description?: string | undefined;
  Topics?: Array<{
    TopicName?: string;
    DisplayName?: string;
    Description?: string;
  }>;
  ContactCount?: number;
  TopicCounts?: {
    [key: string]: {
      count: number;
      optedOut: number;
    }
  };
}

interface TopicInfo {
  TopicName?: string;
  DisplayName?: string;
  Description?: string;
}

const ContactsManagement: React.FC = () => {
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedContactList, setSelectedContactList] = useState<string | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [availableTopics, setAvailableTopics] = useState<TopicInfo[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreatingContactList, setIsCreatingContactList] = useState<boolean>(false);
  const [isAddingContact, setIsAddingContact] = useState<boolean>(false);

  // Fetch contact lists on mount
  useEffect(() => {
    fetchContactLists();
  }, []);

  // Fetch contacts when a contact list is selected
  useEffect(() => {
    if (selectedContactList) {
      fetchContacts(selectedContactList);
      fetchTopics(selectedContactList);
    } else {
      setContacts([]);
      setAvailableTopics([]);
    }
  }, [selectedContactList]);

  // Reset selected topic when available topics change
  useEffect(() => {
    if (availableTopics.length > 0 && availableTopics[0].TopicName) {
      setSelectedTopic(availableTopics[0].TopicName);
    } else {
      setSelectedTopic(null);
    }
  }, [availableTopics]);

  const fetchContactLists = async () => {
    setIsLoading(true);
    try {
      const response = await listContactLists();
      // Ensure we're dealing with valid data
      const lists = (response.ContactLists || [])
        .filter(list => list && list.ContactListName)
        .map(list => ({
          ...list,
          ContactListName: list.ContactListName as string
        }));
      
      // Fetch contact counts for each list
      const listsWithCounts = await Promise.all(
        lists.map(async (list) => {
          try {
            const contactsResponse = await listContacts(list.ContactListName as string);
            const contacts = contactsResponse.Contacts || [];
            
            // Get the contact list details to get topics
            const contactListDetails = await getContactList(list.ContactListName as string);
            const topics = contactListDetails.Topics || [];
            
            // Initialize topic counts
            const topicCounts: { [key: string]: { count: number, optedOut: number } } = {};
            topics.forEach(topic => {
              if (topic.TopicName) {
                topicCounts[topic.TopicName] = { count: 0, optedOut: 0 };
              }
            });
            
            // Count contacts per topic
            for (const contact of contacts) {
              if (contact.TopicPreferences && Array.isArray(contact.TopicPreferences)) {
                contact.TopicPreferences.forEach((pref: any) => {
                  if (pref.TopicName && topicCounts[pref.TopicName]) {
                    if (pref.SubscriptionStatus === 'OPT_IN') {
                      topicCounts[pref.TopicName].count++;
                    } else {
                      topicCounts[pref.TopicName].optedOut++;
                    }
                  }
                });
              }
            }
            
            return {
              ...list,
              ContactCount: contacts.length,
              TopicCounts: topicCounts
            };
          } catch (error) {
            console.error(`Error fetching contacts for ${list.ContactListName}:`, error);
            return {
              ...list,
              ContactCount: 0,
              TopicCounts: {}
            };
          }
        })
      );
      
      setContactLists(listsWithCounts);
      
      if (listsWithCounts.length > 0) {
        setSelectedContactList(listsWithCounts[0].ContactListName);
      }
    } catch (error) {
      console.error('Error fetching contact lists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContacts = async (contactListName: string) => {
    setIsLoading(true);
    try {
      const response = await listContacts(contactListName);
      setContacts(response.Contacts || []);
    } catch (error) {
      console.error(`Error fetching contacts for ${contactListName}:`, error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchTopics = async (contactListName: string) => {
    try {
      const response = await getContactList(contactListName);
      // Filter out any topics without a TopicName
      setAvailableTopics((response.Topics || []).filter(topic => !!topic.TopicName));
    } catch (error) {
      console.error(`Error fetching topics for ${contactListName}:`, error);
      setAvailableTopics([]);
    }
  };

  const handleCreateContactList = async (data: { name: string; description: string }) => {
    try {
      await createContactList(data.name, data.description);
      setIsCreatingContactList(false);
      fetchContactLists();
    } catch (error) {
      console.error('Error creating contact list:', error);
    }
  };

  const handleDeleteContactList = async (name: string) => {
    if (window.confirm(`Are you sure you want to delete the contact list "${name}"?`)) {
      try {
        await deleteContactList(name);
        fetchContactLists();
        if (selectedContactList === name) {
          setSelectedContactList(null);
        }
      } catch (error) {
        console.error(`Error deleting contact list ${name}:`, error);
      }
    }
  };

  const handleContactAdded = () => {
    setIsAddingContact(false);
    if (selectedContactList) {
      fetchContacts(selectedContactList);
      // Also refresh contact lists to update the counts
      fetchContactLists();
    }
  };

  if (isLoading && contactLists.length === 0) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Contact Management</h1>
        <button
          onClick={() => setIsCreatingContactList(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Contact List
        </button>
      </div>

      {isCreatingContactList && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Create Contact List</h2>
          <ContactListForm 
            onSubmit={handleCreateContactList} 
            onCancel={() => setIsCreatingContactList(false)} 
          />
        </div>
      )}

      {contactLists.length > 0 ? (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Contact Lists</h2>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Contact List
            </label>
            <div className="flex gap-4">
              <select
                value={selectedContactList || ''}
                onChange={(e) => setSelectedContactList(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              >
                {contactLists.map((list) => (
                  <option key={list.ContactListName} value={list.ContactListName}>
                    {list.ContactListName} ({list.ContactCount} contacts) {list.Description ? `- ${list.Description}` : ''}
                  </option>
                ))}
              </select>
              {selectedContactList && (
                <button
                  onClick={() => handleDeleteContactList(selectedContactList)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete List
                </button>
              )}
            </div>
          </div>

          {selectedContactList && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Contacts</h3>
                <button
                  onClick={() => setIsAddingContact(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Add Contact
                </button>
              </div>

              {isAddingContact && (
                <div className="mb-6 p-4 border rounded-md bg-gray-50">
                  <h4 className="text-md font-semibold mb-2">New Contact</h4>
                  <ContactForm
                    contactListName={selectedContactList}
                    onSuccess={handleContactAdded}
                    onCancel={() => setIsAddingContact(false)}
                  />
                </div>
              )}
              
              {/* Topic tabs */}
              {availableTopics.length > 0 && (
                <div className="mb-4">
                  <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8">
                      {availableTopics.map((topic) => {
                        if (!topic.TopicName) return null;
                        
                        const selectedList = contactLists.find(list => list.ContactListName === selectedContactList);
                        const topicCount = selectedList?.TopicCounts?.[topic.TopicName]?.count || 0;
                        
                        return (
                          <button
                            key={topic.TopicName}
                            onClick={() => topic.TopicName && setSelectedTopic(topic.TopicName)}
                            className={`
                              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                              ${selectedTopic === topic.TopicName 
                                ? 'border-blue-500 text-blue-600' 
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                            `}
                          >
                            {topic.DisplayName || topic.TopicName} ({topicCount})
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              )}

              <ContactsTable
                contacts={contacts}
                contactListName={selectedContactList}
                selectedTopic={selectedTopic}
                onContactUpdate={() => {
                  fetchContacts(selectedContactList);
                  // Also refresh contact lists to update the counts
                  fetchContactLists();
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow">
          <p>No contact lists found. Create a new contact list to get started.</p>
        </div>
      )}
    </div>
  );
};

export default ContactsManagement;
