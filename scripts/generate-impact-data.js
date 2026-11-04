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
const crypto = require('crypto');
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

async function getAttendedRsvps(eventId) {
  const params = {
    TableName: rsvpsTable,
    KeyConditionExpression: 'event_id = :eid',
    FilterExpression: '#s = :attended',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':eid': eventId, ':attended': 'attended' }
  };
  const result = await dynamodb.query(params).promise();
  return result.Items || [];
}

// Hash emails before writing them into the public JSON data file so we can
// dedupe volunteers across events without exposing any PII on the site.
function hashEmail(email) {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);
}

async function main() {
  console.log(`Generating impact data from ${environment}...`);
  console.log(`  Events table: ${eventsTable}`);
  console.log(`  Templates table: ${templatesTable}`);

  // Get completed events. The map only renders those with an impact template,
  // but the event list and aggregate cleanup metrics include every completed
  // event (a cleanup still counts even without a drawn map).
  const completedEvents = await queryByStatus(eventsTable, 'completed');
  const eventsWithTemplates = completedEvents.filter(e => e.impact_template);

  console.log(`  Found ${completedEvents.length} completed events, ${eventsWithTemplates.length} with impact templates`);

  const impactData = {
    generated_at: new Date().toISOString(),
    environment: environment,
    stats: { cleanups: 0, miles: 0, volunteers: 0, unique_volunteers: 0, bags_of_trash: 0, tires: 0, litter_lbs: 0 },
    events: [],
    templates: {}
  };

  // Tracks distinct volunteers (hashed email) across all completed events,
  // so we can report a unique-checkin count alongside total check-ins.
  const uniqueVolunteerHashes = new Set();

  for (const event of completedEvents) {
    // Support one or more cleanup locations, each with its own impact
    // template. Falls back to the legacy top-level impact_template for
    // events not yet migrated to the `locations` array.
    const locations = Array.isArray(event.locations) && event.locations.length > 0
      ? event.locations
      : (event.impact_template ? [{ impact_template: event.impact_template, impact_template_version: event.impact_template_version }] : []);

    // Attended RSVPs (used for the check-in count, to dedupe volunteers by
    // hashed email, and to tell which locations were actually cleaned up)
    const attendedRsvps = await getAttendedRsvps(event.event_id);
    const attendedCount = attendedRsvps.length;

    // On multi-location events, a location with 0 attended RSVPs was not
    // cleaned up and is left off the map/miles. Only apply this when RSVPs
    // actually carry a location_id; older RSVPs predate multi-location
    // support and can't be attributed, so all locations are kept.
    const canAttributeByLocation = locations.length > 1 &&
      attendedRsvps.some(r => r.location_id);

    const locationCacheKeys = [];
    const cleanedLocations = [];
    let miles = 0;

    for (let index = 0; index < locations.length; index++) {
      const location = locations[index];
      const templateId = location.impact_template || null;
      const version = location.impact_template_version || 1;
      if (!templateId) continue;

      // Same synthetic id scheme used by the RSVP lambdas and hugo-generator
      const locationId = location.location_id || `loc_${event.event_id}_${index}`;
      if (canAttributeByLocation &&
          !attendedRsvps.some(r => r.location_id === locationId)) {
        continue;
      }

      const cacheKey = `${templateId}:${version}`;
      locationCacheKeys.push(cacheKey);
      cleanedLocations.push({
        location_id: locationId,
        name: location.name || '',
        template_key: cacheKey
      });

      // Fetch template if present and not cached (used for the map + miles)
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

      const tmpl = impactData.templates[cacheKey];
      if (tmpl) miles += tmpl.estimated_miles;
    }

    // Keep legacy single-template fields populated from the first location
    // with a template, for any code still reading the old shape.
    const templateId = locationCacheKeys.length > 0 ? locationCacheKeys[0].split(':')[0] : null;
    const version = locationCacheKeys.length > 0 ? parseInt(locationCacheKeys[0].split(':')[1]) : 1;

    // Normalize cleanup metrics (may be absent on older completed events)
    const cm = event.cleanup_metrics || {};
    const bags = Number(cm.bags_of_trash) || 0;
    const tires = Number(cm.number_of_tires) || 0;
    const litterLbs = Number(cm.total_litter_lbs) || 0;

    // Volunteer count: a manually entered volunteer_count wins, since it is
    // set deliberately by an admin (e.g. a scout troop event with 152
    // volunteers but only 6 formal RSVPs). Otherwise use attended RSVPs.
    const isAdHoc = event.ad_hoc === true;
    const manualCount = Number(event.volunteer_count) || 0;
    const volunteerCount = manualCount > 0 ? manualCount : attendedCount;

    // Hash each attendee's email so we can dedupe repeat volunteers across
    // events without ever writing PII into the public impact JSON.
    const volunteerHashes = attendedRsvps
      .filter(rsvp => rsvp.email)
      .map(rsvp => hashEmail(rsvp.email));
    volunteerHashes.forEach(hash => uniqueVolunteerHashes.add(hash));

    impactData.events.push({
      event_id: event.event_id,
      title: event.title,
      start_time: event.start_time,
      hugo_slug: event.hugo_slug || event.event_id,
      ad_hoc: isAdHoc,
      impact_template: templateId,
      impact_template_version: version,
      // All location templates for this event (cache keys into `templates`).
      // `impact_template*` above only reflects the first location.
      template_keys: [...new Set(locationCacheKeys)].filter(k => impactData.templates[k]),
      // Cleaned locations with their display names (the location's own
      // name, not the event title) and template reference.
      locations: cleanedLocations.filter(l => impactData.templates[l.template_key]),
      attended_count: volunteerCount,
      volunteer_hashes: volunteerHashes,
      cleanup_metrics: {
        bags_of_trash: bags,
        number_of_tires: tires,
        total_litter_lbs: litterLbs
      }
    });

    impactData.stats.cleanups++;
    impactData.stats.miles += miles;
    impactData.stats.volunteers += volunteerCount;
    impactData.stats.bags_of_trash += bags;
    impactData.stats.tires += tires;
    impactData.stats.litter_lbs += litterLbs;
  }

  impactData.stats.miles = Math.round(impactData.stats.miles * 10) / 10;
  impactData.stats.litter_lbs = Math.round(impactData.stats.litter_lbs * 10) / 10;
  impactData.stats.unique_volunteers = uniqueVolunteerHashes.size;

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

  console.log(`   ${impactData.stats.cleanups} cleanups, ${impactData.stats.miles} miles, ${impactData.stats.volunteers} check-ins, ${impactData.stats.unique_volunteers} unique volunteers`);
}

main().catch(err => {
  console.error('Failed to generate impact data:', err);
  process.exit(1);
});
