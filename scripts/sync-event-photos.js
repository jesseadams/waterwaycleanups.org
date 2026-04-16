#!/usr/bin/env node
/**
 * Sync Event Photos from S3 to local static files
 * 
 * Runs during the content-sync workflow after hugo-generator.js.
 * - Scans generated event markdown for S3 image URLs
 * - Downloads them to static/uploads/waterway-cleanups/
 * - Rewrites the frontmatter to use the local path
 * - Updates the DynamoDB events table with the local path
 * 
 * Usage: node scripts/sync-event-photos.js --environment=staging
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const AWS = require('aws-sdk');

const S3_URL_PATTERN = /https:\/\/[^"'\s]+\.s3\.amazonaws\.com\/event-photos\/([^"'\s]+)/g;

function getEnvironment() {
  const envArg = process.argv.find(a => a.startsWith('--environment='));
  return envArg ? envArg.split('=')[1] : 'staging';
}

function getTableName(env) {
  return env === 'production' ? 'events' : `events-${env}`;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        https.get(res.headers.location, (res2) => {
          res2.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function main() {
  const env = getEnvironment();
  const tableName = getTableName(env);
  const eventsDir = path.join(process.cwd(), 'content', 'en', 'events');
  const uploadsDir = path.join(process.cwd(), 'static', 'uploads', 'waterway-cleanups');

  console.log(`[sync-event-photos] Environment: ${env}, Table: ${tableName}`);
  console.log(`[sync-event-photos] Scanning: ${eventsDir}`);

  if (!fs.existsSync(eventsDir)) {
    console.log('[sync-event-photos] No events directory found, skipping');
    return;
  }

  // Ensure uploads directory exists
  fs.mkdirSync(uploadsDir, { recursive: true });

  const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'us-east-1'
  });

  const mdFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.md'));
  let synced = 0;

  for (const file of mdFiles) {
    const filePath = path.join(eventsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // Find all S3 image URLs in the frontmatter
    const matches = [...content.matchAll(S3_URL_PATTERN)];
    if (matches.length === 0) continue;

    for (const match of matches) {
      const s3Url = match[0];
      const filename = match[1];
      const localPath = `/uploads/waterway-cleanups/${filename}`;
      const destFile = path.join(uploadsDir, filename);

      // Download if not already present
      if (!fs.existsSync(destFile)) {
        console.log(`[sync-event-photos] Downloading: ${filename}`);
        try {
          await downloadFile(s3Url, destFile);
          console.log(`[sync-event-photos] Saved: ${destFile}`);
        } catch (err) {
          console.error(`[sync-event-photos] Failed to download ${s3Url}: ${err.message}`);
          continue;
        }
      } else {
        console.log(`[sync-event-photos] Already exists: ${filename}`);
      }

      // Rewrite the markdown frontmatter
      content = content.replace(s3Url, localPath);

      // Extract event_id from frontmatter to update DynamoDB
      const eventIdMatch = content.match(/event_id:\s*["']?([^"'\n]+)/);
      // Also try to derive from filename: slug-month-year.md
      const slugFromFile = file.replace('.md', '');

      const eventId = eventIdMatch ? eventIdMatch[1].trim() : slugFromFile;

      // Update DynamoDB events table
      try {
        await dynamoDB.update({
          TableName: tableName,
          Key: { event_id: eventId },
          UpdateExpression: 'SET hugo_config.image = :img',
          ExpressionAttributeValues: { ':img': localPath },
          ConditionExpression: 'attribute_exists(event_id)'
        }).promise();
        console.log(`[sync-event-photos] Updated DynamoDB: ${eventId} -> ${localPath}`);
      } catch (err) {
        if (err.code === 'ConditionalCheckFailedException') {
          console.log(`[sync-event-photos] Event ${eventId} not found in DynamoDB, skipping update`);
        } else {
          console.error(`[sync-event-photos] DynamoDB update failed for ${eventId}: ${err.message}`);
        }
      }

      synced++;
    }

    // Write updated markdown
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  console.log(`[sync-event-photos] Done. Synced ${synced} image(s).`);
}

main().catch(err => {
  console.error('[sync-event-photos] Fatal error:', err);
  process.exit(1);
});
