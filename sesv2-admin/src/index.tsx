import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';

// Import Amplify modules
import { Amplify } from 'aws-amplify';
import * as auth from 'aws-amplify/auth';
import amplifyConfig from './amplifyconfiguration';

// Debug what config we're using
console.log('Raw Amplify Config being used:', {
  region: amplifyConfig.Auth.Cognito.region,
  userPoolId: amplifyConfig.Auth.Cognito.userPoolId, 
  userPoolWebClientId: amplifyConfig.Auth.Cognito.userPoolClientId
});

// Configure Amplify in Gen 2 style
Amplify.configure(amplifyConfig);

// For debug purposes - output version information
console.log('Auth module available methods:', Object.keys(auth).join(', '));

// Debug post-configuration
console.log('Amplify configured successfully with Auth module');

// Log environment and configuration in development mode
if (process.env.NODE_ENV === 'development') {
  // Log application origin for redirect URL configuration
  console.log('Application origin:', window.location.origin);
  
  // Log runtime configuration loaded into Amplify
  console.log('Amplify Authentication Configuration:', {
    userPoolId: amplifyConfig.Auth.Cognito.userPoolId ? '✓' : '✗',
    userPoolClientId: amplifyConfig.Auth.Cognito.userPoolClientId ? '✓' : '✗',
    domain: amplifyConfig.Auth.Cognito.loginWith?.oauth?.domain ? '✓' : '✗',
    region: amplifyConfig.Auth.Cognito.region || 'default'
  });
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <BrowserRouter basename="/sesv2-admin">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
