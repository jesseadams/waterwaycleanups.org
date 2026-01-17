#!/usr/bin/env node

/**
 * Staging Data Validation Script
 * 
 * Validates that staging data matches production data after migration.
 * Performs detailed comparison and integrity checks.
 * 
 * Usage: node scripts/validate-staging-data.js [--verbose] [--detailed]
 */

require('dotenv').config();
const AWS = require('aws-sdk');

// Configuration
const REGION = process.env.AWS_REGION || 'us-east-1';

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const isDetailed = args.includes('--detailed');

console.log(`🔍 Staging Data Validation Script`);
console.log(`Verbose: ${isVerbose ? 'ON' : 'OFF'}`);
console.log(`Detailed: ${isDetailed ? 'ON' : 'OFF'}`);
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
      log(`  ⚠️  Table ${tableName} not found`);
      return null;
    }
    throw error;
  }
}

/**
 * Get primary key field names for a table
 */
function getKeyFields(tableKey) {
  const keyMap = {
    events: ['event_id'],
    volunteers: ['email'],
    rsvps: ['event_id', 'email'],
    event_rsvps_legacy: ['event_id', 'email'], // Legacy RSVP table has same keys
    minors: ['guardian_email', 'minor_id'],
    volunteer_waivers: ['email'],
    auth_codes: ['email'],
    user_sessions: ['session_id']
  };
  
  return keyMap[tableKey] || [];
}

/**
 * Create a key string for an item
 */
function getItemKeyString(item, keyFields) {
  return keyFields.map(field => item[field]).join('#');
}

/**
 * Compare two items for equality
 */
function compareItems(item1, item2, keyFields) {
  const differences = [];
  
  // Get all unique keys
  const allKeys = new Set([...Object.keys(item1), ...Object.keys(item2)]);
  
  for (const key of allKeys) {
    // Skip timestamp fields that might differ slightly
    if (key.includes('_at') || key.includes('timestamp')) {
      continue;
    }
    
    const val1 = JSON.stringify(item1[key]);
    const val2 = JSON.stringify(item2[key]);
    
    if (val1 !== val2) {
      differences.push({
        field: key,
        prod: item1[key],
        staging: item2[key]
      });
    }
  }
  
  return differences;
}

/**
 * Validate a single table
 */
async function validateTable(tableKey) {
  const { prod, staging } = TABLES[tableKey];
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Validating: ${tableKey}`);
  console.log(`   Production: ${prod}`);
  console.log(`   Staging: ${staging}`);
  console.log('='.repeat(60));
  
  // Get data from both tables
  const prodItems = await scanTable(prod);
  const stagingItems = await scanTable(staging);
  
  if (!prodItems) {
    console.log(`⚠️  Production table not found, skipping`);
    return { skipped: true, reason: 'prod_not_found' };
  }
  
  if (!stagingItems) {
    console.log(`❌ Staging table not found`);
    return { error: 'staging_not_found' };
  }
  
  const issues = [];
  const keyFields = getKeyFields(tableKey);
  
  // Check 1: Count comparison
  console.log(`\n📊 Count Comparison:`);
  console.log(`   Production: ${prodItems.length} items`);
  console.log(`   Staging: ${stagingItems.length} items`);
  
  if (prodItems.length !== stagingItems.length) {
    const issue = `Count mismatch: prod=${prodItems.length}, staging=${stagingItems.length}`;
    issues.push(issue);
    console.log(`   ❌ ${issue}`);
  } else {
    console.log(`   ✅ Counts match`);
  }
  
  // Check 2: Create lookup maps
  const prodMap = new Map();
  const stagingMap = new Map();
  
  for (const item of prodItems) {
    const key = getItemKeyString(item, keyFields);
    prodMap.set(key, item);
  }
  
  for (const item of stagingItems) {
    const key = getItemKeyString(item, keyFields);
    stagingMap.set(key, item);
  }
  
  // Check 3: Find missing items in staging
  console.log(`\n🔍 Missing Items Check:`);
  const missingInStaging = [];
  
  for (const [key, item] of prodMap) {
    if (!stagingMap.has(key)) {
      missingInStaging.push(key);
      if (isDetailed) {
        log(`   Missing in staging: ${key}`);
      }
    }
  }
  
  if (missingInStaging.length > 0) {
    const issue = `${missingInStaging.length} items in prod not found in staging`;
    issues.push(issue);
    console.log(`   ❌ ${issue}`);
    if (!isDetailed && missingInStaging.length <= 5) {
      missingInStaging.forEach(key => console.log(`      - ${key}`));
    }
  } else {
    console.log(`   ✅ All production items found in staging`);
  }
  
  // Check 4: Find extra items in staging
  const extraInStaging = [];
  
  for (const [key, item] of stagingMap) {
    if (!prodMap.has(key)) {
      extraInStaging.push(key);
      if (isDetailed) {
        log(`   Extra in staging: ${key}`);
      }
    }
  }
  
  if (extraInStaging.length > 0) {
    const issue = `${extraInStaging.length} items in staging not found in prod`;
    issues.push(issue);
    console.log(`   ❌ ${issue}`);
    if (!isDetailed && extraInStaging.length <= 5) {
      extraInStaging.forEach(key => console.log(`      - ${key}`));
    }
  } else {
    console.log(`   ✅ No extra items in staging`);
  }
  
  // Check 5: Compare matching items
  if (isDetailed) {
    console.log(`\n🔬 Detailed Item Comparison:`);
    let mismatchCount = 0;
    
    for (const [key, prodItem] of prodMap) {
      const stagingItem = stagingMap.get(key);
      if (stagingItem) {
        const differences = compareItems(prodItem, stagingItem, keyFields);
        if (differences.length > 0) {
          mismatchCount++;
          console.log(`   ⚠️  Differences in ${key}:`);
          differences.forEach(diff => {
            console.log(`      Field: ${diff.field}`);
            console.log(`      Prod: ${JSON.stringify(diff.prod)}`);
            console.log(`      Staging: ${JSON.stringify(diff.staging)}`);
          });
        }
      }
    }
    
    if (mismatchCount > 0) {
      const issue = `${mismatchCount} items have field differences`;
      issues.push(issue);
      console.log(`   ❌ ${issue}`);
    } else {
      console.log(`   ✅ All matching items are identical`);
    }
  }
  
  // Check 6: Data integrity checks (table-specific)
  console.log(`\n🔐 Data Integrity Checks:`);
  const integrityIssues = await validateDataIntegrity(tableKey, stagingItems);
  
  if (integrityIssues.length > 0) {
    issues.push(...integrityIssues);
    integrityIssues.forEach(issue => console.log(`   ❌ ${issue}`));
  } else {
    console.log(`   ✅ Data integrity checks passed`);
  }
  
  // Summary
  if (issues.length === 0) {
    console.log(`\n✅ Validation PASSED for ${tableKey}`);
  } else {
    console.log(`\n❌ Validation FAILED for ${tableKey} (${issues.length} issues)`);
  }
  
  return {
    prodCount: prodItems.length,
    stagingCount: stagingItems.length,
    missingCount: missingInStaging.length,
    extraCount: extraInStaging.length,
    issues
  };
}

/**
 * Validate data integrity for specific table types
 */
async function validateDataIntegrity(tableKey, items) {
  const issues = [];
  
  switch (tableKey) {
    case 'events':
      // Check required fields
      for (const item of items) {
        if (!item.event_id) issues.push('Event missing event_id');
        if (!item.title) issues.push(`Event ${item.event_id} missing title`);
        if (!item.start_time) issues.push(`Event ${item.event_id} missing start_time`);
      }
      break;
      
    case 'volunteers':
      // Check required fields
      for (const item of items) {
        if (!item.email) issues.push('Volunteer missing email');
        if (!item.email?.includes('@')) issues.push(`Invalid email: ${item.email}`);
      }
      break;
      
    case 'rsvps':
      // Check required fields
      for (const item of items) {
        if (!item.event_id) issues.push('RSVP missing event_id');
        if (!item.email) issues.push('RSVP missing email');
        if (!item.status) issues.push(`RSVP ${item.event_id}/${item.email} missing status`);
      }
      break;
      
    case 'minors':
      // Check required fields
      for (const item of items) {
        if (!item.guardian_email) issues.push('Minor missing guardian_email');
        if (!item.minor_id) issues.push('Minor missing minor_id');
        if (!item.first_name) issues.push(`Minor ${item.minor_id} missing first_name`);
      }
      break;
  }
  
  // Return only unique issues
  return [...new Set(issues)];
}

/**
 * Validate cross-table relationships
 */
async function validateRelationships(allData) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔗 Cross-Table Relationship Validation`);
  console.log('='.repeat(60));
  
  const issues = [];
  
  // Check 1: RSVPs reference valid events
  if (allData.rsvps && allData.events) {
    console.log(`\n📋 Checking RSVP → Event references...`);
    const eventIds = new Set(allData.events.map(e => e.event_id));
    const invalidRsvps = allData.rsvps.filter(r => !eventIds.has(r.event_id));
    
    if (invalidRsvps.length > 0) {
      const issue = `${invalidRsvps.length} RSVPs reference non-existent events`;
      issues.push(issue);
      console.log(`   ❌ ${issue}`);
      if (invalidRsvps.length <= 5) {
        invalidRsvps.forEach(r => console.log(`      - ${r.event_id} (${r.email})`));
      }
    } else {
      console.log(`   ✅ All RSVPs reference valid events`);
    }
  }
  
  // Check 2: RSVPs reference valid volunteers
  if (allData.rsvps && allData.volunteers) {
    console.log(`\n👥 Checking RSVP → Volunteer references...`);
    const volunteerEmails = new Set(allData.volunteers.map(v => v.email));
    const invalidRsvps = allData.rsvps.filter(r => !volunteerEmails.has(r.email));
    
    if (invalidRsvps.length > 0) {
      const issue = `${invalidRsvps.length} RSVPs reference non-existent volunteers`;
      issues.push(issue);
      console.log(`   ❌ ${issue}`);
      if (invalidRsvps.length <= 5) {
        invalidRsvps.forEach(r => console.log(`      - ${r.email} (${r.event_id})`));
      }
    } else {
      console.log(`   ✅ All RSVPs reference valid volunteers`);
    }
  }
  
  // Check 3: Minors reference valid guardians
  if (allData.minors && allData.volunteers) {
    console.log(`\n👶 Checking Minor → Guardian references...`);
    const volunteerEmails = new Set(allData.volunteers.map(v => v.email));
    const invalidMinors = allData.minors.filter(m => !volunteerEmails.has(m.guardian_email));
    
    if (invalidMinors.length > 0) {
      const issue = `${invalidMinors.length} minors reference non-existent guardians`;
      issues.push(issue);
      console.log(`   ❌ ${issue}`);
      if (invalidMinors.length <= 5) {
        invalidMinors.forEach(m => console.log(`      - ${m.minor_id} (guardian: ${m.guardian_email})`));
      }
    } else {
      console.log(`   ✅ All minors reference valid guardians`);
    }
  }
  
  if (issues.length === 0) {
    console.log(`\n✅ All relationship validations passed`);
  } else {
    console.log(`\n❌ Relationship validation failed (${issues.length} issues)`);
  }
  
  return issues;
}

/**
 * Main validation function
 */
async function runValidation() {
  try {
    console.log('🚀 Starting staging data validation...\n');
    
    const results = {};
    const allStagingData = {};
    
    // Validate each table
    for (const tableKey of Object.keys(TABLES)) {
      try {
        results[tableKey] = await validateTable(tableKey);
        
        // Store staging data for relationship validation
        if (!results[tableKey].skipped && !results[tableKey].error) {
          const stagingItems = await scanTable(TABLES[tableKey].staging);
          if (stagingItems) {
            allStagingData[tableKey] = stagingItems;
          }
        }
      } catch (error) {
        console.error(`❌ Failed to validate ${tableKey}:`, error.message);
        results[tableKey] = { error: error.message };
      }
    }
    
    // Validate relationships
    const relationshipIssues = await validateRelationships(allStagingData);
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(60));
    
    let totalIssues = relationshipIssues.length;
    let passedCount = 0;
    let failedCount = 0;
    
    for (const [tableKey, result] of Object.entries(results)) {
      console.log(`\n${tableKey}:`);
      
      if (result.skipped) {
        console.log(`  Status: Skipped (${result.reason})`);
      } else if (result.error) {
        console.log(`  Status: Error - ${result.error}`);
        failedCount++;
      } else {
        console.log(`  Production: ${result.prodCount} items`);
        console.log(`  Staging: ${result.stagingCount} items`);
        
        if (result.missingCount > 0) {
          console.log(`  Missing in staging: ${result.missingCount}`);
        }
        if (result.extraCount > 0) {
          console.log(`  Extra in staging: ${result.extraCount}`);
        }
        
        if (result.issues.length === 0) {
          console.log(`  Status: ✅ PASSED`);
          passedCount++;
        } else {
          console.log(`  Status: ❌ FAILED (${result.issues.length} issues)`);
          failedCount++;
        }
        
        totalIssues += result.issues.length;
      }
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`Tables passed: ${passedCount}`);
    console.log(`Tables failed: ${failedCount}`);
    console.log(`Total issues: ${totalIssues}`);
    
    if (totalIssues === 0) {
      console.log('\n✅ ALL VALIDATIONS PASSED!');
      console.log('Staging data is ready for use.');
    } else {
      console.log('\n❌ VALIDATION FAILED');
      console.log('Please review the issues above before using staging data.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run validation
runValidation();
