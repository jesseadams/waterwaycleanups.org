#!/usr/bin/env node

/**
 * Generate static impact data for the /impact page.
 * Fetches completed events and their impact templates from DynamoDB,
 * writes a JSON file that Hugo can use at build time.
 *
 * Usage: node scripts/generate-impact-data.js --environment=staging
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const environment = (() => {
  const envArg = args.find(a => a.startsWith('--environment='));
  return envArg ? envArg.split('=')[1] : 'staging';
})();

const suffix = (environment === 'prod' || environment === 'production') ? '-production' : `-${environment}`;

const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });
const eventsTable = `events${suffix}`;
const rsvpsTable = `event_rsvps${suffix}`;
const templatesTable = `impact_templates${suffix}`;

async function queryByStatus(table, status) {
  const params = {
    TableName: table,
    IndexName: 'status-start_time-index',
    KeyConditionExpression: '#s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': status }
  };
  const result = await dynamodb.query(params).promise();
  return result.Items || [];
}

async function getTemplate(templateId, version) {
  const params = {
    TableName: templatesTable,
    Key: { template_id: templateId, version: parseInt(version) || 1 }
  };
  const result = await dynamodb.get(params).promise();
  return result.Item || null;
}

async function getAttendedCount(eventId) {
  const params = {
    TableName: rsvpsTable,
    KeyConditionExpression: 'event_id = :eid',
    FilterExpression: '#s = :attended',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':eid': eventId, ':attended': 'attended' },
    Select: 'COUNT'
  };
  const result = await dynamodb.query(params).promise();
  return result.Count || 0;
}

async function main() {
  console.log(`Generating impact data from ${environment}...`);
  console.log(`  Events table: ${eventsTable}`);
  console.log(`  Templates table: ${templatesTable}`);

  // Get completed events with impact templates
  const completedEvents = await queryByStatus(eventsTable, 'completed');
  const eventsWithTemplates = completedEvents.filter(e => e.impact_template);

  console.log(`  Found ${completedEvents.length} completed events, ${eventsWithTemplates.length} with impact templates`);

  const impactData = {
    generated_at: new Date().toISOString(),
    environment: environment,
    stats: { cleanups: 0, miles: 0, volunteers: 0 },
    events: [],
    templates: {}
  };

  for (const event of eventsWithTemplates) {
    const templateId = event.impact_template;
    const version = event.impact_template_version || 1;
    const cacheKey = `${templateId}:${version}`;

    // Fetch template if not cached
    if (!impactData.templates[cacheKey]) {
      const tmpl = await getTemplate(templateId, version);
      if (tmpl) {
        impactData.templates[cacheKey] = {
          template_id: tmpl.template_id,
          version: tmpl.version,
          name: tmpl.name,
          estimated_miles: parseFloat(tmpl.estimated_miles || 0),
          features: tmpl.features || {}
        };
      }
    }

    // Get attended count
    const attendedCount = await getAttendedCount(event.event_id);

    const tmpl = impactData.templates[cacheKey];
    const miles = tmpl ? tmpl.estimated_miles : 0;

    impactData.events.push({
      event_id: event.event_id,
      title: event.title,
      start_time: event.start_time,
      impact_template: templateId,
      impact_template_version: version,
      attended_count: attendedCount
    });

    impactData.stats.cleanups++;
    impactData.stats.miles += miles;
    impactData.stats.volunteers += attendedCount;
  }

  impactData.stats.miles = Math.round(impactData.stats.miles * 10) / 10;

  // Write to Hugo data directory
  const outputPath = path.join(__dirname, '..', 'data', 'impact.json');
  fs.writeFileSync(outputPath, JSON.stringify(impactData, null, 2));
  console.log(`\n✅ Written to ${outputPath}`);

  // Also write as a JS file for the static impact page
  const jsOutputPath = path.join(__dirname, '..', 'static', 'data', 'impact-data.js');
  const jsDir = path.dirname(jsOutputPath);
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(jsOutputPath, 'window.IMPACT_DATA = ' + JSON.stringify(impactData) + ';');
  console.log(`   Written to ${jsOutputPath}`);

  console.log(`   ${impactData.stats.cleanups} cleanups, ${impactData.stats.miles} miles, ${impactData.stats.volunteers} volunteers`);
}

main().catch(err => {
  console.error('Failed to generate impact data:', err);
  process.exit(1);
});
