import React, { useState, useEffect } from 'react';
import { listContactLists, listContacts, listEmailTemplates, sendEmail, getContact, getEmailTemplate, testRenderEmailTemplate, getContactList } from '../../utils/sesv2';

// Tab enum for cleaner state management
enum TabType {
  Test = 'test',
  Send = 'send'
}

interface EmailSenderProps {}

const EmailSender: React.FC<EmailSenderProps> = () => {
  const [contactLists, setContactLists] = useState<any[]>([]);
  const [selectedContactList, setSelectedContactList] = useState<string | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isUsingTemplate, setIsUsingTemplate] = useState<boolean>(true);
  const [globalTemplateData, setGlobalTemplateData] = useState<string>('{}');
  const [sendingProgess, setSendingProgress] = useState<{total: number, sent: number, failed: number} | null>(null);
  const [customEmail, setCustomEmail] = useState({
    subject: '',
    htmlBody: '<html><body><p>Your email content here.</p></body></html>',
    textBody: 'Your email content here.'
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceEmail, setSourceEmail] = useState<string>('Waterway Cleanups <info@waterwaycleanups.org>');
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewContact, setPreviewContact] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(TabType.Test);
  const [sendToSingleContact, setSendToSingleContact] = useState<boolean>(false);
  const [singleContactToSend, setSingleContactToSend] = useState<string>('');
  const [availableTopics, setAvailableTopics] = useState<Array<{TopicName?: string, DisplayName?: string}>>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [recipientsFilteredByTopic, setRecipientsFilteredByTopic] = useState<string[]>([]);
  const [showNewsletterGenerator, setShowNewsletterGenerator] = useState<boolean>(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedContactList) {
      fetchContacts(selectedContactList);
      fetchTopics(selectedContactList);
    }
  }, [selectedContactList]);
  
  // Filter visible contacts based on selected topic
  useEffect(() => {
    if (!selectedContactList || sendToSingleContact) return;
    
    if (!selectedTopic) {
      // If no topic selected, show no contacts (starting blank)
      setRecipientsFilteredByTopic([]);
      return;
    }
    
    // Filter all contacts by selected topic
    const filteredContacts = contacts
      .filter(contact => {
        if (!contact.TopicPreferences) return false;
        
        // Include contact if they're opted in to the selected topic
        return contact.TopicPreferences.some((pref: any) => 
          pref.TopicName === selectedTopic && pref.SubscriptionStatus === 'OPT_IN'
        );
      })
      .map(contact => contact.EmailAddress);
    
    setRecipientsFilteredByTopic(filteredContacts);
    
    // Clear any selected contacts that aren't in the filtered list
    setSelectedContacts(prev => prev.filter(email => filteredContacts.includes(email)));
  }, [selectedTopic, contacts, selectedContactList, sendToSingleContact]);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [contactListsResponse, templatesResponse] = await Promise.all([
        listContactLists(),
        listEmailTemplates(),
      ]);
      
      const lists = contactListsResponse.ContactLists || [];
      setContactLists(lists);
      if (lists.length > 0 && lists[0].ContactListName) {
        setSelectedContactList(lists[0].ContactListName);
      }
      
      setTemplates(templatesResponse.TemplatesMetadata || []);
    } catch (err) {
      console.error('Error fetching initial data:', err);
      setError('Failed to load data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchTopics = async (contactListName: string) => {
    try {
      const response = await getContactList(contactListName);
      setAvailableTopics(response.Topics || []);
      setSelectedTopic('');
    } catch (error) {
      console.error(`Error fetching topics for ${contactListName}:`, error);
      setAvailableTopics([]);
    }
  };

  const fetchContacts = async (contactListName: string) => {
    setLoading(true);
    try {
      const response = await listContacts(contactListName);
      setContacts(response.Contacts || []);
      setSelectedContacts([]);
    } catch (error) {
      console.error(`Error fetching contacts for ${contactListName}:`, error);
      setError(`Failed to load contacts from ${contactListName}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleContactToggle = (emailAddress: string) => {
    setSelectedContacts(prevSelected => {
      if (prevSelected.includes(emailAddress)) {
        return prevSelected.filter(email => email !== emailAddress);
      } else {
        return [...prevSelected, emailAddress];
      }
    });
  };

  const handleSelectAllContacts = (select: boolean) => {
    if (select) {
      if (selectedTopic) {
        // When a topic is selected, "Select All" should only select matching contacts
        setSelectedContacts(recipientsFilteredByTopic);
      } else {
        // If no topic is selected, this is effectively a no-op
        // since we won't show any contacts
        setSelectedContacts([]);
      }
    } else {
      // Clear selection
      setSelectedContacts([]);
    }
  };
  
  const handleTopicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTopic(e.target.value);
  };

  const handleCustomEmailChange = (field: keyof typeof customEmail, value: string) => {
    setCustomEmail(prev => ({ ...prev, [field]: value }));
  };

  // Parse contact attributes from AttributesData
  const parseAttributes = (attributesData: string | undefined): Record<string, any> => {
    if (!attributesData) return {};
    try {
      const attributes = JSON.parse(attributesData);
      return convertSnakeCaseToCamelCase(attributes);
    } catch (e) {
      console.error('Error parsing contact attributes:', e);
      return {};
    }
  };
  
  // Helper function to convert snake_case keys to camelCase
  const convertSnakeCaseToCamelCase = (obj: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};
    
    Object.entries(obj).forEach(([key, value]) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[camelKey] = convertSnakeCaseToCamelCase(value);
      } else {
        result[camelKey] = value;
      }
      
      if (camelKey !== key) {
        result[key] = value;
      }
    });
    
    return result;
  };

  const handleNewsletterTemplateCreated = async (templateName: string) => {
    // Close the newsletter generator
    setShowNewsletterGenerator(false);
    
    // Refresh templates list
    try {
      const templatesResponse = await listEmailTemplates();
      setTemplates(templatesResponse.TemplatesMetadata || []);
      
      // Select the newly created template
      setSelectedTemplate(templateName);
      
      // Show success message
      setMessage(`Newsletter template "${templateName}" created successfully!`);
    } catch (err) {
      console.error('Error refreshing templates:', err);
      setError('Template created but failed to refresh list. Please refresh the page.');
    }
  };

  const handleTestRender = async () => {
    if (isUsingTemplate && selectedTemplate === '') {
      setError('Please select an email template.');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      let templateDataToUse = {};
      
      try {
        templateDataToUse = JSON.parse(globalTemplateData || '{}');
      } catch (e) {
        console.error('Error parsing template data:', e);
        setError('Invalid template data format. Please use valid JSON.');
        setLoading(false);
        return;
      }
      
      if (previewContact) {
        try {
          const contactDetails = await getContact(selectedContactList || '', previewContact);
          const contactAttributes = parseAttributes(contactDetails.AttributesData);
          templateDataToUse = {
            ...templateDataToUse,
            ...contactAttributes
          };
        } catch (err) {
          console.error(`Failed to get contact details for ${previewContact}:`, err);
          // Continue with just global data
        }
      }
      
      try {
        const originalTemplate = await getEmailTemplate(selectedTemplate);
        const renderedTemplate = await testRenderEmailTemplate(selectedTemplate, templateDataToUse);
        
        setPreviewData({
          renderedTemplate,
          originalTemplate,
          templateData: templateDataToUse
        });
        
        setShowPreview(true);
      } catch (err) {
        console.error('Error test rendering template:', err);
        setError(`Failed to test render the template: ${
          (err as Error)?.message || 'Unknown error'
        }`);
      }
    } catch (err) {
      console.error('Error preparing test render:', err);
      setError('Failed to prepare template preview. Please check your inputs and try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const closePreview = () => {
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if we have valid recipients
    if (sendToSingleContact) {
      if (!singleContactToSend) {
        setError('Please select a contact to send the email to.');
        return;
      }
    } else if (selectedContacts.length === 0) {
      setError('Please select at least one contact to send the email to.');
      return;
    }

    if (sourceEmail.trim() === '') {
      setError('Please enter a valid source email address.');
      return;
    }

    if (isUsingTemplate && selectedTemplate === '') {
      setError('Please select an email template.');
      return;
    }

    if (!isUsingTemplate && (customEmail.subject.trim() === '' || customEmail.htmlBody.trim() === '')) {
      setError('Please provide both subject and HTML body for the custom email.');
      return;
    }

    setSending(true);
    setError(null);
    setMessage(null);

    // Track progress
    const emailsToSend = sendToSingleContact ? [singleContactToSend] : selectedContacts;
    setSendingProgress({
      total: emailsToSend.length,
      sent: 0, 
      failed: 0
    });

    try {
      if (isUsingTemplate) {
        // Parse the global template data string to JSON object
        let parsedGlobalData = {};
        try {
          parsedGlobalData = JSON.parse(globalTemplateData || '{}');
          console.log('Using global template data:', parsedGlobalData);
        } catch (e) {
          console.error('Error parsing template data:', e);
          setError('Invalid template data format. Please use valid JSON.');
          setSending(false);
          setSendingProgress(null);
          return;
        }

        // Send individual emails to each contact with their specific attributes
        let successCount = 0;
        let failureCount = 0;

        // Determine which contacts to send to based on selection mode
        const contactsToSend = sendToSingleContact ? [singleContactToSend] : selectedContacts;
        
        // Send emails one by one to each contact
        for (let i = 0; i < contactsToSend.length; i++) {
          const emailAddress = contactsToSend[i];
          
          try {
            // Get the contact's full details to access their attributes
            const contactDetails = await getContact(selectedContactList || '', emailAddress);
            
            // Extract contact attributes
            const contactAttributes = parseAttributes(contactDetails.AttributesData);
            
            // Merge global template data with contact-specific attributes
            // Contact attributes take precedence over global data
            const mergedTemplateData = {
              ...parsedGlobalData,
              ...contactAttributes
            };
            
            console.log(`Sending to ${emailAddress} with data:`, mergedTemplateData);
            
            // Send email with merged template data
            await sendEmail(
              sourceEmail,
              [emailAddress], // Send to just this contact
              '', // Subject will come from template
              '', // HTML body will come from template
              undefined,
              selectedTemplate,
              mergedTemplateData, // Merged template data with contact attributes
              undefined, // configSet
              selectedContactList || undefined, // contactListName
              selectedTopic || undefined // Use selected topic
            );
            
            successCount++;
          } catch (err) {
            console.error(`Failed to send to ${emailAddress}:`, err);
            failureCount++;
          }
          
          // Update progress
          setSendingProgress(prev => ({
            total: prev?.total || contactsToSend.length,
            sent: successCount,
            failed: failureCount
          }));
        }
        
        if (failureCount > 0) {
          setMessage(`Email sent to ${successCount} recipient(s). Failed to send to ${failureCount} recipient(s).`);
        } else {
          setMessage(`Email successfully sent to ${successCount} recipient(s).`);
        }
      } else {
        // Determine which contacts to send to based on selection mode
        const recipientEmails = sendToSingleContact ? [singleContactToSend] : 
          (selectedTopic ? recipientsFilteredByTopic : selectedContacts);
        
        // Send custom email
        await sendEmail(
          sourceEmail,
          recipientEmails,
          customEmail.subject,
          customEmail.htmlBody,
          customEmail.textBody,
          undefined, // templateName
          undefined, // templateData
          undefined, // configSet
          selectedContactList || undefined, // contactListName
          selectedTopic || undefined // Use selected topic
        );
        
        // Set message for custom email
        setMessage(`Email successfully sent to ${recipientEmails.length} recipient(s).`);
      }
      // Clear form
      if (sendToSingleContact) {
        setSingleContactToSend('');
      } else {
        setSelectedContacts([]);
      }
    } catch (err) {
      console.error('Error sending email:', err);
      setError('Failed to send email. Please check your inputs and try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading && contactLists.length === 0) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Send Email</h1>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
          <p>{error}</p>
        </div>
      )}

      {message && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4">
          <p>{message}</p>
        </div>
      )}

      <form onSubmit={handleSendEmail} className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Email Details</h2>

          {/* Source email */}
          <div className="mb-4">
            <label htmlFor="sourceEmail" className="block text-sm font-medium text-gray-700">
              From Email Address *
            </label>
            <input
              type="text"
              id="sourceEmail"
              value={sourceEmail}
              onChange={(e) => setSourceEmail(e.target.value)}
              required
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
              placeholder="Name <email@example.com>"
            />
            <p className="mt-1 text-sm text-gray-500">
              Format: "Display Name &lt;email@example.com&gt;" or just "email@example.com"
            </p>
          </div>

          {/* Email type selection */}
          <div className="flex items-center mb-4">
            <label className="mr-4">Email Type:</label>
            <div className="flex">
              <label className="inline-flex items-center mr-4">
                <input
                  type="radio"
                  className="form-radio"
                  name="emailType"
                  checked={isUsingTemplate}
                  onChange={() => setIsUsingTemplate(true)}
                />
                <span className="ml-2">Template</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  className="form-radio"
                  name="emailType"
                  checked={!isUsingTemplate}
                  onChange={() => setIsUsingTemplate(false)}
                />
                <span className="ml-2">Custom</span>
              </label>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="border-b border-gray-200 mb-4">
            <nav className="-mb-px flex space-x-4">
              <button
                type="button"
                className={`${
                  activeTab === TabType.Test
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab(TabType.Test)}
              >
                Test
              </button>
              <button
                type="button"
                className={`${
                  activeTab === TabType.Send
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab(TabType.Send)}
              >
                Send
              </button>
            </nav>
          </div>
          
          {/* Template content based on tab */}
          {isUsingTemplate ? (
            <div className="space-y-4">
              {/* Template selection - always visible */}
              <div className="mb-4">
                <label htmlFor="template" className="block text-sm font-medium text-gray-700">
                  Select Template *
                </label>
                <select
                  id="template"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  required
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                >
                  <option value="">-- Select a template --</option>
                  {templates.map((template) => (
                    <option key={template.TemplateName} value={template.TemplateName}>
                      {template.TemplateName}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Test Tab */}
              {activeTab === TabType.Test && (
                <div>
                  <div className="mb-4">
                    <label htmlFor="previewContact" className="block text-sm font-medium text-gray-700">
                      Select Contact for Test Render (Optional)
                    </label>
                    <select
                      id="previewContact"
                      value={previewContact || ''}
                      onChange={(e) => setPreviewContact(e.target.value || null)}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    >
                      <option value="">-- Use global variables only --</option>
                      {contacts.map((contact) => (
                        <option key={contact.EmailAddress} value={contact.EmailAddress}>
                          {contact.EmailAddress}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="templateData" className="block text-sm font-medium text-gray-700">
                      Global Template Data (JSON format)
                    </label>
                    <textarea
                      id="templateData"
                      value={globalTemplateData}
                      onChange={(e) => setGlobalTemplateData(e.target.value)}
                      rows={6}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md font-mono"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                      onClick={handleTestRender}
                      disabled={loading || !selectedTemplate}
                    >
                      Test Render Template
                    </button>
                  </div>
                </div>
              )}
              
              {/* Send Tab */}
              {activeTab === TabType.Send && (
                <div>
                  <div className="mb-4">
                    <label htmlFor="templateData" className="block text-sm font-medium text-gray-700">
                      Global Template Data (JSON format)
                    </label>
                    <textarea
                      id="templateData"
                      value={globalTemplateData}
                      onChange={(e) => setGlobalTemplateData(e.target.value)}
                      rows={6}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md font-mono"
                    />
                  </div>

                  {/* Recipients section for Send tab */}
                  <div className="mt-4">
                    <h3 className="text-lg font-medium mb-2">Recipients</h3>
                    
                    <div className="mb-4">
                      <label htmlFor="contactList" className="block text-sm font-medium text-gray-700">
                        Select Contact List
                      </label>
                      <select
                        id="contactList"
                        value={selectedContactList || ''}
                        onChange={(e) => setSelectedContactList(e.target.value)}
                        className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                        disabled={loading}
                      >
                        {contactLists.map((list) => (
                          <option key={list.ContactListName} value={list.ContactListName}>
                            {list.ContactListName} {list.Description ? `(${list.Description})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center mb-2">
                        <label className="text-sm font-medium text-gray-700 mr-4">Send to:</label>
                        <div className="flex">
                          <label className="inline-flex items-center mr-4">
                            <input
                              type="radio"
                              className="form-radio"
                              name="recipientType"
                              checked={!sendToSingleContact}
                              onChange={() => setSendToSingleContact(false)}
                            />
                            <span className="ml-2">Multiple contacts</span>
                          </label>
                          <label className="inline-flex items-center">
                            <input
                              type="radio"
                              className="form-radio"
                              name="recipientType"
                              checked={sendToSingleContact}
                              onChange={() => setSendToSingleContact(true)}
                            />
                            <span className="ml-2">Single contact</span>
                          </label>
                        </div>
                      </div>

                      {sendToSingleContact ? (
                        <div className="mt-2">
                          <label htmlFor="singleContact" className="block text-sm font-medium text-gray-700">
                            Select contact
                          </label>
                          <select
                            id="singleContact"
                            value={singleContactToSend}
                            onChange={(e) => setSingleContactToSend(e.target.value)}
                            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                            required={sendToSingleContact}
                          >
                            <option value="">-- Select a contact --</option>
                            {contacts.map((contact) => (
                              <option key={contact.EmailAddress} value={contact.EmailAddress}>
                                {contact.EmailAddress}
                              </option>
                            ))}
                          </select>
                          
                          {availableTopics.length > 0 && (
                            <div className="mt-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Topic
                              </label>
                              <select
                                value={selectedTopic}
                                onChange={handleTopicChange}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                              >
                                <option value="">-- Select a topic --</option>
                                {availableTopics.map(topic => topic.TopicName && (
                                  <option key={topic.TopicName} value={topic.TopicName}>
                                    {topic.DisplayName || topic.TopicName}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-gray-500 mt-1">
                                Select a topic to associate with this email
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2">
                          <div className="flex justify-between items-center mb-2">
                            <div>
                              <label className="text-sm font-medium text-gray-700">
                                Select Recipients ({selectedContacts.length} of {contacts.length} selected)
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleSelectAllContacts(true)}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                Select All
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectAllContacts(false)}
                                className="text-sm text-gray-600 hover:text-gray-800"
                              >
                                Clear
                              </button>
                            </div>
                          </div>

                          <div>
                            {availableTopics.length > 0 && (
                              <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Filter by Topic ({selectedTopic ? `${recipientsFilteredByTopic.length} contacts match` : 'No filter applied'})
                                </label>
                                <select
                                  value={selectedTopic}
                                  onChange={handleTopicChange}
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                >
                                  <option value="">-- Select a topic --</option>
                                  {availableTopics.map(topic => topic.TopicName && (
                                    <option key={topic.TopicName} value={topic.TopicName}>
                                      {topic.DisplayName || topic.TopicName}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                  {selectedTopic ? 
                                    'Only contacts opted-in to the selected topic will receive the email.' : 
                                    'Select a topic to filter contacts.'}
                                </p>
                              </div>
                            )}
                            
                            <div className="border border-gray-300 rounded-md h-60 overflow-y-auto p-2">
                              {!selectedTopic ? (
                                <div className="text-center text-gray-500 py-4">
                                  Select a topic above to see matching contacts
                                </div>
                              ) : recipientsFilteredByTopic.length === 0 ? (
                                <div className="text-center text-gray-500 py-4">
                                  No contacts found for the selected topic
                                </div>
                              ) : (
                                contacts
                                  .filter(contact => recipientsFilteredByTopic.includes(contact.EmailAddress))
                                  .map((contact) => (
                                    <div 
                                      key={contact.EmailAddress} 
                                      className="flex items-center mb-1"
                                    >
                                      <input
                                        type="checkbox"
                                        id={`contact-${contact.EmailAddress}`}
                                        checked={selectedContacts.includes(contact.EmailAddress)}
                                        onChange={() => handleContactToggle(contact.EmailAddress)}
                                        className="mr-2"
                                      />
                                      <label
                                        htmlFor={`contact-${contact.EmailAddress}`}
                                        className="text-sm cursor-pointer"
                                      >
                                        {contact.EmailAddress}
                                      </label>
                                    </div>
                                  ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end mt-4">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        disabled={sending || (!sendToSingleContact && selectedContacts.length === 0) || 
                                (sendToSingleContact && !singleContactToSend) || !selectedTemplate}
                      >
                        Send Email
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Test Tab for Custom Email */}
              {activeTab === TabType.Test && (
                <div>
                  <div className="mb-4">
                    <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
                      Email Subject *
                    </label>
                    <input
                      type="text"
                      id="subject"
                      value={customEmail.subject}
                      onChange={(e) => handleCustomEmailChange('subject', e.target.value)}
                      required
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div className="mb-4">
                    <label htmlFor="htmlBody" className="block text-sm font-medium text-gray-700">
                      HTML Content *
                    </label>
                    <textarea
                      id="htmlBody"
                      value={customEmail.htmlBody}
                      onChange={(e) => handleCustomEmailChange('htmlBody', e.target.value)}
                      required
                      rows={8}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md font-mono"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                      onClick={() => setShowPreview(true)}
                    >
                      Preview Custom Email
                    </button>
                  </div>
                </div>
              )}

              {/* Send Tab for Custom Email */}
              {activeTab === TabType.Send && (
                <div>
                  <div className="mb-4">
                    <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
                      Email Subject *
                    </label>
                    <input
                      type="text"
                      id="subject"
                      value={customEmail.subject}
                      onChange={(e) => handleCustomEmailChange('subject', e.target.value)}
                      required
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div className="mb-4">
                    <label htmlFor="htmlBody" className="block text-sm font-medium text-gray-700">
                      HTML Content *
                    </label>
                    <textarea
                      id="htmlBody"
                      value={customEmail.htmlBody}
                      onChange={(e) => handleCustomEmailChange('htmlBody', e.target.value)}
                      required
                      rows={8}
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md font-mono"
                    />
                  </div>

                  {/* Recipients section for Send tab */}
                  <div className="mt-4">
                    <h3 className="text-lg font-medium mb-2">Recipients</h3>
                    
                    <div className="mb-4">
                      <label htmlFor="contactList" className="block text-sm font-medium text-gray-700">
                        Select Contact List
                      </label>
                      <select
                        id="contactList"
                        value={selectedContactList || ''}
                        onChange={(e) => setSelectedContactList(e.target.value)}
                        className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                        disabled={loading}
                      >
                        {contactLists.map((list) => (
                          <option key={list.ContactListName} value={list.ContactListName}>
                            {list.ContactListName} {list.Description ? `(${list.Description})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center mb-2">
                        <label className="text-sm font-medium text-gray-700 mr-4">Send to:</label>
                        <div className="flex">
                          <label className="inline-flex items-center mr-4">
                            <input
                              type="radio"
                              className="form-radio"
                              name="recipientTypeCustom"
                              checked={!sendToSingleContact}
                              onChange={() => setSendToSingleContact(false)}
                            />
                            <span className="ml-2">Multiple contacts</span>
                          </label>
                          <label className="inline-flex items-center">
                            <input
                              type="radio"
                              className="form-radio"
                              name="recipientTypeCustom"
                              checked={sendToSingleContact}
                              onChange={() => setSendToSingleContact(true)}
                            />
                            <span className="ml-2">Single contact</span>
                          </label>
                        </div>
                      </div>

                      {sendToSingleContact ? (
                        <div className="mt-2">
                          <label htmlFor="singleContactCustom" className="block text-sm font-medium text-gray-700">
                            Select contact
                          </label>
                          <select
                            id="singleContactCustom"
                            value={singleContactToSend}
                            onChange={(e) => setSingleContactToSend(e.target.value)}
                            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                            required={sendToSingleContact}
                          >
                            <option value="">-- Select a contact --</option>
                            {contacts.map((contact) => (
                              <option key={contact.EmailAddress} value={contact.EmailAddress}>
                                {contact.EmailAddress}
                              </option>
                            ))}
                          </select>
                          
                          {availableTopics.length > 0 && (
                            <div className="mt-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Topic
                              </label>
                              <select
                                value={selectedTopic}
                                onChange={handleTopicChange}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                              >
                                <option value="">-- Select a topic --</option>
                                {availableTopics.map(topic => topic.TopicName && (
                                  <option key={topic.TopicName} value={topic.TopicName}>
                                    {topic.DisplayName || topic.TopicName}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-gray-500 mt-1">
                                Select a topic to associate with this email
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2">
                          <div className="flex justify-between items-center mb-2">
                            <div>
                              <label className="text-sm font-medium text-gray-700">
                                Select Recipients ({selectedContacts.length} of {contacts.length} selected)
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleSelectAllContacts(true)}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                Select All
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectAllContacts(false)}
                                className="text-sm text-gray-600 hover:text-gray-800"
                              >
                                Clear
                              </button>
                            </div>
                          </div>

                          <div>
                            {availableTopics.length > 0 && (
                              <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Filter by Topic ({selectedTopic ? `${recipientsFilteredByTopic.length} contacts match` : 'No filter applied'})
                                </label>
                                <select
                                  value={selectedTopic}
                                  onChange={handleTopicChange}
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                >
                                  <option value="">-- Select a topic --</option>
                                  {availableTopics.map(topic => topic.TopicName && (
                                    <option key={topic.TopicName} value={topic.TopicName}>
                                      {topic.DisplayName || topic.TopicName}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                  {selectedTopic ? 
                                    'Only contacts opted-in to the selected topic will receive the email.' : 
                                    'Select a topic to filter contacts.'}
                                </p>
                              </div>
                            )}
                            
                            <div className="border border-gray-300 rounded-md h-60 overflow-y-auto p-2">
                              {!selectedTopic ? (
                                <div className="text-center text-gray-500 py-4">
                                  Select a topic above to see matching contacts
                                </div>
                              ) : recipientsFilteredByTopic.length === 0 ? (
                                <div className="text-center text-gray-500 py-4">
                                  No contacts found for the selected topic
                                </div>
                              ) : (
                                contacts
                                  .filter(contact => recipientsFilteredByTopic.includes(contact.EmailAddress))
                                  .map((contact) => (
                                    <div 
                                      key={contact.EmailAddress} 
                                      className="flex items-center mb-1"
                                    >
                                      <input
                                        type="checkbox"
                                        id={`contact-custom-${contact.EmailAddress}`}
                                        checked={selectedContacts.includes(contact.EmailAddress)}
                                        onChange={() => handleContactToggle(contact.EmailAddress)}
                                        className="mr-2"
                                      />
                                      <label
                                        htmlFor={`contact-custom-${contact.EmailAddress}`}
                                        className="text-sm cursor-pointer"
                                      >
                                        {contact.EmailAddress}
                                      </label>
                                    </div>
                                  ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end mt-4">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        disabled={sending || (!sendToSingleContact && selectedContacts.length === 0) || 
                                (sendToSingleContact && !singleContactToSend)}
                      >
                        Send Email
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </form>
      
      {/* Preview modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
              <h2 className="text-xl font-semibold mb-4">Email Preview</h2>
              <div className="mt-1 bg-white border rounded p-4 overflow-auto max-h-96">
                <div 
                  className="template-preview" 
                  dangerouslySetInnerHTML={{ 
                    __html: previewData.renderedTemplate?.RenderedTemplate || customEmail.htmlBody
                  }} 
                />
              </div>
            </div>
            <div className="border-t border-gray-200 p-4 bg-gray-50 flex justify-end">
              <button
                type="button"
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                onClick={closePreview}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailSender;
