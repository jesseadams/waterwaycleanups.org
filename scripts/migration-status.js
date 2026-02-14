#!/usr/bin/env node

/**
 * Migration Status Script
 * 
 * Shows the current status of the data migration process
 * and provides guidance on next steps.
 * 
 * Usage: node scripts/migration-status.js [--environment staging|prod]
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
}

// Table names with environment suffix
const suffix = environment === 'prod' ? '-production' : `-${environment}`;
const EVENTS_TABLE = `events${suffix}`;
const VOLUNTEERS_TABLE = `volunteers${suffix}`;
const RSVPS_TABLE = `rsvps${suffix}`;
const OLD_EVENT_RSVPS_TABLE = `event_rsvps${suffix}`;

console.log(`📊 Migration Status Report`);
console.log(`Environment: ${environment.toUpperCase()}`);
console.log('');

// Configure AWS - will use default credential chain (profile, IAM role, env vars)
AWS.config.update({ 
  region: process.env.AWS_REGION || 'us-east-1',
  // Let AWS SDK handle credential discovery automatically
});
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Check if table exists and get record count
 */
async function getTableStatus(tableName) {
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
 * Count markdown files
 */
function countMarkdownFiles() {
  const eventsDir = path.join(__dirname, '..', 'content', 'en', 'events');
  
  if (!fs.existsSync(eventsDir)) {
    return 0;
  }
  
  return fs.readdirSync(eventsDir)
    .filter(file => file.endsWith('.md'))
    .length;
}

/**
 * Check AWS credentials by attempting to get caller identity
 */
async function checkCredentials() {
  try {
    const sts = new AWS.STS();
    await sts.getCallerIdentity().promise();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main status check
 */
async function checkMigrationStatus() {
  try {
    // Check prerequisites
    console.log('🔍 Prerequisites:');
    
    const hasCredentials = await checkCredentials();
    console.log(`   AWS Credentials: ${hasCredentials ? '✅ Available' : '❌ Not available'}`);
    
    try {
      require('js-yaml');
      console.log('   js-yaml dependency: ✅ Installed');
    } catch (error) {
      console.log('   js-yaml dependency: ❌ Missing');
    }
    
    console.log('');
    
    if (!hasCredentials) {
      console.log('⚠️  Cannot check database status without AWS credentials');
      console.log('Configure AWS credentials using:');
      console.log('- AWS CLI: aws configure');
      console.log('- AWS Profile: export AWS_PROFILE=your-profile');
      console.log('- Environment variables: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
      console.log('- IAM role (if running on EC2/Lambda)');
      console.log('');
      console.log('📋 Next Steps:');
      console.log('1. Set up AWS credentials');
      console.log('2. Run: npm run migrate:dry-run');
      return;
    }
    
    // Check source data
    console.log('📁 Source Data:');
    const markdownCount = countMarkdownFiles();
    console.log(`   Event markdown files: ${markdownCount}`);
    
    // Check database tables
    console.log('');
    console.log('🗄️  Database Tables:');
    
    const eventsStatus = await getTableStatus(EVENTS_TABLE);
    console.log(`   ${EVENTS_TABLE}: ${eventsStatus.exists ? `✅ ${eventsStatus.count} records` : '❌ Not found'}`);
    
    const volunteersStatus = await getTableStatus(VOLUNTEERS_TABLE);
    console.log(`   ${VOLUNTEERS_TABLE}: ${volunteersStatus.exists ? `✅ ${volunteersStatus.count} records` : '❌ Not found'}`);
    
    const rsvpsStatus = await getTableStatus(RSVPS_TABLE);
    console.log(`   ${RSVPS_TABLE}: ${rsvpsStatus.exists ? `✅ ${rsvpsStatus.count} records` : '❌ Not found'}`);
    
    const oldRsvpsStatus = await getTableStatus(OLD_EVENT_RSVPS_TABLE);
    console.log(`   ${OLD_EVENT_RSVPS_TABLE}: ${oldRsvpsStatus.exists ? `✅ ${oldRsvpsStatus.count} records` : '❌ Not found'}`);
    
    console.log('');
    
    // Determine migration status
    const hasMigratedEvents = eventsStatus.exists && eventsStatus.count > 0;
    const hasMigratedVolunteers = volunteersStatus.exists && volunteersStatus.count > 0;
    const hasMigratedRsvps = rsvpsStatus.exists && rsvpsStatus.count > 0;
    const hasOldRsvps = oldRsvpsStatus.exists && oldRsvpsStatus.count > 0;
    
    console.log('📈 Migration Status:');
    
    if (!hasMigratedEvents && !hasMigratedVolunteers && !hasMigratedRsvps) {
      console.log('   Status: ❌ NOT STARTED');
      console.log('   No migrated data found in database');
      console.log('');
      console.log('📋 Next Steps:');
      console.log('1. Run dry run to preview migration:');
      console.log('   npm run migrate:dry-run');
      console.log('2. Run actual migration:');
      console.log(`   npm run migrate${environment === 'prod' ? ':prod' : ''}`);
    } else if (hasMigratedEvents && !hasMigratedVolunteers && !hasMigratedRsvps && hasOldRsvps) {
      console.log('   Status: 🔄 PARTIALLY COMPLETE');
      console.log('   Events migrated, but RSVPs and volunteers pending');
      console.log('');
      console.log('📋 Next Steps:');
      console.log('1. Migrate RSVP data:');
      console.log(`   npm run migrate:rsvps${environment === 'prod' ? ':prod' : ''}`);
      console.log('2. Validate migration:');
      console.log(`   npm run migrate:validate${environment === 'prod' ? ':prod' : ''}`);
    } else if (hasMigratedEvents && hasMigratedVolunteers && hasMigratedRsvps) {
      console.log('   Status: ✅ COMPLETE');
      console.log('   All data has been migrated to database');
      
      // Check if counts make sense
      const expectedEvents = markdownCount;
      const actualEvents = eventsStatus.count;
      
      if (actualEvents < expectedEvents) {
        console.log(`   ⚠️  Event count mismatch: ${actualEvents} in DB vs ${expectedEvents} markdown files`);
      }
      
      console.log('');
      console.log('📋 Recommended Actions:');
      console.log('1. Validate data integrity:');
      console.log(`   npm run migrate:validate${environment === 'prod' ? ':prod' : ''}`);
      console.log('2. Generate Hugo files from database:');
      console.log(`   npm run generate-hugo${environment === 'prod' ? ':prod' : ''}`);
      console.log('3. Test the application with new database structure');
    } else {
      console.log('   Status: ⚠️  INCONSISTENT');
      console.log('   Some data migrated but state is unclear');
      console.log('');
      console.log('📋 Recommended Actions:');
      console.log('1. Run validation to identify issues:');
      console.log(`   npm run migrate:validate${environment === 'prod' ? ':prod' : ''}`);
      console.log('2. Consider re-running migration if needed');
    }
    
    // Show data summary
    console.log('');
    console.log('📊 Data Summary:');
    console.log(`   Source markdown files: ${markdownCount}`);
    console.log(`   Events in database: ${eventsStatus.count}`);
    console.log(`   Volunteers in database: ${volunteersStatus.count}`);
    console.log(`   RSVPs in database: ${rsvpsStatus.count}`);
    if (hasOldRsvps) {
      console.log(`   Old RSVP records: ${oldRsvpsStatus.count}`);
    }
    
    console.log('');
    console.log('🔧 Available Commands:');
    console.log('   npm run migrate:dry-run          # Preview migration');
    console.log('   npm run migrate                  # Run migration (staging)');
    console.log('   npm run migrate:prod             # Run migration (production)');
    console.log('   npm run migrate:validate         # Validate data integrity');
    console.log('   npm run generate-hugo            # Generate Hugo files from DB');
    console.log('   node scripts/migration-status.js # Show this status report');
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error.message);
    
    if (error.code === 'CredentialsError' || error.code === 'UnknownEndpoint') {
      console.log('');
      console.log('💡 This might be an AWS credentials or configuration issue.');
      console.log('Check your AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION.');
    }
    
    process.exit(1);
  }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Migration Status Script

Usage: node scripts/migration-status.js [options]

Options:
  --environment ENV       Target environment (staging|prod) [default: staging]
  --help, -h              Show this help message

This script checks the current status of the data migration process
and provides guidance on next steps.

Examples:
  node scripts/migration-status.js                    # Check staging status
  node scripts/migration-status.js --environment=prod # Check production status
`);
  process.exit(0);
}

// Run status check
checkMigrationStatus();