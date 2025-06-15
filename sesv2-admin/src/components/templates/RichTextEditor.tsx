import React, { useState, useEffect, useRef } from 'react';
import ImageUploader from '../common/ImageUploader';

// Interface for formatting button
interface FormattingButton {
  command: string;
  icon: string;
  title: string;
  value?: string;
}

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  value, 
  onChange, 
  placeholder = "Enter HTML content here...", 
  height = '300px' 
}) => {
  const [showHtmlView, setShowHtmlView] = useState(true);
  const [htmlValue, setHtmlValue] = useState(value);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const latestContentRef = useRef<string>(value);
  const isUpdatingRef = useRef<boolean>(false);
  const savedSelectionRef = useRef<{ start: number, end: number } | null>(null);

  // Initialize with the provided value only once on mount
  useEffect(() => {
    setHtmlValue(value);
    latestContentRef.current = value;
  }, []);
  
  // Add image resizing functionality
  useEffect(() => {
    if (!showHtmlView && contentEditableRef.current) {
      // Setup image resizing functionality
      const setupImageResizing = () => {
        const editor = contentEditableRef.current;
        if (!editor) return;
        
        // Track resize state
        let isResizing = false;
        let currentImage: HTMLImageElement | null = null;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        
        // Handler for mouse down on resize handle
        const handleMouseDown = (e: MouseEvent) => {
          // Check if clicking on an image or its resize handle
          let target = e.target as HTMLElement;
          
          // If we clicked on an image or its resize handle
          if (target.closest('.resizable-image')) {
            const img = target.closest('.resizable-image') as HTMLImageElement;
            
            // Check if we're clicking near the bottom-right corner (resize area)
            const rect = img.getBoundingClientRect();
            const isInResizeArea = 
              e.clientX > rect.right - 15 && 
              e.clientY > rect.bottom - 15;
            
            if (isInResizeArea || target !== img) {
              e.preventDefault();
              isResizing = true;
              currentImage = img;
              startX = e.clientX;
              startY = e.clientY;
              startWidth = img.offsetWidth;
              startHeight = img.offsetHeight;
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }
          }
        };
        
        // Handler for mouse move during resize
        const handleMouseMove = (e: MouseEvent) => {
          if (!isResizing || !currentImage) return;
          
          e.preventDefault();
          
          // Calculate new dimensions
          const width = startWidth + (e.clientX - startX);
          
          // Apply new size maintaining aspect ratio
          if (width > 50) { // Minimum width
            currentImage.style.width = width + 'px';
            currentImage.style.height = 'auto'; // Height will adjust proportionally
          }
        };
        
        // Handler for mouse up to end resize
        const handleMouseUp = () => {
          if (!isResizing || !currentImage || !contentEditableRef.current) return;
          
          isResizing = false;
          
          // Set the width attribute to make the resize persistent
          const finalWidth = currentImage.style.width;
          currentImage.setAttribute('width', finalWidth);
          
          // Also update the style to make sure it's preserved in the HTML
          currentImage.style.width = finalWidth;
          currentImage.style.height = 'auto';
          
          // Update stored content
          latestContentRef.current = contentEditableRef.current.innerHTML;
          
          // Clean up event listeners
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          
          // Notify parent of changes
          onChange(latestContentRef.current);
        };
        
        // Add event listeners
        editor.addEventListener('mousedown', handleMouseDown);
        
        // Cleanup function
        return () => {
          editor.removeEventListener('mousedown', handleMouseDown);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      };
      
      const cleanup = setupImageResizing();
      return cleanup;
    }
  }, [showHtmlView, onChange]);

  // Sync external value changes only when the component's value prop changes from outside
  useEffect(() => {
    if (!isUpdatingRef.current && value !== latestContentRef.current) {
      setHtmlValue(value);
      latestContentRef.current = value;
      
      // Update the contentEditable only when it's visible and the content is different
      if (!showHtmlView && contentEditableRef.current) {
        contentEditableRef.current.innerHTML = value;
      }
    }
  }, [value, showHtmlView]);

  // Handle raw HTML textarea changes
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setHtmlValue(newValue);
    latestContentRef.current = newValue;
    
    isUpdatingRef.current = true;
    onChange(newValue);
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  };

  // Handle visual editor content changes - only update on blur for better cursor handling
  const handleContentEditableBlur = () => {
    if (!contentEditableRef.current) return;
    
    const newValue = contentEditableRef.current.innerHTML;
    if (newValue !== latestContentRef.current) {
      latestContentRef.current = newValue;
      setHtmlValue(newValue);
      
      isUpdatingRef.current = true;
      onChange(newValue);
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    }
  };

  // Optional: Update parent component occasionally during typing, but not on every keystroke
  const handleContentEditableInput = () => {
    // We can leave this empty to prevent cursor jumps
    // Or implement a debounced update if needed
  };

  // Execute a formatting command in the visual editor
  const execCommand = (command: string, value: string = '') => {
    // Focus the editor first to ensure commands apply correctly
    if (contentEditableRef.current) {
      contentEditableRef.current.focus();
      document.execCommand(command, false, value);
      
      // Update the stored value but don't trigger re-render yet
      latestContentRef.current = contentEditableRef.current.innerHTML;
    }
  };

  // Format buttons for the visual editor
  const formatButtons: FormattingButton[] = [
    { command: 'bold', icon: 'B', title: 'Bold' },
    { command: 'italic', icon: 'I', title: 'Italic' },
    { command: 'underline', icon: 'U', title: 'Underline' },
    { command: 'insertUnorderedList', icon: '•', title: 'Bullet List' },
    { command: 'insertOrderedList', icon: '1.', title: 'Numbered List' },
    { command: 'justifyLeft', icon: '⟵', title: 'Align Left' },
    { command: 'justifyCenter', icon: '↔', title: 'Center' },
    { command: 'justifyRight', icon: '⟶', title: 'Align Right' },
    { command: 'createLink', icon: '🔗', title: 'Insert Link' },
    { command: 'insertImage', icon: '🖼️', title: 'Insert Image' },
    { command: 'removeFormat', icon: '✕', title: 'Clear Formatting' }
  ];
  
  // Handle creating a link
  const handleCreateLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      execCommand('createLink', url);
    }
  };
  
  // Save current selection before showing image uploader
  const handleInsertImage = () => {
    // Save the current selection before opening the image uploader
    if (contentEditableRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        // Save the current selection range for later use
        const range = selection.getRangeAt(0);
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(contentEditableRef.current);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        
        const startOffset = preSelectionRange.toString().length;
        savedSelectionRef.current = {
          start: startOffset,
          end: startOffset + range.toString().length
        };
        
        console.log('Selection saved:', savedSelectionRef.current);
      }
    }
    
    setShowImageUploader(true);
  };
  
  // Handle image upload completion
  const handleImageUploaded = (imageUrl: string) => {
    console.log('Image uploaded, inserting URL:', imageUrl);
    
    if (contentEditableRef.current) {
      // Make sure the editor has focus before inserting
      contentEditableRef.current.focus();
      
      // Try to restore selection if we have a saved position
      try {
        if (savedSelectionRef.current) {
          console.log('Attempting to restore selection at:', savedSelectionRef.current);
          
          // Find the right position in the content
          const allNodes: Node[] = [];
          const getNodes = (node: Node) => {
            if (node.nodeType === 3) { // Text node
              allNodes.push(node);
            } else if (node.nodeType === 1) { // Element node
              for (let i = 0; i < node.childNodes.length; i++) {
                getNodes(node.childNodes[i]);
              }
            }
          };
          
          getNodes(contentEditableRef.current);
          
          let charCount = 0;
          let startNode: Node | null = null;
          let startOffset = 0;
          
          // Find the node and position matching our saved location
          for (let i = 0; i < allNodes.length; i++) {
            const node = allNodes[i];
            const nextCharCount = charCount + node.textContent!.length;
            
            if (!startNode && savedSelectionRef.current.start >= charCount && savedSelectionRef.current.start <= nextCharCount) {
              startNode = node;
              startOffset = savedSelectionRef.current.start - charCount;
              break;
            }
            
            charCount = nextCharCount;
          }
          
          // If we found our position, create a new range and select it
          if (startNode) {
            console.log('Found position, restoring selection');
            const newRange = document.createRange();
            newRange.setStart(startNode, startOffset);
            newRange.setEnd(startNode, startOffset);
            
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(newRange);
            }
          }
        }
        
        // Insert the image at cursor position with an interactive resize handler
        // Set an initial width in pixels and height auto to maintain aspect ratio
        const resizableImageHtml = `<img src="${imageUrl}" alt="Uploaded image" style="width: 400px; height: auto;" class="resizable-image" />`;
        
        execCommand('insertHTML', resizableImageHtml);
        console.log('Image inserted successfully');
        
        // Immediately apply the change to the stored value
        latestContentRef.current = contentEditableRef.current.innerHTML;
        setHtmlValue(latestContentRef.current);
        onChange(latestContentRef.current); // Notify parent of the change
      } catch (error) {
        console.error('Error inserting image:', error);
        // Fallback method - append at the end if insertion fails
        contentEditableRef.current.innerHTML += `<p><img src="${imageUrl}" alt="Uploaded image" style="width: 400px; height: auto;" class="resizable-image" /></p>`;
        latestContentRef.current = contentEditableRef.current.innerHTML;
        setHtmlValue(latestContentRef.current);
        onChange(latestContentRef.current);
      } finally {
        // Clear the saved selection
        savedSelectionRef.current = null;
      }
      
      // Close the uploader
      setShowImageUploader(false);
    } else {
      console.error('Editor reference not available');
    }
  };

  // Toggle between HTML view and visual editor mode
  const toggleView = () => {
    if (showHtmlView) {
      // Switching from HTML to Visual - we need to update contentEditable
      setShowHtmlView(false);
      
      // Update contentEditable after the state change is applied
      setTimeout(() => {
        if (contentEditableRef.current) {
          contentEditableRef.current.innerHTML = htmlValue;
        }
      }, 0);
    } else {
      // Switching from Visual to HTML - capture the current contentEditable value first
      if (contentEditableRef.current) {
        const currentContent = contentEditableRef.current.innerHTML;
        setHtmlValue(currentContent);
        latestContentRef.current = currentContent;
      }
      setShowHtmlView(true);
    }
  };
  
  return (
    <div className="rich-text-editor">
      <div className="editor-toolbar">
        <button
          type="button"
          className="toolbar-button"
          onClick={toggleView}
        >
          {showHtmlView ? 'Visual Editor' : 'HTML Code'}
        </button>
        <span className="toolbar-note">
          {showHtmlView ? 'Editing raw HTML code' : 'Visual editing mode - use {{variable}} for template variables'}
        </span>
      </div>
      
      {showHtmlView ? (
        <textarea
          value={htmlValue}
          onChange={handleTextareaChange}
          placeholder={placeholder}
          style={{
            width: '100%',
            height,
            padding: '10px',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontFamily: 'monospace',
            fontSize: '14px',
          }}
        />
      ) : (
        <div className="visual-editor-mode">
          <div className="visual-editor-toolbar">
            {formatButtons.map((button) => (
              <button
                key={button.command}
                type="button"
                className="format-button"
                title={button.title}
                onClick={() => {
                  if (button.command === 'createLink') {
                    handleCreateLink();
                  } else if (button.command === 'insertImage') {
                    handleInsertImage();
                  } else {
                    execCommand(button.command, button.value || '');
                  }
                }}
              >
                {button.icon}
              </button>
            ))}
          </div>
          <div 
            ref={contentEditableRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleContentEditableInput}
            onBlur={handleContentEditableBlur}
            dangerouslySetInnerHTML={{ __html: htmlValue }}
            data-placeholder={placeholder}
            style={{ 
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              minHeight: '100px',
              height,
              overflow: 'auto',
              backgroundColor: 'white',
            }}
          />
        </div>
      )}
      
      {/* Image Uploader Modal */}
      {showImageUploader && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="relative mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <ImageUploader 
              onImageUploaded={handleImageUploaded}
              onCancel={() => setShowImageUploader(false)}
            />
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{ __html: `
        /* Resizable image styles */
        .resizable-image {
          position: relative;
          display: inline-block;
          border: 1px solid transparent;
          max-width: 100%;
          box-sizing: border-box;
        }
        .resizable-image:hover {
          border: 1px dashed #0066cc;
        }
        .resizable-image:after {
          content: '';
          position: absolute;
          right: -5px;
          bottom: -5px;
          width: 12px;
          height: 12px;
          background: #0066cc;
          cursor: nwse-resize !important;
          border-radius: 50%;
          opacity: 0;
          box-shadow: 0 0 3px rgba(0,0,0,0.5);
          z-index: 100;
        }
        .resizable-image:hover:after {
          opacity: 0.8;
        }
        /* Corner resize area - larger invisible hit area */
        .resizable-image:before {
          content: '';
          position: absolute;
          bottom: -12px;
          right: -12px;
          width: 24px;
          height: 24px;
          cursor: nwse-resize;
          z-index: 99;
        }
        /* Custom tooltip for resizing */
        .resizable-image:hover::after {
          content: '';
          opacity: 0.8;
        }
        .resizable-image::after:hover {
          cursor: nwse-resize !important;
        }
        /* Ensure the resize corner has the right cursor */
        .rich-text-editor [contenteditable] .resizable-image:hover::after {
          cursor: nwse-resize !important;
        }
        .rich-text-editor {
          display: flex;
          flex-direction: column;
        }
        .editor-toolbar {
          display: flex;
          align-items: center;
          background-color: #f3f4f6;
          border: 1px solid #d1d5db;
          border-bottom: none;
          border-top-left-radius: 0.375rem;
          border-top-right-radius: 0.375rem;
          padding: 8px;
        }
        .toolbar-button {
          background-color: #4f46e5;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 14px;
        }
        .toolbar-button:hover {
          background-color: #4338ca;
        }
        .toolbar-note {
          margin-left: 12px;
          font-size: 12px;
          color: #6b7280;
        }
        .visual-editor-mode {
          margin-bottom: 20px;
        }
        .visual-editor-toolbar {
          display: flex;
          flex-wrap: wrap;
          background-color: #f9fafb;
          border: 1px solid #d1d5db;
          border-bottom: none;
          padding: 5px;
          border-top-left-radius: 0.375rem;
          border-top-right-radius: 0.375rem;
        }
        .format-button {
          background: none;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 3px;
          cursor: pointer;
          font-weight: bold;
        }
        .format-button:hover {
          background-color: #f3f4f6;
        }
        [contenteditable=true] {
          outline: none;
          word-wrap: break-word;
        }
        [contenteditable=true]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          display: block;
        }
      `}} />
    </div>
  );
};

export default RichTextEditor;
