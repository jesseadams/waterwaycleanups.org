// Demo authentication configuration
// Replace with real Cognito configuration in production

const demoAuth = {
  enabled: true, // Set to false when using real Cognito authentication
  credentials: {
    username: 'admin',
    password: 'password123'
  }
};

export default demoAuth;
