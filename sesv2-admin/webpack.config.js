const path = require('path');
const Dotenv = require('dotenv-webpack');

module.exports = {
  // Use the existing Create React App webpack configuration
  // This file is used to extend it with additional plugins
  
  plugins: [
    // Load environment variables from .env file
    new Dotenv({
      path: './.env', // Path to .env file (relative to root)
      safe: false, // Don't require '.env.example' verification
      systemvars: true, // Load all system variables as well
      silent: false, // Show any warnings
      defaults: false, // Don't load .env.defaults
      expand: true // Enables variable expansion
    })
  ]
};
