import React, { useState, useRef } from 'react';
import { uploadImageToS3 } from '../../utils/s3-upload';

interface ImageUploaderProps {
  onImageUploaded: (imageUrl: string) => void;
  onCancel?: () => void;
  maxSize?: number; // in MB
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ 
  onImageUploaded, 
  onCancel,
  maxSize = 5 // Default max size is 5MB
}) => {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const maxSizeBytes = maxSize * 1024 * 1024; // Convert MB to bytes
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    // Check file size
    if (file.size > maxSizeBytes) {
      setError(`File is too large. Maximum size is ${maxSize}MB.`);
      return;
    }
    
    // Check file type - only accept images
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.');
      return;
    }
    
    setError(null);
    setIsUploading(true);
    setProgress(10); // Start progress indicator
    
    try {
      // Simulated progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);
      
      // Upload the image to S3
      const imageUrl = await uploadImageToS3(file);
      
      // Clear progress indicator and interval
      clearInterval(progressInterval);
      setProgress(100);
      
      // Call the callback with the uploaded image URL
      onImageUploaded(imageUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      setError('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  return (
    <div className="image-uploader p-4 bg-white rounded-md shadow-sm">
      <h3 className="text-lg font-medium text-gray-700 mb-2">Upload Image to S3</h3>
      <p className="text-sm text-gray-500 mb-4">
        Images will be uploaded to the <code>waterway-cleanups-newsletter-photos</code> bucket.
      </p>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-2 mb-4">
          <p>{error}</p>
        </div>
      )}
      
      <div className="mb-4">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
        
        <button
          type="button"
          onClick={triggerFileInput}
          disabled={isUploading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isUploading ? 'Uploading...' : 'Select Image'}
        </button>
        
        <p className="mt-1 text-xs text-gray-500">
          Maximum file size: {maxSize}MB. Supported formats: JPG, PNG, GIF, SVG.
          <br />Images will be publicly accessible for email templates.
        </p>
      </div>
      
      {isUploading && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-1">Uploading: {progress}%</p>
        </div>
      )}
      
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isUploading}
          className="px-4 py-2 text-gray-700 rounded hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ImageUploader;
