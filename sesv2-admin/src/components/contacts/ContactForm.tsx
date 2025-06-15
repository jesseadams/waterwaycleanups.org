import React, { useState } from 'react';
import { createContact, SubscriptionStatus } from '../../utils/sesv2';

interface ContactFormProps {
  contactListName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ContactFormData {
  email: string;
  attributes: { key: string; value: string }[];
}

const ContactForm: React.FC<ContactFormProps> = ({
  contactListName,
  onSuccess,
  onCancel,
}) => {
  const [formData, setFormData] = useState<ContactFormData>({
    email: '',
    attributes: [{ key: 'FirstName', value: '' }, { key: 'LastName', value: '' }],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, email: e.target.value });
  };

  const handleAttributeChange = (index: number, field: 'key' | 'value', value: string) => {
    const newAttributes = [...formData.attributes];
    newAttributes[index][field] = value;
    setFormData({ ...formData, attributes: newAttributes });
  };

  const addAttribute = () => {
    setFormData({
      ...formData,
      attributes: [...formData.attributes, { key: '', value: '' }],
    });
  };

  const removeAttribute = (index: number) => {
    const newAttributes = [...formData.attributes];
    newAttributes.splice(index, 1);
    setFormData({ ...formData, attributes: newAttributes });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Convert attributes array to object
      const attributesObject: Record<string, string> = {};
      formData.attributes.forEach(attr => {
        if (attr.key && attr.key.trim() !== '') {
          attributesObject[attr.key] = attr.value;
        }
      });

      // Default topic preferences - opt in to all available topics
      // This is a simple implementation; in a real app you might want to let users select topics
      const topicPreference = {
        TopicName: 'volunteer',
        SubscriptionStatus: 'OPT_IN' as SubscriptionStatus
      };

      await createContact(
        contactListName,
        formData.email.trim(),
        attributesObject,
        [topicPreference]
      );

      onSuccess();
    } catch (err) {
      console.error('Error adding contact:', err);
      setError('Failed to add contact. Please check the form and try again.');
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
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email Address *
        </label>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={handleEmailChange}
          required
          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          placeholder="email@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Contact Attributes
        </label>
        {formData.attributes.map((attr, index) => (
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
          {isSubmitting ? 'Adding...' : 'Add Contact'}
        </button>
      </div>
    </form>
  );
};

export default ContactForm;
