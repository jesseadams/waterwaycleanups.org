// API Endpoint: /api/admin-content-sync
// Manages event content: save drafts to DynamoDB, publish to S3, invalidate CloudFront

const AWS = require('aws-sdk');

AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const cloudfront = new AWS.CloudFront();

const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';
const contentEditsTable = process.env.CONTENT_EDITS_TABLE_NAME || 'content_edits';
const contentBucket = process.env.CONTENT_BUCKET_NAME || 'waterwaycleanups-content';
const cloudfrontDistributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID || '';

// Admin email whitelist
const ADMIN_EMAILS = [
  'admin@waterwaycleanups.org',
  'contact@waterwaycleanups.org',
  'jesse@techno-geeks.org',
  'jesse@waterwaycleanups.org'
];

async function validateAdminSession(sessionToken) {
  const result = await dynamoDB.query({
    TableName: sessionTableName,
    IndexName: 'session-token-index',
    KeyConditionExpression: 'session_token = :token',
    ExpressionAttributeValues: { ':token': sessionToken }
  }).promise();

  const session = (result.Items || [])[0];
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

// Format a date for the Hugo shortcode display string
function formatDateDisplay(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const month = months[start.getMonth()];
  const day = start.getDate();
  const year = start.getFullYear();

  const fmt = (d) => {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return m === 0 ? `${h}:00 ${ampm}` : `${h}:${m.toString().padStart(2,'0')} ${ampm}`;
  };

  return `${month} ${day}, ${year} | ${fmt(start)}-${fmt(end)}`;
}

// Generate Hugo markdown content from event data
function generateMarkdown(eventData) {
  const tags = (eventData.tags || []).map(t => `  - ${t}`).join('\n');
  const dateDisplay = formatDateDisplay(eventData.start_time, eventData.end_time);
  const locationHtml = eventData.location_url
    ? `${eventData.location_name}<br/>\n${eventData.location_address}\n<a href="${eventData.location_url}">Map</a>`
    : `${eventData.location_name}<br/>\n${eventData.location_address}`;

  return `---
title: "${eventData.title}"
seo:
  description: "${eventData.seo_description}"
image: "${eventData.image || '/uploads/waterway-cleanups/default.jpg'}"
tags:
${tags}
preheader_is_light: ${eventData.preheader_is_light ? 'true' : 'false'}
start_time: "${eventData.start_time}"
end_time: "${eventData.end_time}"
---

{{< date_with_icon date="${dateDisplay}" class="large-date" >}}
{{< tabs >}}
## Event Details

${eventData.description}

---
## Location

${locationHtml}

---
## What We Provide

- Trash grabbers
- Gloves
- Reflective vests
- Trash bags
- First Aid Kit

Bring water, wear sturdy shoes, and dress for the weather. All ages welcome—kids under 18 must be accompanied by an adult.
{{< /tabs >}}

{{< event_rsvp attendance_cap="${eventData.attendance_cap || 20}" >}}
`;
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
    body = JSON.parse(event.body);
  } catch (e) {
    return respond(400, { success: false, message: 'Invalid JSON body' });
  }

  if (!body.session_token) {
    return respond(401, { success: false, message: 'Session token required' });
  }

  const session = await validateAdminSession(body.session_token);
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
      case 'publish':
        return await handlePublish(body, session);
      case 'load_event':
        return await handleLoadEvent(body, session);
      default:
        return respond(400, { success: false, message: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`Error handling ${action}:`, err);
    return respond(500, { success: false, message: 'Internal server error' });
  }
};

// Save or update a draft edit in DynamoDB
async function handleSaveDraft(body, session) {
  const eventData = body.event_data;
  if (!eventData || !eventData.title || !eventData.start_time || !eventData.end_time) {
    return respond(400, { success: false, message: 'Missing required event fields (title, start_time, end_time)' });
  }

  const slug = eventData.slug || slugify(eventData.title);
  const editId = body.edit_id || `edit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const isNew = !body.existing_file;
  const filePath = `content/en/events/${slug}.md`;
  const markdown = generateMarkdown(eventData);

  const item = {
    edit_id: editId,
    file_path: filePath,
    slug: slug,
    title: eventData.title,
    event_data: eventData,
    markdown_content: markdown,
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
    file_path: filePath,
    slug: slug,
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

// Load an existing event file from S3 for editing
async function handleLoadEvent(body, session) {
  if (!body.file_path) {
    return respond(400, { success: false, message: 'file_path required' });
  }

  try {
    const obj = await s3.getObject({
      Bucket: contentBucket,
      Key: body.file_path
    }).promise();

    const content = obj.Body.toString('utf-8');
    return respond(200, { success: true, content, file_path: body.file_path });
  } catch (err) {
    if (err.code === 'NoSuchKey') {
      return respond(404, { success: false, message: 'File not found in S3' });
    }
    throw err;
  }
}

// Publish all pending edits (or specific ones) to S3 and invalidate CloudFront
async function handlePublish(body, session) {
  // Get edits to publish
  let editsToPublish;
  if (body.edit_ids && body.edit_ids.length > 0) {
    // Publish specific edits
    const results = await Promise.all(
      body.edit_ids.map(id =>
        dynamoDB.get({ TableName: contentEditsTable, Key: { edit_id: id } }).promise()
      )
    );
    editsToPublish = results.map(r => r.Item).filter(Boolean);
  } else {
    // Publish all pending
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

  const publishedPaths = [];
  const errors = [];

  for (const edit of editsToPublish) {
    try {
      // Upload markdown to S3
      await s3.putObject({
        Bucket: contentBucket,
        Key: edit.file_path,
        Body: edit.markdown_content,
        ContentType: 'text/markdown; charset=utf-8'
      }).promise();

      // Mark as published
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

      publishedPaths.push(edit.file_path);
      console.log(`Published: ${edit.file_path}`);
    } catch (err) {
      console.error(`Failed to publish ${edit.file_path}:`, err);
      errors.push({ file_path: edit.file_path, error: err.message });
    }
  }

  // Invalidate CloudFront cache
  let invalidationId = null;
  if (publishedPaths.length > 0 && cloudfrontDistributionId) {
    try {
      const invalidation = await cloudfront.createInvalidation({
        DistributionId: cloudfrontDistributionId,
        InvalidationBatch: {
          CallerReference: `publish-${Date.now()}`,
          Paths: {
            Quantity: publishedPaths.length + 1,
            Items: [
              ...publishedPaths.map(p => `/${p}`),
              '/events/*'
            ]
          }
        }
      }).promise();
      invalidationId = invalidation.Invalidation.Id;
      console.log(`CloudFront invalidation created: ${invalidationId}`);
    } catch (err) {
      console.error('CloudFront invalidation failed:', err);
      errors.push({ file_path: 'cloudfront', error: err.message });
    }
  }

  return respond(200, {
    success: true,
    published: publishedPaths.length,
    published_paths: publishedPaths,
    invalidation_id: invalidationId,
    errors: errors.length > 0 ? errors : undefined,
    message: `Published ${publishedPaths.length} file(s)${invalidationId ? ', CloudFront invalidation started' : ''}`
  });
}
