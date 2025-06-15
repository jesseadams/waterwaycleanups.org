import React from 'react';
import { Authenticator, ThemeProvider, Button, useTheme } from '@aws-amplify/ui-react';
import { useNavigate } from 'react-router-dom';
import { signInWithRedirect } from 'aws-amplify/auth';
import '@aws-amplify/ui-react/styles.css';
import amplifyConfig from '../../amplifyconfiguration';

// Google SSO button component
const GoogleSignInButton = () => {
  const { tokens } = useTheme();
  
  // Using the latest Amplify v6 Google sign-in pattern
  const signInWithGoogle = async () => {
    try {
      console.log('Attempting Google sign-in with Amplify v6...');
      
      // Log legacy configuration values - these need to be present for some components
      console.log('Legacy Amplify Auth Configuration:', {
        aws_user_pools_id: amplifyConfig.aws_user_pools_id,
        aws_user_pools_web_client_id: amplifyConfig.aws_user_pools_web_client_id,
        oauth: amplifyConfig.oauth
      });
      
      // Also log Gen 2 configuration values
      console.log('Gen 2 Amplify Auth Configuration:', {
        userPoolId: amplifyConfig?.Auth?.Cognito?.userPoolId,
        userPoolClientId: amplifyConfig?.Auth?.Cognito?.userPoolClientId,
        region: amplifyConfig?.Auth?.Cognito?.region,
        oauthDomain: amplifyConfig?.Auth?.Cognito?.loginWith?.oauth?.domain,
      });
      
      // Check for minimum required configuration
      if (!amplifyConfig.aws_user_pools_id || !amplifyConfig.aws_user_pools_web_client_id) {
        console.error('CRITICAL: User pool configuration is missing in legacy format');
        alert('Authentication configuration missing. Please check console logs.');
        return;
      }
      
      // Simplest possible options object without type annotations
      // This matches the format expected by Amplify v6
      console.log('Calling signInWithRedirect with Google...');
      
      // Use the simplest direct approach 
      await signInWithRedirect({ provider: 'Google' });
      
      // This won't be reached immediately as the redirect happens
      console.log('If you see this, redirect did not happen immediately');
    } catch (error) {
      console.error('Error during Google sign-in:', error);
      
      // Safely log error details with proper type checking
      if (error && typeof error === 'object') {
        const errorObj = error as Error & { code?: string };
        console.log('Google sign-in error details:', {
          name: errorObj.name || 'Unknown error',
          message: errorObj.message || 'No message available',
          code: errorObj.code || 'No error code'
        });
        
        // Show a user-friendly error message
        alert(`Authentication error: ${errorObj.message || 'Failed to sign in with Google. Please try again.'}`);
      }
    }
  };
  
  return (
    <Button
      variation="primary"
      onClick={signInWithGoogle}
      className="mt-4 w-full flex items-center justify-center space-x-2"
      style={{
        backgroundColor: '#4285F4',
        color: 'white',
        borderRadius: '4px',
        padding: '10px 16px',
        fontSize: '16px',
        fontWeight: 500,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
      }}
    >
      <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
      </svg>
      <span className="ml-2">Sign in with Google</span>
    </Button>
  );
};

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { tokens } = useTheme();

  // Custom login form styling
  const formComponents = {
    SignIn: {
      Header() {
        return (
          <div className="text-center mt-8 mb-8">
            <h1 className="text-2xl font-semibold text-gray-800">SESv2 Admin</h1>
            <p className="text-gray-600">Sign in to access the admin interface</p>
          </div>
        );
      },
      Footer() {
        return (
          <div className="mt-5 mb-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>
            <GoogleSignInButton />
          </div>
        );
      },
    },
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md">
        <ThemeProvider>
          <Authenticator
            components={formComponents}
            loginMechanisms={['email', 'username']}
          >
            {({ user }) => {
              navigate('/');
              return <div>Logging in...</div>;
            }}
          </Authenticator>
        </ThemeProvider>
      </div>
    </div>
  );
};

export default Login;
