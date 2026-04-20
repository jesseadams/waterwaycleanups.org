// API Endpoint: /api/impact-templates
// CRUD operations for impact map templates stored in DynamoDB
// Supports: list, get, save, delete
// Public read access for get/list, admin-only for save/delete

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoDB = DynamoDBDocumentClient.from(client);

const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';
const impactTemplatesTable = process.env.IMPACT_TEMPLATES_TABLE_NAME || 'impact_templates';

const ADMIN_EMAILS = [
  'admin@waterwaycleanups.org',
  'contact@waterwaycleanups.org',
  'jesse@techno-geeks.org',
  'jesse@waterwaycleanups.org'
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Content-Type': 'application/json'
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

async function validateAdminSession(sessionToken) {
  if (!sessionToken) return null;

  try {
    const result = await dynamoDB.send(new GetCommand({
      TableName: sessionTableName,
      Key: { session_token: sessionToken }
    }));

    const session = result.Item;
    if (!session || new Date(session.expires_at) <= new Date()) return null;
    return ADMIN_EMAILS.includes(session.email.toLowerCase()) ? session : null;
  } catch (err) {
    // Try query on index if direct get fails (table may use different key)
    try {
      const queryResult = await dynamoDB.send(new QueryCommand({
        TableName: sessionTableName,
        IndexName: 'session-token-index',
        KeyConditionExpression: 'session_token = :token',
        ExpressionAttributeValues: { ':token': sessionToken }
      }));
      const sessions = queryResult.Items || [];
      if (sessions.length === 0) return null;
      const session = sessions[0];
      if (new Date(session.expires_at) <= new Date()) return null;
      return ADMIN_EMAILS.includes(session.email.toLowerCase()) ? session : null;
    } catch (e) {
      console.error('Session validation error:', e);
      return null;
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, { message: 'CORS preflight successful' });
  }

  // GET requests are public (list and get)
  if (event.httpMethod === 'GET') {
    const templateId = event.queryStringParameters?.id;
    if (templateId) {
      return await handleGet(templateId);
    }
    return await handleList(event.queryStringParameters);
  }

  // POST requests require admin auth
  if (event.httpMethod !== 'POST') {
    return respond(405, { success: false, message: 'Method Not Allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return respond(400, { success: false, message: 'Invalid JSON body' });
  }

  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  const sessionToken = authHeader?.replace(/^Bearer\s+/i, '') || body.session_token;

  const session = await validateAdminSession(sessionToken);
  if (!session) {
    return respond(403, { success: false, message: 'Admin access required' });
  }

  const action = body.action;
  try {
    switch (action) {
      case 'save':
        return await handleSave(body, session);
      case 'delete':
        return await handleDelete(body, session);
      default:
        return respond(400, { success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`Error handling ${action}:`, err);
    return respond(500, { success: false, message: 'Internal server error', error: err.message });
  }
};

// List all templates (public)
async function handleList(params) {
  try {
    const scanParams = { TableName: impactTemplatesTable };

    // Optional filter by reusable flag
    if (params?.reusable === 'true') {
      scanParams.FilterExpression = 'reusable = :r';
      scanParams.ExpressionAttributeValues = { ':r': true };
    }

    const result = await dynamoDB.send(new ScanCommand(scanParams));
    const templates = (result.Items || []).sort((a, b) =>
      (b.updated_at || '').localeCompare(a.updated_at || '')
    );

    return respond(200, {
      success: true,
      templates,
      count: templates.length
    });
  } catch (err) {
    console.error('Error listing templates:', err);
    return respond(500, { success: false, message: 'Failed to list templates' });
  }
}

// Get a single template by ID (public)
async function handleGet(templateId) {
  try {
    const result = await dynamoDB.send(new GetCommand({
      TableName: impactTemplatesTable,
      Key: { template_id: templateId }
    }));

    if (!result.Item) {
      return respond(404, { success: false, message: 'Template not found' });
    }

    return respond(200, { success: true, template: result.Item });
  } catch (err) {
    console.error('Error getting template:', err);
    return respond(500, { success: false, message: 'Failed to get template' });
  }
}

// Save (create or update) a template (admin only)
async function handleSave(body, session) {
  const template = body.template;
  if (!template || !template.id || !template.name) {
    return respond(400, { success: false, message: 'Template with id and name is required' });
  }

  // Check if template already exists to handle versioning
  let existingVersion = 0;
  try {
    const existing = await dynamoDB.send(new GetCommand({
      TableName: impactTemplatesTable,
      Key: { template_id: template.id }
    }));
    if (existing.Item) {
      existingVersion = existing.Item.version || 0;
    }
  } catch (e) {
    // Template doesn't exist yet, that's fine
  }

  const newVersion = template.version || (existingVersion + 1);
  const now = new Date().toISOString();

  const item = {
    template_id: template.id,
    name: template.name,
    description: template.description || '',
    version: newVersion,
    created_at: template.created_at || now,
    updated_at: now,
    updated_by: session.email,
    center: template.center,
    zoom: template.zoom || 14,
    reusable: template.reusable !== false,
    estimated_miles: template.estimated_miles || 0,
    features: template.features || { parking: [], paths: [], zones: [] }
  };

  await dynamoDB.send(new PutCommand({
    TableName: impactTemplatesTable,
    Item: item
  }));

  return respond(200, {
    success: true,
    template_id: template.id,
    version: newVersion,
    message: `Template saved (v${newVersion})`
  });
}

// Delete a template (admin only)
async function handleDelete(body, session) {
  if (!body.template_id) {
    return respond(400, { success: false, message: 'template_id required' });
  }

  await dynamoDB.send(new DeleteCommand({
    TableName: impactTemplatesTable,
    Key: { template_id: body.template_id }
  }));

  return respond(200, {
    success: true,
    message: `Template ${body.template_id} deleted`
  });
}
