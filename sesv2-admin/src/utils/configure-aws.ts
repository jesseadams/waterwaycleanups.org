import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import amplifyConfig from '../amplifyconfiguration';

// Ensure Amplify is properly configured
Amplify.configure(amplifyConfig);

/**
 * Gets AWS credentials directly from Amplify Auth session
 * This is the recommended approach for Amplify Gen 2 apps
 */
export const getAwsCredentials = async () => {
  try {
    console.log('Fetching AWS credentials from Amplify Auth session...');
    
    // First check if the user is authenticated
    try {
      const currentUser = await getCurrentUser();
      console.log('Current user authenticated:', currentUser.username);
    } catch (e) {
      console.error('No authenticated user found');
      throw new Error('You must sign in to access this feature');
    }
    
    // Get the auth session
    const session = await fetchAuthSession();
    
    // Ensure we have tokens
    if (!session || !session.tokens) {
      console.error('No tokens found in auth session');
      throw new Error('Authentication failed - no tokens available');
    }
    
    console.log('Successfully obtained auth tokens for AWS services');
    
    // Return the credentials
    return {
      accessKeyId: session.credentials?.accessKeyId || '',
      secretAccessKey: session.credentials?.secretAccessKey || '',
      sessionToken: session.credentials?.sessionToken,
      identityId: session.identityId
    };
  } catch (error: any) {
    console.error('Failed to get AWS credentials:', error);
    throw new Error('Authentication error: ' + (error?.message || 'Unknown error'));
  }
};

/**
 * Default AWS configuration for service clients
 */
export const getAwsConfig = async () => {
  return {
    region: amplifyConfig.aws_project_region,
    credentials: await getAwsCredentials(),
  };
};
