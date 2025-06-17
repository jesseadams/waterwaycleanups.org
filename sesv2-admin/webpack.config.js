const path = require('path');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');

module.exports = {
  // Use the existing Create React App webpack configuration
  // This file is used to extend it with additional plugins
  
  plugins: [
    // Load environment variables from .env file
    new Dotenv({
      path: './.env', // Path to .env file (relative to root)
      safe: false, // Don't require '.env.example' verification
      systemvars: true, // Load all system variables as well and prioritize shell env vars
      silent: false, // Show any warnings
      defaults: false, // Don't load .env.defaults
      expand: true // Enables variable expansion
    }),
    
    // Explicitly define React App env variables to ensure they're available
    new webpack.DefinePlugin({
      'process.env.REACT_APP_AWS_REGION': JSON.stringify(process.env.REACT_APP_AWS_REGION),
      'process.env.REACT_APP_COGNITO_USER_POOL_ID': JSON.stringify(process.env.REACT_APP_COGNITO_USER_POOL_ID),
      'process.env.REACT_APP_COGNITO_APP_CLIENT_ID': JSON.stringify(process.env.REACT_APP_COGNITO_APP_CLIENT_ID),
      'process.env.REACT_APP_COGNITO_DOMAIN': JSON.stringify(process.env.REACT_APP_COGNITO_DOMAIN),
      'process.env.REACT_APP_COGNITO_IDENTITY_POOL_ID': JSON.stringify(process.env.REACT_APP_COGNITO_IDENTITY_POOL_ID),
      'process.env.REACT_APP_REDIRECT_URL': JSON.stringify(process.env.REACT_APP_REDIRECT_URL),
      'process.env.REACT_APP_S3_BUCKET': JSON.stringify(process.env.REACT_APP_S3_BUCKET),
      'process.env.REACT_APP_S3_PREFIX': JSON.stringify(process.env.REACT_APP_S3_PREFIX),
      'process.env.REACT_APP_S3_REGION': JSON.stringify(process.env.REACT_APP_S3_REGION)
    })
  ]
};
