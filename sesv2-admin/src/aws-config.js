// AWS Configuration file
// Load configuration from amplify_outputs.json first, then fallback to environment variables

import amplifyOutputs from './amplify_outputs.json';

const awsConfig = {
  // Region where AWS services are deployed
  region: amplifyOutputs.auth?.region || process.env.REACT_APP_AWS_REGION || 'us-east-1',

  // Cognito User Pool configuration
  userPoolId: amplifyOutputs.auth?.userPoolId || process.env.REACT_APP_COGNITO_USER_POOL_ID || '',
  userPoolWebClientId: amplifyOutputs.auth?.userPoolClientId || process.env.REACT_APP_COGNITO_APP_CLIENT_ID || '',
  
  // Optional: OAuth configuration for hosted UI and social sign-in
  oauth: {
    domain: amplifyOutputs.auth?.oAuthDomain || process.env.REACT_APP_COGNITO_DOMAIN || '',
    scope: ['email', 'profile', 'openid'],
    redirectSignIn: amplifyOutputs.auth?.redirectSignIn || 'http://localhost:3000',
    redirectSignOut: amplifyOutputs.auth?.redirectSignOut || 'http://localhost:3000',
    responseType: 'code'
  },
  
  // Configure Amplify Auth settings
  Auth: {
    // Advanced settings
    mandatorySignIn: true,
    authenticationFlowType: 'USER_SRP_AUTH',
  }
};

// Helper function to check if running in development mode
const isDev = () => {
  //return process.env.NODE_ENV === 'development';
  return false
};

// Helper function to load local storage configuration (useful for development)
const loadLocalStorageConfig = () => {
  const localConfig = localStorage.getItem('aws-config');
  if (localConfig) {
    try {
      const parsedConfig = JSON.parse(localConfig);
      console.log('Loaded AWS config from local storage', parsedConfig);
      return parsedConfig;
    } catch (e) {
      console.error('Failed to parse local AWS config', e);
    }
  }
  return null;
};

// Use local storage config in development if available
const finalConfig = isDev() ? (loadLocalStorageConfig() || awsConfig) : awsConfig;

// Function to save config to local storage for development
export const saveConfigToLocalStorage = (config) => {
  if (isDev()) {
    localStorage.setItem('aws-config', JSON.stringify(config));
    console.log('Saved AWS config to local storage');
    // Reload to apply new config
    window.location.reload();
  }
};

export default finalConfig;
