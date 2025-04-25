import React, { useEffect, useRef } from 'react';
import SimpleParallax from 'simple-parallax-js';

const ParallaxImage = ({ src, alt, height, width, scale = 1.2, bobbing = false, speed = 0.3 }) => {
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (imageRef.current) {
      // Initialize parallax effect
      new SimpleParallax(imageRef.current, {
        delay: speed,
        orientation: 'up',
        transition: 'cubic-bezier(0,0,0,1)',
        scale: scale,
        overflow: true,
        maxTransition: 90
      });
    }
    
    // Add bobbing animation only if the bobbing prop is true
    if (bobbing && containerRef.current) {
      const startBobAnimation = () => {
        let animationFrameId;
        
        const bobAnimation = () => {
          const now = Date.now() / 1000;
          // Increased vertical movement to 2% for more noticeable effect
          const translateY = Math.sin(now) * 2;
          containerRef.current.style.transform = `translateY(${translateY}%)`;
          animationFrameId = requestAnimationFrame(bobAnimation);
        };
        
        animationFrameId = requestAnimationFrame(bobAnimation);
        
        return () => {
          // Cancel animation frame when component unmounts or effect reruns
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
          }
        };
      };
      
      const cleanup = startBobAnimation();
      return cleanup;
    }
    
    return () => {
      // Cleanup for parallax if needed
    };
  }, [scale, bobbing, speed]);
  
  // Check if we should preserve original size or use fixed dimensions
  const hasFixedDimensions = width && height && height !== 'auto';
  
  return (
    <div 
      ref={containerRef}
      style={{
        width: hasFixedDimensions ? width : '100%',
        height: hasFixedDimensions ? height : '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden'
      }}
    >
      <img 
        ref={imageRef}
        src={src} 
        alt={alt || "Parallax image"} 
        className="parallax"
        style={{ 
          width: hasFixedDimensions ? '100%' : '100%', 
          height: hasFixedDimensions ? '100%' : '100%', 
          objectFit: hasFixedDimensions ? 'contain' : 'cover',
          position: 'relative',
        }}
      />
    </div>
  );
};

export default ParallaxImage; 