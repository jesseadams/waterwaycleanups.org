import React, { useState, useEffect } from 'react';
import { getEmailTemplate, testRenderEmailTemplate } from '../../utils/sesv2';

interface TemplatePreviewProps {
  templateName: string;
  templateData?: Record<string, any>;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({ templateName, templateData }) => {
  const [template, setTemplate] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'html' | 'text'>('html');

  useEffect(() => {
    const fetchTemplate = async () => {
      setLoading(true);
      setError(null);
      try {
        if (templateData) {
          // If we have template data, use testRenderEmailTemplate to get the rendered version
          const response = await testRenderEmailTemplate(templateName, templateData);
          if (response) {
            // The RenderedTemplate is a single string containing the HTML content
            setTemplate({
              // If we can't get the original template subject, use a default one
              Subject: 'Rendered Template',
              Html: response.RenderedTemplate || '<p>No rendered content</p>',
              Text: 'Please view in HTML format'
            });
          }
        } else {
          // If no template data, just get the raw template
          const response = await getEmailTemplate(templateName);
          setTemplate(response.TemplateContent);
        }
      } catch (err) {
        console.error(`Error fetching template ${templateName}:`, err);
        setError('Failed to load template. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [templateName, templateData]);
  
  // Show template data if provided
  const getTemplateDataInfo = () => {
    if (!templateData || Object.keys(templateData).length === 0) return null;
    
    return (
      <div className="bg-blue-50 p-4 mb-4 border border-blue-100 rounded">
        <h3 className="text-sm font-medium text-blue-800 mb-2">Template Variables Being Used</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(templateData).map(([key, value]) => (
            <div key={key} className="text-xs">
              <span className="font-bold text-blue-700">{`{{${key}}}`}</span>
              <span className="text-gray-600">: {String(value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="flex justify-center p-4">Loading template...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
        <p>{error}</p>
      </div>
    );
  }

  if (!template) {
    return <div className="text-gray-500">No template data found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200">
        <div className="flex mb-0">
          <button
            onClick={() => setPreviewTab('html')}
            className={`py-2 px-4 font-medium text-sm ${
              previewTab === 'html'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            HTML Preview
          </button>
          <button
            onClick={() => setPreviewTab('text')}
            className={`py-2 px-4 font-medium text-sm ${
              previewTab === 'text'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Text Preview
          </button>
        </div>
      </div>

      <div className="bg-gray-50 p-4 rounded-md" style={{maxWidth: "900px", margin: "0 auto"}}>
        {templateData && (
          <div className="bg-green-50 p-3 mb-4 border border-green-100 rounded">
            <h3 className="text-sm font-medium text-green-800">Rendered Template Preview</h3>
            <p className="text-xs text-green-700 mt-1">
              This preview shows how the template will look with the provided template data.
            </p>
          </div>
        )}
        {getTemplateDataInfo()}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700">Subject</h3>
          <p className="mt-1 text-sm text-gray-900 bg-white p-2 border rounded">
            {template.Subject}
          </p>
        </div>

        {previewTab === 'html' ? (
          <div>
            <h3 className="text-sm font-medium text-gray-700">HTML Content</h3>
            <div className="mt-1 bg-white border rounded p-4 overflow-auto max-h-96">
<div 
  className="template-preview" 
  style={{
    maxWidth: "750px",
    width: "100%",
    margin: "0 auto",
    overflowWrap: "break-word",
    boxSizing: "border-box"
  }} 
  dangerouslySetInnerHTML={{ __html: template.Html || '<p>No HTML content</p>' }} 
/>
<style dangerouslySetInnerHTML={{ __html: `
  .template-preview img {
    display: block;
    margin-left: auto;
    margin-right: auto;
  }
  .template-preview .center, 
  .template-preview .centered {
    text-align: center;
  }
  .template-preview table {
    margin-left: auto;
    margin-right: auto;
  }
`}} />
            </div>
            <div className="mt-2 bg-gray-100 border rounded p-2 overflow-auto max-h-48 font-mono text-xs">
              <pre style={{maxWidth: "100%", overflowWrap: "break-word", whiteSpace: "pre-wrap"}}>{template.Html || 'No HTML content'}</pre>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-medium text-gray-700">Text Content</h3>
            <div className="mt-1 bg-white border rounded p-4 overflow-auto max-h-96">
              <pre className="whitespace-pre-wrap font-mono text-sm" style={{maxWidth: "750px", margin: "0 auto", overflowWrap: "break-word"}}>
                {template.Text || 'No text content'}
              </pre>
            </div>
          </div>
        )}
      </div>

      {!templateData && (
        <div className="bg-yellow-50 p-4 border border-yellow-100 rounded" style={{maxWidth: "900px", margin: "0 auto"}}>
          <h3 className="text-sm font-medium text-yellow-800">Template Variables</h3>
          <p className="text-xs text-yellow-700 mt-1">
            Variables like &#123;&#123;name&#125;&#125; will be replaced with actual values when sending emails.
          </p>
        </div>
      )}
    </div>
  );
};

export default TemplatePreview;
