import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { getAwsConfig } from './configure-aws';
import { getEmailTemplate } from './sesv2';
import awsConfig from '../aws-config';

// We'll create the client fresh each time to ensure we have current credentials
// This ensures we're always using the latest temporary credentials from Cognito
const getBedrockClient = async (): Promise<BedrockRuntimeClient> => {
  try {
    // Always get fresh config with current credentials
    const config = await getAwsConfig();
    
    // Create new client with these credentials
    const client = new BedrockRuntimeClient(config);
    console.log('Bedrock client created with region:', config.region);
    
    return client;
  } catch (error) {
    console.error('Failed to initialize Bedrock client:', error);
    throw new Error('Authentication required to access Bedrock services. Please sign in.');
  }
};

interface NewsletterGenerationParams {
  bullets: string[];
  imageUrls?: string[];
  tone?: 'professional' | 'casual' | 'enthusiastic' | 'informative';
  targetAudience?: string;
}

interface GeneratedNewsletter {
  subject: string;
  htmlContent: string;
  textContent: string;
}

export const generateNewsletterContent = async (params: NewsletterGenerationParams): Promise<GeneratedNewsletter> => {
  const { bullets, imageUrls = [], tone = 'enthusiastic', targetAudience = 'environmental volunteers and supporters' } = params;

  // First, fetch the base template to use as structure
  let baseTemplateHtml = '';
  let baseTemplateText = '';
  try {
    const baseTemplate = await getEmailTemplate('waterway-cleanups-2025-06-10');
    baseTemplateHtml = baseTemplate.TemplateContent?.Html || '';
    baseTemplateText = baseTemplate.TemplateContent?.Text || '';
  } catch (error) {
    console.warn('Could not fetch base template waterway-cleanups-2025-06-10, using fallback structure');
  }

  // Build the prompt for Claude with base template structure
  const prompt = `
You are a professional newsletter writer for Waterway Cleanups, an established environmental nonprofit organization dedicated to cleaning waterways and protecting aquatic ecosystems. You write authentic, engaging content that sounds genuinely human-written.

Context: Waterway Cleanups has been sending newsletters to volunteers and supporters for years. Previous newsletters have featured cleanup event highlights, volunteer spotlights, environmental impact stories, partnership announcements, and calls-to-action for upcoming events. The organization maintains a consistent, professional voice that balances environmental urgency with community positivity.

${baseTemplateHtml ? `IMPORTANT: Use this existing HTML template structure as your foundation and replace only the content areas with new content. Keep all styling, layout, and formatting intact:

BASE TEMPLATE HTML STRUCTURE:
${baseTemplateHtml}

Instructions: Replace the existing content within this template structure with new content based on the key points below. Maintain all HTML tags, styling, classes, and structure. Only change the actual text content, subject line, and add images where appropriate.` : 'Create a newsletter with professional HTML structure.'}

Create newsletter content based on the following information:

Key Points:
${bullets.map((bullet, index) => `${index + 1}. ${bullet}`).join('\n')}

${imageUrls.length > 0 ? `Images to incorporate (reference these as placeholders in HTML and replace any existing images):
${imageUrls.map((url, index) => `Image ${index + 1}: ${url}`).join('\n')}` : ''}

Essential Guidelines:
- Write in a ${tone} tone appropriate for ${targetAudience}
- NO emojis anywhere - they make content appear AI-generated
- Reference the organization's ongoing work and community impact
- Create engaging subject line (50-60 characters, no emojis)
- Use natural, conversational language that sounds human-written
- Include specific details and context that show genuine organizational knowledge
- Structure with clear sections: introduction, main content, call-to-action, closing
- For images: Size them appropriately (max 600px width, maintain aspect ratio)
- ${baseTemplateHtml ? 'PRESERVE all existing HTML structure, classes, and styling from the base template' : 'Follow established newsletter formatting with proper headers and spacing'}
- Include realistic metrics, dates, or specific details where appropriate
- Close with genuine appreciation that reflects the organization's relationship with supporters

HTML Requirements:
- ${baseTemplateHtml ? 'Use the provided base template structure exactly, changing only text content' : 'Use semantic HTML structure similar to previous newsletters'}
- Images should be sized at max 600px width with responsive scaling
- Include proper alt tags for accessibility
- Use consistent typography and spacing
- Maintain professional email-safe CSS styling

Please provide the newsletter in the following JSON format:
{
  "subject": "Newsletter subject line",
  "htmlContent": "<html>...</html>",
  "textContent": "Plain text version..."
}`;

  try {
    const client = await getBedrockClient();
    
    // Prepare the request for Claude Sonnet 4 via inference profile (latest available)
    const request = {
      modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        top_p: 0.9,
      }),
    };

    // Invoke the model
    const command = new InvokeModelCommand(request);
    const response = await client.send(command);
    
    // Parse the response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.content[0].text;
    
    // Extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from response');
    }
    
    const generatedContent = JSON.parse(jsonMatch[0]);
    
    // Process HTML content to properly embed images with appropriate sizing
    let processedHtml = generatedContent.htmlContent;
    imageUrls.forEach((url, index) => {
      const placeholder = new RegExp(`\\[?Image ${index + 1}\\]?|\\{image-${index + 1}\\}`, 'gi');
      const imageTag = `<img src="${url}" alt="Newsletter image ${index + 1}" style="max-width: 600px; width: 100%; height: auto; display: block; margin: 20px auto; border-radius: 5px;">`;
      processedHtml = processedHtml.replace(placeholder, imageTag);
    });
    
    return {
      subject: generatedContent.subject,
      htmlContent: processedHtml,
      textContent: generatedContent.textContent,
    };
  } catch (error) {
    console.error('Error generating newsletter content:', error);
    throw new Error('Failed to generate newsletter content. Please try again.');
  }
};

// Generate newsletter template from AI content - uses the base template structure
export const createNewsletterTemplate = (generatedContent: GeneratedNewsletter): {
  subject: string;
  htmlPart: string;
  textPart: string;
} => {
  // Since the AI is already using the base template structure, we use the generated HTML directly
  // The AI has already incorporated the proper formatting and structure from the base template
  return {
    subject: generatedContent.subject,
    htmlPart: generatedContent.htmlContent,
    textPart: generatedContent.textContent + '\n\n---\nUnsubscribe: {{unsubscribe_url}}\nUpdate Preferences: {{preferences_url}}',
  };
};
