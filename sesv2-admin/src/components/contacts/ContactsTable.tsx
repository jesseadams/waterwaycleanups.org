import React, { useState, useMemo } from 'react';
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

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

  // Filter contacts based on selected topic and search query
  const filteredAndSearchedContacts = useMemo(() => {
    // First filter by topic
    let filtered = selectedTopic 
      ? contacts.filter(contact => {
          // Include contacts that have the selected topic with any subscription status
          return contact.TopicPreferences?.some(
            (pref: any) => pref.TopicName === selectedTopic
          );
        })
      : contacts;
    
    // Then filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact => {
        // Search in email
        if (contact.EmailAddress.toLowerCase().includes(query)) {
          return true;
        }
        
        // Search in attributes (firstName and lastName)
        const attributes = parseAttributes(contact.AttributesData);
        const firstName = attributes.firstName?.toLowerCase() || '';
        const lastName = attributes.lastName?.toLowerCase() || '';
        
        return firstName.includes(query) || lastName.includes(query);
      });
    }
    
    return filtered;
  }, [contacts, selectedTopic, searchQuery]);

  // Pagination logic
  const totalPages = Math.ceil(filteredAndSearchedContacts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContacts = filteredAndSearchedContacts.slice(startIndex, endIndex);

  // Reset to page 1 when search query or topic changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTopic]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  if (filteredAndSearchedContacts.length === 0 && !searchQuery) {
    return <p className="text-gray-500">No contacts found in this list.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Search and Items per Page Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <label htmlFor="contact-search" className="block text-sm font-medium text-gray-700 mb-1">
            Search Contacts
          </label>
          <input
            type="text"
            id="contact-search"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by email, first name, or last name..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="items-per-page" className="text-sm font-medium text-gray-700">
            Show:
          </label>
          <select
            id="items-per-page"
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-sm text-gray-700">per page</span>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSearchedContacts.length)} of {filteredAndSearchedContacts.length} contact{filteredAndSearchedContacts.length !== 1 ? 's' : ''}
        {searchQuery && ` (filtered from ${contacts.length} total)`}
      </div>

      {/* Table */}
      {filteredAndSearchedContacts.length === 0 ? (
        <p className="text-gray-500">No contacts found matching "{searchQuery}".</p>
      ) : (
        <>
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
                {paginatedContacts.map((contact) => {
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

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                    currentPage === 1
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  } border border-gray-300`}
                >
                  Previous
                </button>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`relative ml-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                    currentPage === totalPages
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  } border border-gray-300`}
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Page <span className="font-medium">{currentPage}</span> of{' '}
                    <span className="font-medium">{totalPages}</span>
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`relative inline-flex items-center rounded-l-md px-2 py-2 ${
                        currentPage === 1
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-gray-400 hover:bg-gray-50'
                      } ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-offset-0`}
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                    
                    {/* Page numbers */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNumber;
                      if (totalPages <= 5) {
                        pageNumber = i + 1;
                      } else if (currentPage <= 3) {
                        pageNumber = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNumber = totalPages - 4 + i;
                      } else {
                        pageNumber = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNumber}
                          onClick={() => goToPage(pageNumber)}
                          className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                            currentPage === pageNumber
                              ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                              : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className={`relative inline-flex items-center rounded-r-md px-2 py-2 ${
                        currentPage === totalPages
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-gray-400 hover:bg-gray-50'
                      } ring-1 ring-inset ring-gray-300 focus:z-20 focus:outline-offset-0`}
                    >
                      <span className="sr-only">Next</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ContactsTable;
