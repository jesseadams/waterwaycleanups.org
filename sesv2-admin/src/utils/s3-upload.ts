import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getAwsConfig } from './configure-aws';
import awsConfig from '../aws-config';

// S3 bucket configuration
// Get from environment variables
const S3_BUCKET = process.env.REACT_APP_S3_BUCKET || 'waterway-cleanups-newsletter-photos';
const S3_REGION = process.env.REACT_APP_S3_REGION || awsConfig.region;
const S3_PREFIX = process.env.REACT_APP_S3_PREFIX || '/';

/**
 * Get the full URL for an S3 object
 * 
 * @param key The S3 object key
 * @returns The full URL to the S3 object
 */
export const getS3Url = (key: string): string => {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
};

/**
 * Upload a file to S3 and return the URL
 * 
 * @param file The file to upload
 * @param customFileName Optional custom filename to use instead of the original
 * @returns Promise that resolves to the URL of the uploaded file
 */
export const uploadImageToS3 = async (file: File, customFileName?: string): Promise<string> => {
  try {
    // Get fresh AWS config with current Cognito credentials
    const config = await getAwsConfig();
    
    // Create a new S3 client for each upload to ensure fresh credentials
    const s3Client = new S3Client({
      region: S3_REGION,
      credentials: config.credentials
    });

    // Generate a unique filename if not provided
    const fileName = customFileName || `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const key = `${S3_PREFIX}${fileName}`;

    // Convert File to Uint8Array for more reliable handling with AWS SDK
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.readAsArrayBuffer(file);
      fileReader.onload = () => resolve(fileReader.result as ArrayBuffer);
      fileReader.onerror = (error) => reject(error);
    });
    
    // Convert ArrayBuffer to Uint8Array which is compatible with AWS SDK
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload the file to S3 using Uint8Array
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: uint8Array,
      ContentType: file.type,
      ACL: 'public-read', // Make the file publicly accessible
    });

    await s3Client.send(command);

    // Construct and return the URL of the uploaded file
    return getS3Url(key);
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    throw error;
  }
};

/**
 * Get a presigned URL for uploading directly to S3
 * This is an alternative approach that could be implemented if needed
 */
export const getPresignedUploadUrl = async (fileName: string, fileType: string) => {
  // Implementation for getting presigned URL would go here
  // This would require additional AWS SDK packages
  // Not implemented in this version but kept as a placeholder
};