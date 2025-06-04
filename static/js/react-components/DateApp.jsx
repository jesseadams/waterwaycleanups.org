import React from 'react';
import { createRoot } from 'react-dom/client';
import DateIcon from './DateIcon';

//* Find all date containers on the page
document.addEventListener('DOMContentLoaded', () => {
  console.log('DateApp starting - looking for containers');
  const dateContainers = document.querySelectorAll('[data-react-date]');
  console.log(`Found ${dateContainers.length} date containers`);
  
  dateContainers.forEach((container, index) => {
    console.log(`Processing date container ${index}`);
    const date = container.getAttribute('data-date');
    const className = container.getAttribute('data-class') || '';
    
    //* Create a root using the React 18 API
    const root = createRoot(container);
    root.render(
      <DateIcon 
        date={date}
        className={className}
      />
    );
  });
}); 