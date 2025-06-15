import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';

const Layout: React.FC = () => {
  const location = useLocation();
  const { signOut, user } = useAuthenticator((context) => [
    context.user,
    context.signOut,
  ]);

  const navItems = [
    { path: "/", label: "Dashboard" },
    { path: "/contacts", label: "Contacts" },
    { path: "/templates", label: "Templates" },
    { path: "/send-emails", label: "Send Emails" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-blue-800 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">SES Admin</h1>
          <div className="flex items-center gap-4">
            <span>Welcome, {user?.username}</span>
            <button
              onClick={signOut}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <nav className="w-64 bg-gray-100 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`block p-2 rounded ${
                    location.pathname === item.path
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
