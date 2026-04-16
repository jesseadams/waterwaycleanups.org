// API Endpoint: /api/admin-content-sync
// Manages event content: save drafts to DynamoDB, publish to events table, trigger rebuild

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoDB = DynamoDBDocumentClient.from(client);

const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';
const contentEditsTable = process.env.CONTENT_EDITS_TABLE_NAME || 'content_edits';
const eventsTableName = process.env.EVENTS_TABLE_NAME || 'events';
const githubToken = process.env.GITHUB_TOKEN || '';
const githubRepo = process.env.GITHUB_REPO || 'waterwaycleanups/waterwaycleanups.org';
const githubBranch = process.env.GITHUB_BRANCH || 'main';

// Admin email whitelist
const ADMIN_EMAILS = [
  'admin@waterwaycleanups.org',
  'contact@waterwaycleanups.org',
  'jesse@techno-geeks.org',
  'jesse@waterwaycleanups.org'
];

async function validateAdminSession(sessionToken) {
  const result = await dynamoDB.send(new GetCommand({
    TableName: sessionTableName,
    Key: { session_token: sessionToken }
  }));

  const session = result.Item;
  if (!session || new Date(session.expires_at) <= new Date()) return null;
  return ADMIN_EMAILS.includes(session.email.toLowerCase()) ? session : null;
}

// Generate a URL-friendly slug from a title
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Generate event_id from title and date
function generateEventId(title, startTime) {
  const slug = slugify(title);
  const date = new Date(startTime);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${slug}-${month}-${year}`;
}

// Helper to make GitHub API requests
function githubRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: method,
      headers: {
        'User-Agent': 'waterwaycleanups-admin',
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body || '{}'));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Trigger GitHub Actions workflow
async function triggerWorkflow(environment = 'staging') {
  if (!githubToken) {
    console.warn('GITHUB_TOKEN not set, skipping workflow trigger');
    return null;
  }
  
  try {
    await githubRequest('POST', `/repos/${githubRepo}/actions/workflows/deploy.yml/dispatches`, {
      ref: githubBranch,
      inputs: { environment }
    });
    return { triggered: true, environment };
  } catch (err) {
    console.error('Failed to trigger workflow:', err.message);
    return { triggered: false, error: err.message };
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Content-Type': 'application/json'
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, { message: 'CORS preflight successful' });
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, { success: false, message: 'Method Not Allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return respond(400, { success: false, message: 'Invalid JSON body' });
  }

  // Extract session token from Authorization header (Bearer token)
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  const sessionToken = authHeader?.replace(/^Bearer\s+/i, '');
  
  if (!sessionToken) {
    return respond(401, { success: false, message: 'Session token required' });
  }

  const session = await validateAdminSession(sessionToken);
  if (!session) {
    return respond(403, { success: false, message: 'Admin access required' });
  }

  const action = body.action;
  try {
    switch (action) {
      case 'save_draft':
        return await handleSaveDraft(body, session);
      case 'list_edits':
        return await handleListEdits(body, session);
      case 'delete_edit':
        return await handleDeleteEdit(body, session);
      case 'load_event':
        return await handleLoadEvent(body, session);
      case 'publish':
        return await handlePublish(body, session);
      case 'upload_image':
        return await handleUploadImage(body, session);
      default:
        return respond(400, { success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`Error handling ${action}:`, err);
    return respond(500, { success: false, message: 'Internal server error', error: err.message });
  }
};

// Save or update a draft edit in DynamoDB
async function handleSaveDraft(body, session) {
  const eventData = body.event_data;
  if (!eventData || !eventData.title || !eventData.start_time || !eventData.end_time) {
    return respond(400, { success: false, message: 'Missing required event fields (title, start_time, end_time)' });
  }

  const eventId = body.event_id || generateEventId(eventData.title, eventData.start_time);
  const editId = body.edit_id || `edit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const isNew = !body.event_id;

  // Prepare event data for DynamoDB events table format
  const dbEventData = {
    event_id: eventId,
    title: eventData.title,
    description: eventData.description,
    start_time: eventData.start_time,
    end_time: eventData.end_time,
    location: {
      name: eventData.location_name,
      address: eventData.location_address
    },
    attendance_cap: parseInt(eventData.attendance_cap) || 20,
    status: 'active',
    hugo_config: {
      image: eventData.image || '/uploads/waterway-cleanups/default.jpg',
      tags: eventData.tags || [],
      preheader_is_light: eventData.preheader_is_light || false
    }
  };

  const item = {
    edit_id: editId,
    event_id: eventId,
    title: eventData.title,
    event_data: dbEventData,
    edit_type: isNew ? 'create' : 'update',
    status: 'pending',
    created_by: session.email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await dynamoDB.put({ TableName: contentEditsTable, Item: item }).promise();

  return respond(200, {
    success: true,
    edit_id: editId,
    event_id: eventId,
    message: `Draft ${isNew ? 'created' : 'updated'} successfully`
  });
}

// List all pending edits
async function handleListEdits(body, session) {
  const result = await dynamoDB.scan({
    TableName: contentEditsTable,
    FilterExpression: '#s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': body.status || 'pending' }
  }).promise();

  const edits = (result.Items || []).sort((a, b) =>
    new Date(b.updated_at) - new Date(a.updated_at)
  );

  return respond(200, { success: true, edits, count: edits.length });
}

// Delete a pending edit
async function handleDeleteEdit(body, session) {
  if (!body.edit_id) {
    return respond(400, { success: false, message: 'edit_id required' });
  }

  await dynamoDB.delete({
    TableName: contentEditsTable,
    Key: { edit_id: body.edit_id }
  }).promise();

  return respond(200, { success: true, message: 'Edit deleted' });
}

// Load an existing event from the events table for editing
async function handleLoadEvent(body, session) {
  if (!body.event_id) {
    return respond(400, { success: false, message: 'event_id required' });
  }

  try {
    const result = await dynamoDB.get({
      TableName: eventsTableName,
      Key: { event_id: body.event_id }
    }).promise();

    if (!result.Item) {
      return respond(404, { success: false, message: 'Event not found' });
    }

    return respond(200, { success: true, event: result.Item });
  } catch (err) {
    console.error('Error loading event:', err);
    return respond(500, { success: false, message: 'Failed to load event' });
  }
}

// Publish pending edits to the events table and trigger rebuild
async function handlePublish(body, session) {
  // Get edits to publish
  let editsToPublish;
  if (body.edit_ids && body.edit_ids.length > 0) {
    const results = await Promise.all(
      body.edit_ids.map(id =>
        dynamoDB.get({ TableName: contentEditsTable, Key: { edit_id: id } }).promise()
      )
    );
    editsToPublish = results.map(r => r.Item).filter(Boolean);
  } else {
    const result = await dynamoDB.scan({
      TableName: contentEditsTable,
      FilterExpression: '#s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': 'pending' }
    }).promise();
    editsToPublish = result.Items || [];
  }

  if (editsToPublish.length === 0) {
    return respond(200, { success: true, message: 'No pending edits to publish', published: 0 });
  }

  const publishedEvents = [];
  const errors = [];

  for (const edit of editsToPublish) {
    try {
      // Write to events table
      const eventItem = {
        ...edit.event_data,
        updated_at: new Date().toISOString(),
        updated_by: session.email
      };

      // If it's a new event, add created_at
      if (edit.edit_type === 'create') {
        eventItem.created_at = new Date().toISOString();
        eventItem.created_by = session.email;
      }

      await dynamoDB.put({
        TableName: eventsTableName,
        Item: eventItem
      }).promise();

      // Mark edit as published
      await dynamoDB.update({
        TableName: contentEditsTable,
        Key: { edit_id: edit.edit_id },
        UpdateExpression: 'SET #s = :status, published_at = :now, published_by = :email',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':status': 'published',
          ':now': new Date().toISOString(),
          ':email': session.email
        }
      }).promise();

      publishedEvents.push(edit.event_id);
      console.log(`Published event: ${edit.event_id}`);
    } catch (err) {
      console.error(`Failed to publish ${edit.event_id}:`, err);
      errors.push({ event_id: edit.event_id, error: err.message });
    }
  }

  // Trigger GitHub Actions workflow to rebuild site
  const workflowResult = await triggerWorkflow('staging');

  return respond(200, {
    success: true,
    published: publishedEvents.length,
    published_events: publishedEvents,
    workflow: workflowResult,
    errors: errors.length > 0 ? errors : undefined,
    message: `Published ${publishedEvents.length} event(s)${workflowResult?.triggered ? ', site rebuild triggered' : ''}`
  });
}


// Upload an image to the GitHub repo
async function handleUploadImage(body, session) {
  if (!body.filename || !body.file_data) {
    return respond(400, { success: false, message: 'filename and file_data (base64) required' });
  }

  if (!githubToken) {
    return respond(500, { success: false, message: 'GitHub token not configured' });
  }

  // Sanitize filename: lowercase, replace spaces with hyphens, keep only safe chars
  const sanitized = body.filename
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');

  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = sanitized.substring(sanitized.lastIndexOf('.'));
  if (!allowedExts.includes(ext)) {
    return respond(400, { success: false, message: `Invalid file type. Allowed: ${allowedExts.join(', ')}` });
  }

  // Limit to ~5MB (base64 is ~33% larger than binary)
  if (body.file_data.length > 7 * 1024 * 1024) {
    return respond(400, { success: false, message: 'File too large. Maximum 5MB.' });
  }

  const repoPath = `static/uploads/waterway-cleanups/${sanitized}`;
  const publicPath = `/uploads/waterway-cleanups/${sanitized}`;

  try {
    // Check if file already exists (need the SHA to update)
    let existingSha = null;
    try {
      const existing = await githubRequest('GET', `/repos/${githubRepo}/contents/${repoPath}?ref=${githubBranch}`);
      existingSha = existing.sha;
    } catch (e) {
      // File doesn't exist yet, that's fine
    }

    const commitData = {
      message: `Upload event photo: ${sanitized}`,
      content: body.file_data,
      branch: githubBranch,
      committer: {
        name: 'Waterway Cleanups Admin',
        email: session.email
      }
    };
    if (existingSha) {
      commitData.sha = existingSha;
    }

    await githubRequest('PUT', `/repos/${githubRepo}/contents/${repoPath}`, commitData);

    return respond(200, {
      success: true,
      path: publicPath,
      filename: sanitized,
      message: `Image uploaded successfully. It will appear in the photo library after the next site build.`
    });
  } catch (err) {
    console.error('Error uploading image:', err);
    return respond(500, { success: false, message: `Upload failed: ${err.message}` });
  }
}
