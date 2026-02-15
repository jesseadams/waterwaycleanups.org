#!/usr/bin/env node

/**
 * Migration Check Script
 * 
 * Checks if database migration is needed and exits with appropriate code:
 * - Exit code 0: Migration not needed
 * - Exit code 1: Migration needed
 * - Exit code 2: Error checking status
 * 
 * Usage: node scripts/check-migration-needed.js [--environment staging|prod] [--verbose]
 */

require('dotenv').config();
const AWS = require('aws-sdk');

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(2);
}

// Configure AWS
AWS.config.update({ 
  region: process.env.AWS_REGION || 'us-east-1'
});
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Table names with environment suffix
const suffix = environment === 'prod' ? '-production' : `-${environment}`;
const EVENTS_TABLE = `events${suffix}`;
const VOLUNTEERS_TABLE = `volunteers${suffix}`;
const RSVPS_TABLE = `event_rsvps${suffix}`;
const OLD_EVENT_RSVPS_TABLE = `event_rsvps${suffix}`;

/**
 * Logging utility
 */
function log(message, force = false) {
  if (isVerbose || force) {
    console.log(message);
  }
}

/**
 * Check if a DynamoDB table exists and get basic info
 */
async function checkTableExists(tableName) {
  try {
    const result = await dynamodb.scan({
      TableName: tableName,
      Select: 'COUNT'
    }).promise();
    
    return {
      exists: true,
      count: result.Count
    };
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      return { exists: false, count: 0 };
    }
    throw error;
  }
}

/**
 * Check if migration is needed
 */
async function checkMigrationNeeded() {
  try {
    log(`🔍 Checking migration status for ${environment}...`, true);
    
    // Check new tables
    const eventsStatus = await checkTableExists(EVENTS_TABLE);
    const volunteersStatus = await checkTableExists(VOLUNTEERS_TABLE);
    const rsvpsStatus = await checkTableExists(RSVPS_TABLE);
    
    // Check old table
    const oldRsvpsStatus = await checkTableExists(OLD_EVENT_RSVPS_TABLE);
    
    log(`Events table: ${eventsStatus.exists ? `${eventsStatus.count} records` : 'not found'}`);
    log(`Volunteers table: ${volunteersStatus.exists ? `${volunteersStatus.count} records` : 'not found'}`);
    log(`RSVPs table: ${rsvpsStatus.exists ? `${rsvpsStatus.count} records` : 'not found'}`);
    log(`Old RSVPs table: ${oldRsvpsStatus.exists ? `${oldRsvpsStatus.count} records` : 'not found'}`);
    
    // Determine if migration is needed
    const hasNewData = eventsStatus.exists && eventsStatus.count > 0 &&
                      volunteersStatus.exists && volunteersStatus.count > 0 &&
                      rsvpsStatus.exists && rsvpsStatus.count > 0;
    
    const hasOldData = oldRsvpsStatus.exists && oldRsvpsStatus.count > 0;
    
    if (!hasNewData && !hasOldData) {
      log('📝 No data found in any tables - fresh deployment, migration needed', true);
      return true;
    }
    
    if (!hasNewData && hasOldData) {
      log('🔄 Old data exists but new tables are empty - migration needed', true);
      return true;
    }
    
    if (hasNewData && !hasOldData) {
      log('✅ New data exists and no old data - migration already complete', true);
      return false;
    }
    
    if (hasNewData && hasOldData) {
      // Both exist - check if new data is significantly less than old data
      const newDataCount = eventsStatus.count + volunteersStatus.count + rsvpsStatus.count;
      const oldDataCount = oldRsvpsStatus.count;
      
      if (newDataCount < oldDataCount * 0.5) {
        log('⚠️  New data exists but seems incomplete compared to old data - migration may be needed', true);
        return true;
      } else {
        log('✅ New data exists and appears complete - migration not needed', true);
        return false;
      }
    }
    
    // Default to migration needed if unclear
    log('❓ Migration status unclear - defaulting to migration needed', true);
    return true;
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error.message);
    
    if (error.code === 'CredentialsError' || error.code === 'UnknownEndpoint') {
      console.error('🔧 Check AWS credentials and region configuration');
    } else if (error.code === 'AccessDenied') {
      console.error('🔧 Check AWS permissions for DynamoDB access');
    }
    
    process.exit(2);
  }
}

/**
 * Main function
 */
async function main() {
  const migrationNeeded = await checkMigrationNeeded();
  
  if (migrationNeeded) {
    log('🔄 Migration needed', true);
    process.exit(1);
  } else {
    log('✅ Migration not needed', true);
    process.exit(0);
  }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Migration Check Script

Usage: node scripts/check-migration-needed.js [options]

Options:
  --environment ENV       Target environment (staging|prod) [default: staging]
  --verbose               Show detailed output
  --help, -h              Show this help message

Exit Codes:
  0                       Migration not needed
  1                       Migration needed
  2                       Error checking status

Environment Variables:
  AWS_REGION              AWS region [default: us-east-1]
  AWS_PROFILE             AWS profile to use (optional)

This script checks if database migration is needed by comparing
the state of old and new database tables.

Examples:
  node scripts/check-migration-needed.js                    # Check staging
  node scripts/check-migration-needed.js --environment=prod # Check production
  node scripts/check-migration-needed.js --verbose          # Detailed output
`);
  process.exit(0);
}

// Run the check
main();