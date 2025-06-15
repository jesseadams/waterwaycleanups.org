/**
 * Amplify Gen 2 Configuration
 * This is the standard configuration file for Amplify Gen 2
 * 
 * All configuration values should come from environment variables defined in .env
 */

// Define environment variable accessor with better error messaging
const getEnvVar = (name: string, required = true): string => {
  const value = process.env[name];
  if (required && !value) {
    console.error(`Missing required environment variable: ${name}`);
  }
  return value || '';
};

// Get environment variables
const region = getEnvVar('REACT_APP_AWS_REGION');
const userPoolId = getEnvVar('REACT_APP_COGNITO_USER_POOL_ID');
const userPoolClientId = getEnvVar('REACT_APP_COGNITO_APP_CLIENT_ID');
const domain = getEnvVar('REACT_APP_COGNITO_DOMAIN');
const identityPoolId = getEnvVar('REACT_APP_COGNITO_IDENTITY_POOL_ID');
const redirectUrl = getEnvVar('REACT_APP_REDIRECT_URL', false) || 'http://localhost:3000';

// Standard Amplify Gen 2 configuration object formatted exactly as required by AWS Amplify
export const amplifyConfig = {
  // Legacy format required for some Amplify components - EXACT format matters!
  aws_project_region: region,
  aws_cognito_region: region,
  aws_user_pools_id: userPoolId,
  aws_user_pools_web_client_id: userPoolClientId, 
  aws_cognito_identity_pool_id: identityPoolId,
  oauth: {
    domain: domain,
    scope: ['email', 'profile', 'openid'],
    redirectSignIn: redirectUrl,  // EXACT match, no trailing slash
    redirectSignOut: redirectUrl, // EXACT match, no trailing slash
    responseType: 'code',
    redirectUri: redirectUrl      // EXACT match, no trailing slash
  },
  federationTarget: 'COGNITO_USER_POOLS',

  // New Gen 2 configuration format
  Auth: {
    Cognito: {
      region: region,
      userPoolId: userPoolId,
      userPoolClientId: userPoolClientId,
      
      // OAuth configuration for Google SSO
      loginWith: {
        oauth: {
          domain: domain,
          scopes: ['email', 'profile', 'openid'],
          // All entries must EXACTLY match what's configured in Cognito
          redirectSignIn: redirectUrl,
          redirectSignOut: redirectUrl,
          responseType: 'code',
          // This explicit redirectUri must match exactly too
          redirectUri: redirectUrl
        },
        // Allow users to sign in with email/password as well
        username: true,
        email: true
      }
    }
  }
};

// Log configuration details in development
if (process.env.NODE_ENV === 'development') {
  console.log('Amplify Configuration:', {
    region: amplifyConfig.Auth.Cognito.region,
    userPoolConfigured: !!amplifyConfig.Auth.Cognito.userPoolId && !!amplifyConfig.Auth.Cognito.userPoolClientId,
    oauthConfigured: !!amplifyConfig.Auth.Cognito.loginWith?.oauth?.domain,
    identityPoolConfigured: !!amplifyConfig.aws_cognito_identity_pool_id,
    // Do not log the actual IDs or client secrets in production
    missing: [
      !region && 'REACT_APP_AWS_REGION',
      !userPoolId && 'REACT_APP_COGNITO_USER_POOL_ID',
      !userPoolClientId && 'REACT_APP_COGNITO_APP_CLIENT_ID',
      !domain && 'REACT_APP_COGNITO_DOMAIN',
      !identityPoolId && 'REACT_APP_COGNITO_IDENTITY_POOL_ID'
    ].filter(Boolean)
  });
}

export default amplifyConfig;
