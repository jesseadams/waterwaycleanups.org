import React, { useState } from 'react';
// Import directly from aws-config.ts instead of .js
import awsConfig from '../../aws-config';

/**
 * Configuration utility page for developers
 * This allows quick updates to AWS configuration during development
 * Should be disabled or protected in production
 */
const ConfigPage: React.FC = () => {
  const [config, setConfig] = useState({
    region: '',
    userPoolId: '',
    userPoolWebClientId: '',
    domain: '',
    redirectSignIn: window.location.origin + '/',
    redirectSignOut: window.location.origin + '/',
  });
  const [message, setMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Format the config as needed by Amplify
      const formattedConfig = {
        region: config.region,
        userPoolId: config.userPoolId,
        userPoolWebClientId: config.userPoolWebClientId,
        oauth: {
          domain: config.domain,
          scope: ['email', 'profile', 'openid'],
          redirectSignIn: config.redirectSignIn,
          redirectSignOut: config.redirectSignOut,
          responseType: 'code'
        }
      };
      
      // Save to local storage - using localStorage directly since aws-config.js export caused issues
      localStorage.setItem('aws-config', JSON.stringify(formattedConfig));
      console.log('Saved AWS config to local storage');
      // Will reload to apply new config
      setTimeout(() => window.location.reload(), 1500);
      setMessage({ text: 'Configuration saved. Page will reload to apply changes.', type: 'success' });
    } catch (error) {
      console.error('Error saving configuration:', error);
      setMessage({ text: 'Failed to save configuration. See console for details.', type: 'error' });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-semibold mb-6">AWS Configuration</h1>
        
        <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-400">
          <p className="text-yellow-700">
            <strong>Developer Tool:</strong> This page is for development use only. 
            In production, you should configure these values in your deployment environment.
          </p>
        </div>
        
        {message && (
          <div className={`mb-6 p-4 rounded ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AWS Region
              </label>
              <input
                type="text"
                name="region"
                value={config.region}
                onChange={handleChange}
                placeholder="us-east-1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cognito User Pool ID
              </label>
              <input
                type="text"
                name="userPoolId"
                value={config.userPoolId}
                onChange={handleChange}
                placeholder="us-east-1_xxxxxxxxx"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                From Terraform output: cognito_user_pool_id
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App Client ID
              </label>
              <input
                type="text"
                name="userPoolWebClientId"
                value={config.userPoolWebClientId}
                onChange={handleChange}
                placeholder="1abc2defghijk3lmnop4qrst5u"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                From Terraform output: cognito_app_client_id
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cognito Domain
              </label>
              <input
                type="text"
                name="domain"
                value={config.domain}
                onChange={handleChange}
                placeholder="ses-admin-portal.auth.us-east-1.amazoncognito.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                From Terraform output: cognito_domain (without https://)
              </p>
            </div>
            
            <div className="pt-4 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConfigPage;
