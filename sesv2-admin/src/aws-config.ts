// AWS Configuration using environment variables
// Environment variables are loaded from .env file via dotenv-webpack

interface AwsConfig {
  region: string;
  userPoolId: string;
  userPoolWebClientId: string;
  oauth?: {
    domain: string;
    scope: string[];
    redirectSignIn: string;
    redirectSignOut: string;
    responseType: string;
  };
}

// Get environment variables with fallbacks for development
const awsConfig: AwsConfig = {
  // AWS Region
  region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
  
  // Cognito User Pool configuration
  userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || '',
  userPoolWebClientId: process.env.REACT_APP_COGNITO_APP_CLIENT_ID || '',
};

// Add OAuth configuration if domain is provided
if (process.env.REACT_APP_COGNITO_DOMAIN) {
  awsConfig.oauth = {
    domain: process.env.REACT_APP_COGNITO_DOMAIN,
    scope: ['email', 'profile', 'openid'],
    redirectSignIn: window.location.origin + '/',
    redirectSignOut: window.location.origin + '/',
    responseType: 'code',
  };
}

// Log configuration in development mode
if (process.env.NODE_ENV === 'development') {
  console.log('AWS Configuration:', {
    region: awsConfig.region,
    userPoolId: awsConfig.userPoolId ? 'configured' : 'missing',
    clientId: awsConfig.userPoolWebClientId ? 'configured' : 'missing',
    domain: awsConfig.oauth?.domain ? 'configured' : 'missing',
  });
}

export default awsConfig;
