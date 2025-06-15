/**
 * Utility to convert HTML content to plain text, preserving some structural elements
 */

/**
 * Convert HTML string to plain text
 * @param html HTML content to convert
 * @returns Plain text version of the HTML content
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  
  // Create a temporary DOM element
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Replace common block elements with newlines and content
  const processNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      let result = '';
      
      // Process by tag name
      switch (element.tagName.toLowerCase()) {
        case 'br':
          return '\n';
        
        case 'p':
        case 'div':
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
        case 'tr':
          // Add newlines around block elements
          result += '\n';
          for (let i = 0; i < element.childNodes.length; i++) {
            result += processNode(element.childNodes[i]);
          }
          result += '\n';
          return result;
          
        case 'li':
          // Add bullet points for list items
          result += '\n • ';
          for (let i = 0; i < element.childNodes.length; i++) {
            result += processNode(element.childNodes[i]);
          }
          return result;
          
        case 'a':
          // For links, include the URL
          const href = element.getAttribute('href');
          let linkText = '';
          for (let i = 0; i < element.childNodes.length; i++) {
            linkText += processNode(element.childNodes[i]);
          }
          return linkText + (href && href !== linkText ? ` (${href})` : '');
          
        default:
          // Process child nodes for other elements
          for (let i = 0; i < element.childNodes.length; i++) {
            result += processNode(element.childNodes[i]);
          }
          return result;
      }
    }
    
    return '';
  };
  
  let result = processNode(temp);
  
  // Clean up the result
  // Replace multiple newlines with a maximum of two
  result = result.replace(/\n{3,}/g, '\n\n');
  // Trim leading and trailing whitespace
  result = result.trim();
  
  return result;
}
