import { SESv2Client, ListContactsCommand, CreateContactCommand, DeleteContactCommand, GetContactCommand, UpdateContactCommand, ListContactListsCommand, CreateContactListCommand, DeleteContactListCommand, GetContactListCommand, ListEmailTemplatesCommand, GetEmailTemplateCommand, CreateEmailTemplateCommand, DeleteEmailTemplateCommand, UpdateEmailTemplateCommand, SendEmailCommand, TestRenderEmailTemplateCommand, SubscriptionStatus, Topic, TopicPreference } from '@aws-sdk/client-sesv2';
import { getAwsConfig } from './configure-aws';
import awsConfig from '../aws-config';

// Re-export types
export type { SubscriptionStatus, Topic, TopicPreference };

// We'll create the client fresh each time to ensure we have current credentials
// This ensures we're always using the latest temporary credentials from Cognito
const getSesV2Client = async (): Promise<SESv2Client> => {
  try {
    // Always get fresh config with current credentials
    const config = await getAwsConfig();
    
    // Create new client with these credentials
    const client = new SESv2Client(config);
    console.log('SESv2 client created with region:', config.region);
    
    return client;
  } catch (error) {
    console.error('Failed to initialize SESv2 client:', error);
    throw new Error('Authentication required to access email services. Please sign in.');
  }
};

// Log service configuration for debugging (without exposing secrets)
console.log("SESv2 Client Initialized:", {
  region: awsConfig.region,
  authConfigured: !!awsConfig.userPoolId && !!awsConfig.userPoolWebClientId
});

/**
 * Contact Management
 */
export const listContacts = async (contactListName: string, pageSize: number = 100, nextToken?: string) => {
  const command = new ListContactsCommand({
    ContactListName: contactListName,
    PageSize: pageSize,
    NextToken: nextToken,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error listing contacts:", error);
    throw error;
  }
};

export const getContact = async (contactListName: string, emailAddress: string) => {
  const command = new GetContactCommand({
    ContactListName: contactListName,
    EmailAddress: emailAddress,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error getting contact:", error);
    throw error;
  }
};

export const createContact = async (contactListName: string, emailAddress: string, attributes: Record<string, string> = {}, topicPreferences: TopicPreference[] = []) => {
  const command = new CreateContactCommand({
    ContactListName: contactListName,
    EmailAddress: emailAddress,
    AttributesData: JSON.stringify(attributes),
    TopicPreferences: topicPreferences,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error creating contact:", error);
    throw error;
  }
};

export const updateContact = async (contactListName: string, emailAddress: string, attributes: Record<string, string> = {}, topicPreferences: TopicPreference[] = []) => {
  const command = new UpdateContactCommand({
    ContactListName: contactListName,
    EmailAddress: emailAddress,
    AttributesData: JSON.stringify(attributes),
    TopicPreferences: topicPreferences,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error updating contact:", error);
    throw error;
  }
};

export const deleteContact = async (contactListName: string, emailAddress: string) => {
  const command = new DeleteContactCommand({
    ContactListName: contactListName,
    EmailAddress: emailAddress,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error deleting contact:", error);
    throw error;
  }
};

/**
 * Contact List Management
 */
export const listContactLists = async (pageSize: number = 100, nextToken?: string) => {
  const command = new ListContactListsCommand({
    PageSize: pageSize,
    NextToken: nextToken,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error listing contact lists:", error);
    throw error;
  }
};

export const getContactList = async (contactListName: string) => {
  const command = new GetContactListCommand({
    ContactListName: contactListName,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error getting contact list:", error);
    throw error;
  }
};

export const createContactList = async (contactListName: string, description?: string, topics: Topic[] = []) => {
  const command = new CreateContactListCommand({
    ContactListName: contactListName,
    Description: description,
    Topics: topics,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error creating contact list:", error);
    throw error;
  }
};

export const deleteContactList = async (contactListName: string) => {
  const command = new DeleteContactListCommand({
    ContactListName: contactListName,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error deleting contact list:", error);
    throw error;
  }
};

/**
 * Email Template Management
 */
export const listEmailTemplates = async (pageSize: number = 100, nextToken?: string) => {
  const command = new ListEmailTemplatesCommand({
    PageSize: pageSize,
    NextToken: nextToken,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error listing email templates:", error);
    throw error;
  }
};

export const getEmailTemplate = async (templateName: string) => {
  const command = new GetEmailTemplateCommand({
    TemplateName: templateName,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error getting email template:", error);
    throw error;
  }
};

export const createEmailTemplate = async (templateName: string, subject: string, htmlPart: string, textPart?: string) => {
  const command = new CreateEmailTemplateCommand({
    TemplateName: templateName,
    TemplateContent: {
      Subject: subject,
      Html: htmlPart,
      Text: textPart,
    },
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error creating email template:", error);
    throw error;
  }
};

export const updateEmailTemplate = async (templateName: string, subject: string, htmlPart: string, textPart?: string) => {
  const command = new UpdateEmailTemplateCommand({
    TemplateName: templateName,
    TemplateContent: {
      Subject: subject,
      Html: htmlPart,
      Text: textPart,
    },
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error updating email template:", error);
    throw error;
  }
};

export const deleteEmailTemplate = async (templateName: string) => {
  const command = new DeleteEmailTemplateCommand({
    TemplateName: templateName,
  });

  try {
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error deleting email template:", error);
    throw error;
  }
};

/**
 * Clone an existing email template to a new template with a different name
 * 
 * @param sourceTemplateName Original template name to clone
 * @param newTemplateName New template name to create
 * @returns Promise with the result of the create operation
 */
export const cloneEmailTemplate = async (sourceTemplateName: string, newTemplateName: string) => {
  try {
    // First, get the source template
    const sourceTemplate = await getEmailTemplate(sourceTemplateName);
    
    if (!sourceTemplate || !sourceTemplate.TemplateContent) {
      throw new Error(`Source template ${sourceTemplateName} not found or has no content`);
    }
    
    // Then create a new template with the same content
    const result = await createEmailTemplate(
      newTemplateName,
      sourceTemplate.TemplateContent.Subject || '',
      sourceTemplate.TemplateContent.Html || '',
      sourceTemplate.TemplateContent.Text
    );
    
    return result;
  } catch (error) {
    console.error(`Error cloning template ${sourceTemplateName} to ${newTemplateName}:`, error);
    throw error;
  }
};

// No replacement needed - removing this function

/**
 * Send Email
 */
export const sendEmail = async (
  fromEmail: string,
  toAddresses: string[],
  subject: string,
  htmlBody: string,
  textBody?: string,
  templateName?: string,
  templateData?: Record<string, any>,
  configSet?: string,
  contactListName?: string,
  topicName?: string
) => {
  // Create the command with list management options
  const command = new SendEmailCommand({
    FromEmailAddress: fromEmail,
    Destination: {
      ToAddresses: toAddresses,
    },
    Content: templateName ? 
      {
        Template: {
          TemplateName: templateName,
          TemplateData: JSON.stringify(templateData || {})
        }
      } : 
      {
        Simple: {
          Subject: {
            Data: subject,
          },
          Body: {
            Html: {
              Data: htmlBody,
            },
            ...(textBody && {
              Text: {
                Data: textBody,
              },
            })
          }
        }
      },
    ...(configSet && {
      ConfigurationSetName: configSet,
    }),
    // Add ListManagementOptions if both contactListName and topicName are provided
    ...(contactListName && topicName && {
      ListManagementOptions: {
        ContactListName: contactListName,
        TopicName: topicName
      }
    })
  });

  // Log the command for debugging
  console.log('Sending email with options:', {
    fromEmail,
    toAddresses,
    subject: subject || 'From template',
    templateName: templateName || 'N/A',
    hasListManagement: !!(contactListName && topicName),
    contactListName,
    topicName
  });

  try {
    // Get standard client
    const client = await getSesV2Client();
    return await client.send(command);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

/**
 * Test Render Email Template
 * 
 * This uses the AWS SESv2 TestRenderEmailTemplate API to render a template with specific data
 * without actually sending an email. This is useful for previewing how a template will look
 * with particular template data.
 * 
 * @param templateName Name of the template to render
 * @param templateData Data to use when rendering the template
 * @returns Rendered template content (subject, html, text)
 */
export const testRenderEmailTemplate = async (templateName: string, templateData: Record<string, any> = {}) => {
  const command = new TestRenderEmailTemplateCommand({
    TemplateName: templateName,
    TemplateData: JSON.stringify(templateData || {})
  });

  try {
    const client = await getSesV2Client();
    const response = await client.send(command);
    return response;
  } catch (error) {
    console.error("Error test rendering email template:", error);
    throw error;
  }
};
