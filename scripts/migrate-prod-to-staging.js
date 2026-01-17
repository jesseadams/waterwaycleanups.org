#!/usr/bin/env node

/**
 * Production to Staging Data Migration Script
 * 
 * This script migrates data from production DynamoDB tables to staging tables.
 * It handles:
 * 1. Clearing existing staging data (optional)
 * 2. Copying all production data to staging
 * 3. Validating the migrated data
 * 
 * Usage: 
 *   node scripts/migrate-prod-to-staging.js [--dry-run] [--skip-clear] [--verbose]
 */

require('dotenv').config();
const AWS = require('aws-sdk');

// Configuration
const REGION = process.env.AWS_REGION || 'us-east-1';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipClear = args.includes('--skip-clear');
const isVerbose = args.includes('--verbose');

console.log(`🔄 Production to Staging Migration Script`);
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
console.log(`Clear staging first: ${skipClear ? 'NO' : 'YES'}`);
console.log(`Verbose: ${isVerbose ? 'ON' : 'OFF'}`);
console.log('');

// Configure AWS
AWS.config.update({ region: REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Table definitions
const TABLES = {
  events: { prod: 'events', staging: 'events-staging' },
  volunteers: { prod: 'volunteers', staging: 'volunteers-staging' },
  rsvps: { prod: 'rsvps', staging: 'rsvps-staging' },
  event_rsvps_legacy: { prod: 'event_rsvps', staging: 'event_rsvps-staging' }, // Legacy RSVP table
  minors: { prod: 'minors', staging: 'minors-staging' },
  volunteer_waivers: { prod: 'volunteer_waivers', staging: 'volunteer_waivers-staging' },
  auth_codes: { prod: 'auth_codes', staging: 'auth_codes-staging' },
  user_sessions: { prod: 'user_sessions', staging: 'user_sessions-staging' }
};

/**
 * Logging utility
 */
function log(message, force = false) {
  if (isVerbose || force) {
    console.log(message);
  }
}

/**
 * Scan all items from a table
 */
async function scanTable(tableName) {
  log(`Scanning table: ${tableName}`);
  
  try {
    const params = { TableName: tableName };
    const allItems = [];
    let lastEvaluatedKey = null;
    
    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const result = await dynamodb.scan(params).promise();
      allItems.push(...result.Items);
      lastEvaluatedKey = result.LastEvaluatedKey;
      
      log(`  Found ${result.Items.length} items (total: ${allItems.length})`);
    } while (lastEvaluatedKey);
    
    return allItems;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      log(`  ⚠️  Table ${tableName} not found`, true);
      return null;
    }
    throw error;
  }
}

/**
 * Get table key schema
 */
async function getTableKeySchema(tableName) {
  try {
    const db = new AWS.DynamoDB();
    const result = await db.describeTable({ TableName: tableName }).promise();
    
    const keySchema = {};
    for (const key of result.Table.KeySchema) {
      const attrDef = result.Table.AttributeDefinitions.find(
        attr => attr.AttributeName === key.AttributeName
      );
      keySchema[key.KeyType] = {
        name: key.AttributeName,
        type: attrDef.AttributeType
      };
    }
    
    return keySchema;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      return null;
    }
    throw error;
  }
}

/**
 * Delete all items from a table
 */
async function clearTable(tableName) {
  log(`Clearing table: ${tableName}`, true);
  
  const items = await scanTable(tableName);
  if (!items || items.length === 0) {
    log(`  ℹ️  Table is already empty or doesn't exist`);
    return { deletedCount: 0 };
  }
  
  const keySchema = await getTableKeySchema(tableName);
  if (!keySchema) {
    log(`  ⚠️  Could not get key schema for ${tableName}`);
    return { deletedCount: 0 };
  }
  
  let deletedCount = 0;
  
  for (const item of items) {
    if (isDryRun) {
      log(`  [DRY RUN] Would delete item with key: ${JSON.stringify(getItemKey(item, keySchema))}`);
      deletedCount++;
      continue;
    }
    
    try {
      await dynamodb.delete({
        TableName: tableName,
        Key: getItemKey(item, keySchema)
      }).promise();
      
      deletedCount++;
      if (deletedCount % 10 === 0) {
        log(`  Deleted ${deletedCount}/${items.length} items`);
      }
    } catch (error) {
      log(`  ❌ Failed to delete item: ${error.message}`);
    }
  }
  
  log(`  ✅ Deleted ${deletedCount} items`, true);
  return { deletedCount };
}

/**
 * Extract key attributes from an item based on key schema
 */
function getItemKey(item, keySchema) {
  const key = {};
  
  if (keySchema.HASH) {
    key[keySchema.HASH.name] = item[keySchema.HASH.name];
  }
  
  if (keySchema.RANGE) {
    key[keySchema.RANGE.name] = item[keySchema.RANGE.name];
  }
  
  return key;
}

/**
 * Transform legacy RSVP data to new schema
 */
function transformLegacyRsvp(item) {
  // Legacy event_rsvps table uses 'email' as sort key
  // New schema uses 'attendee_id' as sort key
  return {
    ...item,
    attendee_id: item.email, // Set attendee_id to email for backward compatibility
    attendee_type: 'volunteer' // All legacy RSVPs are volunteers
  };
}

/**
 * Extract volunteer records from legacy RSVP data
 */
function extractVolunteersFromRsvps(rsvps) {
  const volunteerMap = new Map();
  
  for (const rsvp of rsvps) {
    if (!volunteerMap.has(rsvp.email)) {
      volunteerMap.set(rsvp.email, {
        email: rsvp.email,
        first_name: rsvp.first_name || '',
        last_name: rsvp.last_name || '',
        full_name: `${rsvp.first_name || ''} ${rsvp.last_name || ''}`.trim(),
        phone: rsvp.phone || null,
        emergency_contact: rsvp.emergency_contact || null,
        dietary_restrictions: rsvp.dietary_restrictions || null,
        volunteer_experience: rsvp.volunteer_experience || null,
        how_did_you_hear: rsvp.how_did_you_hear || null,
        created_at: rsvp.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile_complete: !!(rsvp.first_name && rsvp.last_name),
        communication_preferences: {
          email_notifications: true,
          sms_notifications: false
        },
        volunteer_metrics: {
          total_rsvps: 0,
          total_cancellations: 0,
          total_no_shows: 0,
          total_attended: 0,
          first_event_date: null,
          last_event_date: null
        }
      });
    }
  }
  
  return Array.from(volunteerMap.values());
}

/**
 * Extract volunteer records from legacy waiver data
 */
function extractVolunteersFromWaivers(waivers) {
  const volunteerMap = new Map();
  
  for (const waiver of waivers) {
    // Only process adult waivers for volunteers table
    if (waiver.is_adult) {
      if (!volunteerMap.has(waiver.email)) {
        // Parse name from full_legal_name
        const nameParts = (waiver.full_legal_name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        volunteerMap.set(waiver.email, {
          email: waiver.email,
          first_name: firstName,
          last_name: lastName,
          full_name: waiver.full_legal_name || '',
          phone: waiver.phone_number || null,
          emergency_contact: null,
          dietary_restrictions: null,
          volunteer_experience: null,
          how_did_you_hear: null,
          created_at: waiver.submission_date || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          profile_complete: !!(firstName && lastName),
          communication_preferences: {
            email_notifications: true,
            sms_notifications: false
          },
          volunteer_metrics: {
            total_rsvps: 0,
            total_cancellations: 0,
            total_no_shows: 0,
            total_attended: 0,
            first_event_date: null,
            last_event_date: null
          }
        });
      }
    }
  }
  
  return Array.from(volunteerMap.values());
}

/**
 * Extract minor records from legacy waiver data
 */
function extractMinorsFromWaivers(waivers) {
  const minors = [];
  
  for (const waiver of waivers) {
    // Only process minor waivers
    if (!waiver.is_adult && waiver.guardian_email) {
      // Parse name from full_legal_name
      const nameParts = (waiver.full_legal_name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Generate minor_id from email (remove domain)
      const minorId = waiver.email.split('@')[0];
      
      minors.push({
        guardian_email: waiver.guardian_email.toLowerCase(),
        minor_id: minorId,
        first_name: firstName,
        last_name: lastName,
        full_name: waiver.full_legal_name || '',
        date_of_birth: waiver.date_of_birth || null,
        emergency_contact: waiver.phone_number || null,
        dietary_restrictions: null,
        created_at: waiver.submission_date || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }
  
  return minors;
}

/**
 * Merge volunteer records from multiple sources
 */
function mergeVolunteers(rsvpVolunteers, waiverVolunteers) {
  const volunteerMap = new Map();
  
  // Add RSVP volunteers first (they have more complete data)
  for (const volunteer of rsvpVolunteers) {
    volunteerMap.set(volunteer.email, volunteer);
  }
  
  // Merge in waiver data
  for (const waiverVol of waiverVolunteers) {
    if (volunteerMap.has(waiverVol.email)) {
      const existing = volunteerMap.get(waiverVol.email);
      // Keep RSVP data but fill in missing fields from waiver
      if (!existing.phone && waiverVol.phone) {
        existing.phone = waiverVol.phone;
      }
      if (!existing.first_name && waiverVol.first_name) {
        existing.first_name = waiverVol.first_name;
      }
      if (!existing.last_name && waiverVol.last_name) {
        existing.last_name = waiverVol.last_name;
      }
      if (!existing.full_name && waiverVol.full_name) {
        existing.full_name = waiverVol.full_name;
      }
      existing.profile_complete = !!(existing.first_name && existing.last_name);
    } else {
      volunteerMap.set(waiverVol.email, waiverVol);
    }
  }
  
  return Array.from(volunteerMap.values());
}

/**
 * Copy items from one table to another
 */
async function copyTableData(sourceTable, targetTable, items, tableKey) {
  log(`Copying ${items.length} items from ${sourceTable} to ${targetTable}`, true);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const item of items) {
    // Transform legacy RSVP data if needed
    let transformedItem = item;
    if (tableKey === 'event_rsvps_legacy') {
      transformedItem = transformLegacyRsvp(item);
      if (isDryRun && successCount === 0) {
        log(`  [INFO] Transforming legacy RSVPs: adding attendee_id and attendee_type fields`);
      }
    }
    
    if (isDryRun) {
      log(`  [DRY RUN] Would copy item to ${targetTable}`);
      successCount++;
      continue;
    }
    
    try {
      await dynamodb.put({
        TableName: targetTable,
        Item: transformedItem
      }).promise();
      
      successCount++;
      if (successCount % 10 === 0) {
        log(`  Copied ${successCount}/${items.length} items`);
      }
    } catch (error) {
      log(`  ❌ Failed to copy item: ${error.message}`);
      errorCount++;
    }
  }
  
  log(`  ✅ Copied ${successCount} items, ${errorCount} errors`, true);
  return { successCount, errorCount };
}

/**
 * Validate migrated data
 */
async function validateMigration(tableName, prodItems, stagingItems) {
  log(`Validating ${tableName}...`, true);
  
  const issues = [];
  
  // Check counts match
  if (prodItems.length !== stagingItems.length) {
    issues.push(`Count mismatch: prod=${prodItems.length}, staging=${stagingItems.length}`);
  }
  
  // For legacy RSVP table, skip detailed validation since we transform the data
  if (tableName === 'event_rsvps_legacy') {
    log(`  ℹ️  Skipping detailed validation (data is transformed during migration)`, true);
    return issues;
  }
  
  // Sample validation - check a few random items
  const sampleSize = Math.min(5, prodItems.length);
  for (let i = 0; i < sampleSize; i++) {
    const randomIndex = Math.floor(Math.random() * prodItems.length);
    const prodItem = prodItems[randomIndex];
    
    // Find matching item in staging (this is simplified - would need proper key matching)
    const stagingItem = stagingItems.find(item => 
      JSON.stringify(item) === JSON.stringify(prodItem)
    );
    
    if (!stagingItem) {
      issues.push(`Sample item ${randomIndex} not found in staging`);
    }
  }
  
  if (issues.length === 0) {
    log(`  ✅ Validation passed`, true);
  } else {
    log(`  ⚠️  Validation issues:`, true);
    issues.forEach(issue => log(`    - ${issue}`, true));
  }
  
  return issues;
}

/**
 * Migrate a single table
 */
async function migrateTable(tableKey) {
  const { prod, staging } = TABLES[tableKey];
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 Migrating: ${tableKey}`);
  console.log(`   Production: ${prod}`);
  console.log(`   Staging: ${staging}`);
  console.log('='.repeat(60));
  
  // Step 1: Get production data
  console.log('\n📥 Step 1: Reading production data...');
  const prodItems = await scanTable(prod);
  
  if (!prodItems) {
    console.log(`⚠️  Production table ${prod} not found, skipping`);
    return { skipped: true };
  }
  
  console.log(`✅ Found ${prodItems.length} items in production`);
  
  // Step 2: Clear staging (if not skipped)
  if (!skipClear) {
    console.log('\n🗑️  Step 2: Clearing staging data...');
    const clearResult = await clearTable(staging);
    console.log(`✅ Cleared ${clearResult.deletedCount} items from staging`);
  } else {
    console.log('\n⏭️  Step 2: Skipping staging clear (--skip-clear flag)');
  }
  
  // Step 3: Copy data to staging
  console.log('\n📤 Step 3: Copying data to staging...');
  const copyResult = await copyTableData(prod, staging, prodItems, tableKey);
  
  // Step 4: Validate
  if (!isDryRun) {
    console.log('\n🔍 Step 4: Validating migration...');
    const stagingItems = await scanTable(staging);
    const validationIssues = await validateMigration(tableKey, prodItems, stagingItems);
    
    return {
      prodCount: prodItems.length,
      stagingCount: stagingItems ? stagingItems.length : 0,
      copiedCount: copyResult.successCount,
      errorCount: copyResult.errorCount,
      validationIssues,
      prodItems // Store for volunteer/minor extraction
    };
  }
  
  return {
    prodCount: prodItems.length,
    copiedCount: copyResult.successCount,
    errorCount: copyResult.errorCount,
    dryRun: true,
    prodItems // Store for volunteer/minor extraction
  };
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    console.log('🚀 Starting production to staging migration...\n');
    
    const results = {};
    const allData = {
      rsvps: [],
      waivers: []
    };
    
    // Migrate each table
    for (const tableKey of Object.keys(TABLES)) {
      try {
        results[tableKey] = await migrateTable(tableKey);
        
        // Store data for volunteer/minor extraction
        if (tableKey === 'event_rsvps_legacy' && results[tableKey].prodItems) {
          allData.rsvps = results[tableKey].prodItems;
        }
        if (tableKey === 'volunteer_waivers' && results[tableKey].prodItems) {
          allData.waivers = results[tableKey].prodItems;
        }
      } catch (error) {
        console.error(`❌ Failed to migrate ${tableKey}:`, error.message);
        results[tableKey] = { error: error.message };
      }
    }
    
    // Extract and populate volunteers and minors
    if (allData.rsvps.length > 0 || allData.waivers.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('👥 Extracting Volunteers and Minors from Legacy Data');
      console.log('='.repeat(60));
      
      // Extract volunteers from both sources
      const rsvpVolunteers = extractVolunteersFromRsvps(allData.rsvps);
      const waiverVolunteers = extractVolunteersFromWaivers(allData.waivers);
      const volunteers = mergeVolunteers(rsvpVolunteers, waiverVolunteers);
      
      console.log(`\n✅ Extracted ${volunteers.length} unique volunteers`);
      console.log(`   - From RSVPs: ${rsvpVolunteers.length}`);
      console.log(`   - From waivers: ${waiverVolunteers.length}`);
      console.log(`   - Merged total: ${volunteers.length}`);
      
      // Extract minors from waivers
      const minors = extractMinorsFromWaivers(allData.waivers);
      console.log(`\n✅ Extracted ${minors.length} minors from waivers`);
      
      // Populate volunteers table
      if (volunteers.length > 0) {
        console.log(`\n💾 Populating volunteers-staging table...`);
        const volunteerResults = await copyTableData(
          'extracted_data',
          'volunteers-staging',
          volunteers,
          'volunteers'
        );
        results.volunteers_extracted = {
          extractedCount: volunteers.length,
          copiedCount: volunteerResults.successCount,
          errorCount: volunteerResults.errorCount
        };
      }
      
      // Populate minors table
      if (minors.length > 0) {
        console.log(`\n💾 Populating minors-staging table...`);
        const minorResults = await copyTableData(
          'extracted_data',
          'minors-staging',
          minors,
          'minors'
        );
        results.minors_extracted = {
          extractedCount: minors.length,
          copiedCount: minorResults.successCount,
          errorCount: minorResults.errorCount
        };
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    
    let totalProd = 0;
    let totalStaging = 0;
    let totalCopied = 0;
    let totalErrors = 0;
    let totalIssues = 0;
    
    for (const [tableKey, result] of Object.entries(results)) {
      console.log(`\n${tableKey}:`);
      
      if (result.skipped) {
        console.log('  Status: Skipped (table not found)');
      } else if (result.error) {
        console.log(`  Status: Failed - ${result.error}`);
      } else {
        console.log(`  Production items: ${result.prodCount}`);
        if (!isDryRun) {
          console.log(`  Staging items: ${result.stagingCount}`);
        }
        console.log(`  Copied: ${result.copiedCount}`);
        if (result.errorCount > 0) {
          console.log(`  Errors: ${result.errorCount}`);
        }
        if (result.validationIssues && result.validationIssues.length > 0) {
          console.log(`  Validation issues: ${result.validationIssues.length}`);
        }
        
        totalProd += result.prodCount || 0;
        totalStaging += result.stagingCount || 0;
        totalCopied += result.copiedCount || 0;
        totalErrors += result.errorCount || 0;
        totalIssues += result.validationIssues ? result.validationIssues.length : 0;
      }
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`Total production items: ${totalProd}`);
    if (!isDryRun) {
      console.log(`Total staging items: ${totalStaging}`);
    }
    console.log(`Total copied: ${totalCopied}`);
    if (totalErrors > 0) {
      console.log(`Total errors: ${totalErrors}`);
    }
    if (totalIssues > 0) {
      console.log(`Total validation issues: ${totalIssues}`);
    }
    
    // Add extracted data summary
    if (results.volunteers_extracted) {
      console.log(`\nExtracted volunteers: ${results.volunteers_extracted.extractedCount} (${results.volunteers_extracted.copiedCount} copied)`);
    }
    if (results.minors_extracted) {
      console.log(`Extracted minors: ${results.minors_extracted.extractedCount} (${results.minors_extracted.copiedCount} copied)`);
    }
    
    console.log('\n✅ Migration completed!');
    
    if (isDryRun) {
      console.log('\n🚀 To apply these changes, run:');
      console.log('   node scripts/migrate-prod-to-staging.js');
    }
    
    if (totalIssues > 0) {
      console.log('\n⚠️  Validation issues detected. Review the output above.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
runMigration();
