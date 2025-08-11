import React, { useState } from 'react';
import ImageUploader from '../common/ImageUploader';
import { generateNewsletterContent, createNewsletterTemplate } from '../../utils/bedrock';
import { createEmailTemplate, updateEmailTemplate } from '../../utils/sesv2';

interface NewsletterGeneratorProps {
  onTemplateCreated?: (templateName: string) => void;
  onCancel?: () => void;
}

interface BulletPoint {
  id: string;
  text: string;
}

const NewsletterGenerator: React.FC<NewsletterGeneratorProps> = ({ onTemplateCreated, onCancel }) => {
  const [bulletPoints, setBulletPoints] = useState<BulletPoint[]>([
    { id: '1', text: '' }
  ]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const [tone, setTone] = useState<'professional' | 'casual' | 'enthusiastic' | 'informative'>('enthusiastic');
  const [targetAudience, setTargetAudience] = useState('environmental volunteers and supporters');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<any>(null);
  const [templateName, setTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const addBulletPoint = () => {
    setBulletPoints([...bulletPoints, { id: Date.now().toString(), text: '' }]);
  };

  const removeBulletPoint = (id: string) => {
    setBulletPoints(bulletPoints.filter(bp => bp.id !== id));
  };

  const updateBulletPoint = (id: string, text: string) => {
    setBulletPoints(bulletPoints.map(bp => 
      bp.id === id ? { ...bp, text } : bp
    ));
  };

  const handleImageUploaded = (imageUrl: string) => {
    setImageUrls([...imageUrls, imageUrl]);
    setShowImageUploader(false);
  };

  const removeImage = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    // Validate inputs
    const validBullets = bulletPoints.filter(bp => bp.text.trim()).map(bp => bp.text);
    
    if (validBullets.length === 0) {
      setError('Please add at least one bullet point.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);

    try {
      // Generate newsletter content using Bedrock
      const content = await generateNewsletterContent({
        bullets: validBullets,
        imageUrls,
        tone,
        targetAudience
      });

      setGeneratedContent(content);
      setShowPreview(true);
    } catch (err) {
      console.error('Error generating newsletter:', err);
      setError('Failed to generate newsletter content. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      setError('Please enter a template name.');
      return;
    }

    if (!generatedContent) {
      setError('No generated content to save.');
      return;
    }

    setIsSavingTemplate(true);
    setError(null);

    try {
      // Create the email template
      const template = createNewsletterTemplate(generatedContent);
      
      // Save to SES
      await createEmailTemplate(
        templateName,
        template.subject,
        template.htmlPart,
        template.textPart
      );

      // Call the callback if provided
      if (onTemplateCreated) {
        onTemplateCreated(templateName);
      }

      // Reset form
      setBulletPoints([{ id: '1', text: '' }]);
      setImageUrls([]);
      setGeneratedContent(null);
      setTemplateName('');
      setShowPreview(false);
      
      alert('Template saved successfully!');
    } catch (err: any) {
      console.error('Error saving template:', err);
      
      // Check if template already exists
      if (err.message?.includes('AlreadyExists')) {
        setError('A template with this name already exists. Please choose a different name.');
      } else {
        setError('Failed to save template. Please try again.');
      }
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const closePreview = () => {
    setShowPreview(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-semibold mb-6">AI Newsletter Generator</h2>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Bullet Points Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Newsletter Content Points
          </label>
          <p className="text-sm text-gray-500 mb-4">
            Add the key points you want to include in your newsletter. The AI will expand these into engaging content.
          </p>
          
          {bulletPoints.map((bullet, index) => (
            <div key={bullet.id} className="flex items-center mb-3">
              <span className="mr-2 text-gray-500">{index + 1}.</span>
              <input
                type="text"
                value={bullet.text}
                onChange={(e) => updateBulletPoint(bullet.id, e.target.value)}
                placeholder="Enter a key point for the newsletter..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {bulletPoints.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBulletPoint(bullet.id)}
                  className="ml-2 text-red-600 hover:text-red-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          
          <button
            type="button"
            onClick={addBulletPoint}
            className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            + Add another point
          </button>
        </div>

        {/* Images Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Newsletter Images (Optional)
          </label>
          <p className="text-sm text-gray-500 mb-4">
            Upload images to include in your newsletter. The AI will incorporate them appropriately.
          </p>
          
          {imageUrls.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              {imageUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Newsletter image ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {showImageUploader ? (
            <ImageUploader
              onImageUploaded={handleImageUploaded}
              onCancel={() => setShowImageUploader(false)}
              maxSize={10} // Increase to 10MB if needed
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowImageUploader(true)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Upload Image
            </button>
          )}
        </div>

        {/* Tone Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Newsletter Tone
          </label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="enthusiastic">Enthusiastic</option>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="informative">Informative</option>
          </select>
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target Audience
          </label>
          <input
            type="text"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="e.g., environmental volunteers and supporters"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Generate Button */}
        <div className="flex justify-end space-x-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isGenerating ? 'Generating...' : 'Generate Newsletter'}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && generatedContent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="text-xl font-semibold">Generated Newsletter Preview</h3>
              <p className="text-gray-600 mt-1">Subject: {generatedContent.subject}</p>
            </div>
            
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 250px)' }}>
              {/* HTML Preview */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-700 mb-2">HTML Version</h4>
                <div className="bg-gray-50 p-4 rounded border">
                  <div 
                    dangerouslySetInnerHTML={{ __html: generatedContent.htmlContent }}
                    className="email-preview"
                  />
                </div>
              </div>
              
              {/* Text Preview */}
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Text Version</h4>
                <div className="bg-gray-50 p-4 rounded border">
                  <pre className="whitespace-pre-wrap font-sans text-sm">{generatedContent.textContent}</pre>
                </div>
              </div>
            </div>
            
            <div className="border-t p-4 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Enter template name..."
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveAsTemplate}
                    disabled={isSavingTemplate || !templateName.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300"
                  >
                    {isSavingTemplate ? 'Saving...' : 'Save as Template'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={closePreview}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsletterGenerator;
