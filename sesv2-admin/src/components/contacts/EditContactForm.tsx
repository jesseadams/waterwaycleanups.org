import React, { useState, useEffect } from 'react';
import { updateContact, TopicPreference, SubscriptionStatus } from '../../utils/sesv2';

interface EditContactFormProps {
  contactListName: string;
  emailAddress: string;
  initialAttributes: Record<string, string>;
  initialTopicPreferences: TopicPreference[];
  onSuccess: () => void;
  onCancel: () => void;
}

const EditContactForm: React.FC<EditContactFormProps> = ({
  contactListName,
  emailAddress,
  initialAttributes,
  initialTopicPreferences,
  onSuccess,
  onCancel,
}) => {
  const [attributes, setAttributes] = useState<{ key: string; value: string }[]>([]);
  const [topicPreferences, setTopicPreferences] = useState<TopicPreference[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Convert initialAttributes object to array of key-value pairs
    const attributesArray = Object.entries(initialAttributes).map(([key, value]) => ({
      key,
      value: value.toString(), // Ensure the value is a string
    }));
    
    setAttributes(attributesArray.length > 0 ? attributesArray : [{ key: '', value: '' }]);
    setTopicPreferences(initialTopicPreferences || []);
  }, [initialAttributes, initialTopicPreferences]);

  const handleAttributeChange = (index: number, field: 'key' | 'value', value: string) => {
    const newAttributes = [...attributes];
    newAttributes[index][field] = value;
    setAttributes(newAttributes);
  };

  const addAttribute = () => {
    setAttributes([...attributes, { key: '', value: '' }]);
  };

  const removeAttribute = (index: number) => {
    const newAttributes = [...attributes];
    newAttributes.splice(index, 1);
    setAttributes(newAttributes);
  };

  const handleTopicStatusChange = (topicName: string, status: SubscriptionStatus) => {
    const newTopicPreferences = [...topicPreferences];
    const topicIndex = newTopicPreferences.findIndex(tp => tp.TopicName === topicName);
    
    if (topicIndex >= 0) {
      newTopicPreferences[topicIndex] = {
        ...newTopicPreferences[topicIndex],
        SubscriptionStatus: status
      };
    } else {
      newTopicPreferences.push({
        TopicName: topicName,
        SubscriptionStatus: status
      });
    }
    
    setTopicPreferences(newTopicPreferences);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Convert attributes array to object
      const attributesObject: Record<string, string> = {};
      attributes.forEach(attr => {
        if (attr.key && attr.key.trim() !== '') {
          attributesObject[attr.key] = attr.value;
        }
      });

      // Filter out any preferences that don't have a topic name
      const validTopicPreferences = topicPreferences.filter(
        pref => pref.TopicName && pref.TopicName.trim() !== ''
      );

      await updateContact(
        contactListName,
        emailAddress,
        attributesObject,
        validTopicPreferences
      );

      onSuccess();
    } catch (err) {
      console.error('Error updating contact:', err);
      setError('Failed to update contact. Please check the form and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Email Address
        </label>
        <div className="mt-1 p-2 bg-gray-100 rounded-md">
          {emailAddress}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Contact Attributes
        </label>
        {attributes.map((attr, index) => (
          <div key={index} className="flex mb-2 gap-2">
            <input
              type="text"
              value={attr.key}
              onChange={(e) => handleAttributeChange(index, 'key', e.target.value)}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-1/3 shadow-sm sm:text-sm border-gray-300 rounded-md"
              placeholder="Attribute Name"
            />
            <input
              type="text"
              value={attr.value}
              onChange={(e) => handleAttributeChange(index, 'value', e.target.value)}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-1/2 shadow-sm sm:text-sm border-gray-300 rounded-md"
              placeholder="Attribute Value"
            />
            <button
              type="button"
              onClick={() => removeAttribute(index)}
              className="mt-1 bg-red-100 text-red-600 hover:bg-red-200 p-2 rounded-md"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addAttribute}
          className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
        >
          + Add Attribute
        </button>
      </div>

      {topicPreferences.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Topic Preferences
          </label>
          {topicPreferences.map((pref, index) => (
            <div key={index} className="flex items-center mb-2">
              <span className="w-1/3 text-sm">{pref.TopicName}:</span>
              <div className="flex space-x-2">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={pref.SubscriptionStatus === 'OPT_IN'}
                    onChange={() => handleTopicStatusChange(pref.TopicName!, 'OPT_IN')}
                    className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <span className="ml-1 text-sm text-gray-700">Opt In</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={pref.SubscriptionStatus === 'OPT_OUT'}
                    onChange={() => handleTopicStatusChange(pref.TopicName!, 'OPT_OUT')}
                    className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <span className="ml-1 text-sm text-gray-700">Opt Out</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Updating...' : 'Update Contact'}
        </button>
      </div>
    </form>
  );
};

export default EditContactForm;
