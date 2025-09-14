console.log('Loading React app...');

import React from 'react';
import { createRoot } from 'react-dom/client';

// Simple inline App component to test
const App = () => {
  return React.createElement('div', { 
    className: 'font-sans antialiased text-gray-800 p-8' 
  }, [
    React.createElement('h1', { 
      key: 'title',
      className: 'text-3xl font-bold text-brand-blue mb-4' 
    }, 'Waterway Cleanups Merchandise'),
    React.createElement('p', { 
      key: 'description',
      className: 'text-lg text-gray-600' 
    }, 'Shopping cart loading... This proves React is working!'),
    React.createElement('div', {
      key: 'stripe-info',
      className: 'mt-4 p-4 bg-green-100 rounded'
    }, `Stripe key loaded: ${window.STRIPE_PUBLISHABLE_KEY ? 'Yes' : 'No'}`)
  ]);
};

console.log('Modules imported successfully');

const rootElement = document.getElementById('root');
console.log('Root element:', rootElement);

if (!rootElement) {
  console.error("Could not find root element to mount to");
  throw new Error("Could not find root element to mount to");
}

console.log('Creating React root...');
const root = createRoot(rootElement);

console.log('Rendering app...');
root.render(
  React.createElement(React.StrictMode, null, React.createElement(App))
);

console.log('App rendered successfully');