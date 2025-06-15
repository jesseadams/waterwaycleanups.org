import React, { useState, useEffect } from 'react';
import { getEmailTemplate, updateEmailTemplate } from '../../utils/sesv2';
import RichTextEditor from './RichTextEditor';
import { htmlToText } from '../../utils/html-to-text';

interface TemplateEditFormProps {
  templateName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const TemplateEditForm: React.FC<TemplateEditFormProps> = ({ 
  templateName, 
  onSuccess, 
  onCancel 
}) => {
  const [formData, setFormData] = useState({
    subject: '',
    htmlContent: '',
    textContent: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the template data when the component mounts
  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        setIsLoading(true);
        const response = await getEmailTemplate(templateName);
        
        if (response.TemplateContent) {
          setFormData({
            subject: response.TemplateContent.Subject || '',
            htmlContent: response.TemplateContent.Html || '',
            textContent: response.TemplateContent.Text || ''
          });
        } else {
          throw new Error('Template content not found');
        }
      } catch (err) {
        console.error(`Error fetching template ${templateName}:`, err);
        setError('Failed to load template data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplate();
  }, [templateName]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // Update form data
    setFormData((prev) => {
      // If updating textContent manually, don't auto-generate it
      if (name === 'textContent') {
        return { ...prev, textContent: value };
      }
      
      return { ...prev, [name]: value };
    });
  };
  
  // Auto-generate text content when HTML content changes
  useEffect(() => {
    // Generate text version from HTML content
    const textVersion = htmlToText(formData.htmlContent);
    
    // Update text content
    setFormData(prev => ({
      ...prev,
      textContent: textVersion
    }));
  }, [formData.htmlContent]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await updateEmailTemplate(
        templateName,
        formData.subject,
        formData.htmlContent,
        formData.textContent
      );
      onSuccess();
    } catch (err) {
      console.error('Error updating email template:', err);
      setError('Failed to update email template. Please check the form and try again.');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-40">
      <div className="text-gray-500">Loading template data...</div>
    </div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
          Email Subject *
        </label>
        <input
          type="text"
          id="subject"
          name="subject"
          value={formData.subject}
          onChange={handleChange}
          required
          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          placeholder="Welcome to our service, {{name}}!"
        />
      </div>

      <div>
        <label htmlFor="htmlContent" className="block text-sm font-medium text-gray-700 mb-1">
          HTML Content *
        </label>
        <RichTextEditor
          value={formData.htmlContent}
          onChange={(content) => {
            setFormData(prev => ({ ...prev, htmlContent: content }));
          }}
          placeholder="Edit your email template here..."
          height="300px"
        />
        <p className="mt-1 text-xs text-gray-500">
          Use &#123;&#123;variable&#125;&#125; syntax for template variables.
        </p>
      </div>

      <div>
        <label htmlFor="textContent" className="block text-sm font-medium text-gray-700">
          Text Content
        </label>
        <textarea
          id="textContent"
          name="textContent"
          value={formData.textContent}
          onChange={handleChange}
          rows={4}
          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md font-mono"
        />
        <p className="mt-1 text-xs text-gray-500">
          Plain text version of your email for clients that don't support HTML.
        </p>
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
          {isSubmitting ? 'Updating...' : 'Update Template'}
        </button>
      </div>
    </form>
  );
};

export default TemplateEditForm;
