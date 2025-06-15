import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';

interface RequireAuthProps {
  children: React.ReactNode;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { route } = useAuthenticator((context) => [context.route]);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (route !== 'authenticated') {
      navigate('/login');
    }
  }, [route, navigate]);

  if (route !== 'authenticated') {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-4">Authentication Required</h1>
          <p>Please sign in to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
