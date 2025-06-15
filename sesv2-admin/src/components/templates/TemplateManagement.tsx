import React, { useState, useEffect } from 'react';
import { listEmailTemplates, deleteEmailTemplate, cloneEmailTemplate } from '../../utils/sesv2';
import TemplateForm from './TemplateForm';
import TemplatePreview from './TemplatePreview';
import TemplateEditForm from './TemplateEditForm';

// Using 'any' here since the AWS SDK types are complex and this simplifies the component
interface Template {
  TemplateName: string;
  CreatedTimestamp?: Date;
}

const TemplateManagement: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState<boolean>(false);
  const [isEditingTemplate, setIsEditingTemplate] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [isCloningTemplate, setIsCloningTemplate] = useState<boolean>(false);
  const [cloneSourceTemplate, setCloneSourceTemplate] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState<string>("");
  const [isCloning, setIsCloning] = useState<boolean>(false);

  // Fetch templates on component mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await listEmailTemplates();
      // Ensure we have valid template names by filtering out undefined
      const templates = (response.TemplatesMetadata || [])
        .filter(template => template.TemplateName)
        .map(template => ({
          ...template,
          TemplateName: template.TemplateName as string
        }));
      setTemplates(templates);
    } catch (error) {
      console.error('Error fetching email templates:', error);
      setError('Failed to load email templates. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async (name: string) => {
    if (window.confirm(`Are you sure you want to delete the template "${name}"?`)) {
      try {
        await deleteEmailTemplate(name);
        fetchTemplates();
        if (selectedTemplate === name) {
          setSelectedTemplate(null);
          setIsPreviewMode(false);
        }
      } catch (error) {
        console.error(`Error deleting template ${name}:`, error);
      }
    }
  };

  const handleTemplateCreated = () => {
    setIsCreatingTemplate(false);
    fetchTemplates();
  };

  const togglePreviewMode = (templateName: string | null) => {
    setSelectedTemplate(templateName);
    setIsPreviewMode(!!templateName);
    setIsEditingTemplate(false);
  };
  
  const handleEditTemplate = (templateName: string) => {
    setSelectedTemplate(templateName);
    setIsEditingTemplate(true);
    setIsPreviewMode(false);
    setIsCreatingTemplate(false);
  };
  
  const handleEditSuccess = () => {
    setIsEditingTemplate(false);
    fetchTemplates();
  };
  
  // Handle showing the clone template dialog
  const handleShowCloneDialog = (templateName: string) => {
    setCloneSourceTemplate(templateName);
    setNewTemplateName(templateName + '_copy');
    setIsCloningTemplate(true);
  };
  
  // Handle the template cloning process
  const handleCloneTemplate = async () => {
    if (!cloneSourceTemplate || !newTemplateName) return;
    
    setIsCloning(true);
    try {
      await cloneEmailTemplate(cloneSourceTemplate, newTemplateName);
      // Reset state and refresh templates
      setIsCloningTemplate(false);
      setCloneSourceTemplate(null);
      setNewTemplateName('');
      fetchTemplates();
    } catch (error) {
      console.error('Error cloning template:', error);
      setError('Failed to clone the template. Please try again.');
    } finally {
      setIsCloning(false);
    }
  };
  
  // Handle canceling the clone operation
  const handleCancelClone = () => {
    setIsCloningTemplate(false);
    setCloneSourceTemplate(null);
    setNewTemplateName('');
  };

  if (isLoading && templates.length === 0) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Template Management</h1>
        <button
          onClick={() => {
            setIsCreatingTemplate(true);
            setIsPreviewMode(false);
            setIsEditingTemplate(false);
            setSelectedTemplate(null);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Template
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
          <p>{error}</p>
        </div>
      )}

      {/* Clone Template Modal */}
      {isCloningTemplate && cloneSourceTemplate && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Clone Template</h3>
            <p className="mb-4 text-gray-600">
              Create a copy of <span className="font-semibold">{cloneSourceTemplate}</span> with a new name:
            </p>
            
            <div className="mb-4">
              <label htmlFor="newTemplateName" className="block text-sm font-medium text-gray-700 mb-1">
                New Template Name *
              </label>
              <input
                type="text"
                id="newTemplateName"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="my_new_template"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Use a simple name without spaces. This will be the identifier for your cloned template.
              </p>
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={handleCancelClone}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                disabled={isCloning}
              >
                Cancel
              </button>
              <button
                onClick={handleCloneTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                disabled={isCloning || !newTemplateName.trim()}
              >
                {isCloning ? 'Cloning...' : 'Clone Template'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {isCreatingTemplate && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Create Email Template</h2>
          <TemplateForm
            onSuccess={handleTemplateCreated}
            onCancel={() => setIsCreatingTemplate(false)}
          />
        </div>
      )}

      {isEditingTemplate && selectedTemplate && (
        <div className="bg-white p-6 rounded-lg shadow max-w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold truncate max-w-[70%]">Edit Template: {selectedTemplate}</h2>
            <button
              onClick={() => setIsEditingTemplate(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
          <div className="max-w-full overflow-hidden">
            <TemplateEditForm 
              templateName={selectedTemplate} 
              onSuccess={handleEditSuccess} 
              onCancel={() => setIsEditingTemplate(false)} 
            />
          </div>
        </div>
      )}

      {isPreviewMode && selectedTemplate && !isEditingTemplate && (
        <div className="bg-white p-6 rounded-lg shadow max-w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold truncate max-w-[70%]">Template Preview: {selectedTemplate}</h2>
            <button
              onClick={() => setIsPreviewMode(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Close Preview
            </button>
          </div>
          <div className="max-w-full overflow-hidden">
            <TemplatePreview templateName={selectedTemplate} />
          </div>
        </div>
      )}

      {!isPreviewMode && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Email Templates</h2>
          {templates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Template Name
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {templates.map((template) => (
                    <tr key={template.TemplateName} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {template.TemplateName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {template.CreatedTimestamp ? new Date(template.CreatedTimestamp).toLocaleString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => togglePreviewMode(template.TemplateName)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => handleEditTemplate(template.TemplateName)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleShowCloneDialog(template.TemplateName)}
                            className="text-purple-600 hover:text-purple-900"
                          >
                            Clone
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.TemplateName)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No email templates found. Create a template to get started.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default TemplateManagement;
