import React from 'react';
import { createRoot } from 'react-dom/client';
import ParallaxImage from './ParallaxImage';

//* Find all parallax containers on the page
document.addEventListener('DOMContentLoaded', () => {
  console.log('ParallaxApp starting - looking for containers');
  const parallaxContainers = document.querySelectorAll('[data-react-parallax]');
  console.log(`Found ${parallaxContainers.length} parallax containers`);
  
  parallaxContainers.forEach((container, index) => {
    console.log(`Processing container ${index}`);
    const src = container.getAttribute('data-src');
    const alt = container.getAttribute('data-alt') || '';
    const height = container.getAttribute('data-height') || '500px';
    const width = container.getAttribute('data-width');
    const scale = parseFloat(container.getAttribute('data-scale') || '1.2');
    const speed = parseFloat(container.getAttribute('data-speed') || '0.3');
    // Get bobbing attribute - defaults to false if not specified
    const bobbing = container.getAttribute('data-bobbing') === 'true';
    
    //* Get the container's parent to check for nested containers
    const parentStyle = window.getComputedStyle(container.parentNode);
    console.log(`Container ${index} parent overflow: ${parentStyle.overflow}`);
    
    //* Create a root using the new API (18)
    const root = createRoot(container);
    root.render(
      <ParallaxImage 
        src={src} 
        alt={alt} 
        height={height}
        width={width}
        scale={scale}
        speed={speed}
        bobbing={bobbing}
      />
    );
  });
}); 