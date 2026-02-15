#!/usr/bin/env node

/**
 * Database-Aware Deployment Script
 * 
 * This script handles the complete deployment process for the database-driven events system:
 * 1. Verify database tables exist
 * 2. Check migration status
 * 3. Run migrations if needed
 * 4. Generate Hugo files from database
 * 5. Validate generated content
 * 
 * Usage: node scripts/deploy-with-database.js [--environment staging|prod] [--force-migration] [--skip-hugo] [--verbose]
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const forceMigration = args.includes('--force-migration');
const skipHugo = args.includes('--skip-hugo');
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
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

console.log(`🚀 Database-Aware Deployment`);
console.log(`Environment: ${environment.toUpperCase()}`);
console.log(`Force Migration: ${forceMigration ? 'YES' : 'NO'}`);
console.log(`Skip Hugo: ${skipHugo ? 'YES' : 'NO'}`);
console.log(`Verbose: ${isVerbose ? 'ON' : 'OFF'}`);
console.log('');

/**
 * Logging utility
 */
function log(message, force = false) {
  if (isVerbose || force) {
    console.log(message);
  }
}

/**
 * Run a script and return a promise
 */
function runScript(scriptPath, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const scriptName = path.basename(scriptPath);
    log(`🔄 Running ${scriptName}...`, true);
    
    const child = spawn('node', [scriptPath, ...scriptArgs], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ ${scriptName} completed successfully`, true);
        resolve();
      } else {
        console.error(`❌ ${scriptName} failed with exit code ${code}`);
        reject(new Error(`${scriptName} failed`));
      }
    });
    
    child.on('error', (error) => {
      console.error(`❌ Failed to start ${scriptName}:`, error.message);
      reject(error);
    });
  });
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
 * Verify all required database tables exist
 */
async function verifyDatabaseTables() {
  log('🔍 Verifying database tables...', true);
  
  const tables = [
    { name: EVENTS_TABLE, type: 'Events' },
    { name: VOLUNTEERS_TABLE, type: 'Volunteers' },
    { name: RSVPS_TABLE, type: 'RSVPs' }
  ];
  
  const results = {};
  
  for (const table of tables) {
    try {
      const status = await checkTableExists(table.name);
      results[table.type.toLowerCase()] = status;
      
      if (status.exists) {
        log(`  ✅ ${table.type}: ${table.name} (${status.count} records)`);
      } else {
        log(`  ❌ ${table.type}: ${table.name} (not found)`);
      }
    } catch (error) {
      console.error(`  ❌ Error checking ${table.type} table:`, error.message);
      results[table.type.toLowerCase()] = { exists: false, count: 0, error: error.message };
    }
  }
  
  const allTablesExist = Object.values(results).every(r => r.exists);
  
  if (!allTablesExist) {
    console.error('❌ Required database tables are missing!');
    console.log('');
    console.log('📋 Required Actions:');
    console.log('1. Ensure Terraform has been applied to create database tables');
    console.log('2. Check AWS credentials and permissions');
    console.log('3. Verify the correct environment is being used');
    throw new Error('Database tables missing');
  }
  
  log('✅ All database tables verified', true);
  return results;
}

/**
 * Check if migration is needed
 */
async function checkMigrationStatus(tableStatus) {
  log('📊 Checking migration status...', true);
  
  const eventsCount = tableStatus.events.count;
  const volunteersCount = tableStatus.volunteers.count;
  const rsvpsCount = tableStatus.rsvps.count;
  
  // If force migration is requested, always migrate
  if (forceMigration) {
    log('🔄 Force migration requested', true);
    return true;
  }
  
  // If all tables are empty, migration is needed
  if (eventsCount === 0 && volunteersCount === 0 && rsvpsCount === 0) {
    log('📝 No data found, migration needed', true);
    return true;
  }
  
  // If events exist but no volunteers/RSVPs, partial migration may be needed
  if (eventsCount > 0 && (volunteersCount === 0 || rsvpsCount === 0)) {
    log('⚠️  Partial data found, migration may be needed', true);
    return true;
  }
  
  // If all tables have data, assume migration is complete
  if (eventsCount > 0 && volunteersCount > 0 && rsvpsCount > 0) {
    log('✅ Data found in all tables, skipping migration', true);
    return false;
  }
  
  // Default to needing migration if status is unclear
  log('❓ Migration status unclear, running migration to be safe', true);
  return true;
}

/**
 * Run database migration
 */
async function runDatabaseMigration() {
  log('🔄 Running database migration...', true);
  
  const scriptArgs = [
    `--environment=${environment}`,
    '--skip-validation' // Skip validation in deployment for speed
  ];
  
  if (isVerbose) {
    scriptArgs.push('--verbose');
  }
  
  try {
    await runScript(path.join(__dirname, 'run-full-migration.js'), scriptArgs);
    log('✅ Database migration completed', true);
  } catch (error) {
    console.error('❌ Database migration failed:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check AWS credentials and permissions');
    console.log('2. Verify database tables exist and are accessible');
    console.log('3. Check for data conflicts or validation errors');
    console.log('4. Review migration logs above for specific errors');
    throw error;
  }
}

/**
 * Generate Hugo files from database
 */
async function generateHugoFiles() {
  if (skipHugo) {
    log('⏭️  Skipping Hugo generation as requested', true);
    return;
  }
  
  log('📄 Generating Hugo files from database...', true);
  
  const scriptArgs = [`--environment=${environment}`];
  
  if (isVerbose) {
    scriptArgs.push('--verbose');
  }
  
  try {
    await runScript(path.join(__dirname, 'hugo-generator.js'), scriptArgs);
    log('✅ Hugo files generated successfully', true);
  } catch (error) {
    console.error('❌ Hugo generation failed:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check database connectivity and permissions');
    console.log('2. Verify events exist in the database');
    console.log('3. Check file system permissions for content directory');
    console.log('4. Review Hugo generator logs above for specific errors');
    throw error;
  }
}

/**
 * Validate generated content
 */
async function validateGeneratedContent() {
  log('🔍 Validating generated content...', true);
  
  const fs = require('fs');
  const contentDir = path.join(__dirname, '..', 'content', 'en', 'events');
  
  if (!fs.existsSync(contentDir)) {
    throw new Error(`Content directory not found: ${contentDir}`);
  }
  
  const markdownFiles = fs.readdirSync(contentDir)
    .filter(file => file.endsWith('.md'));
  
  if (markdownFiles.length === 0) {
    console.warn('⚠️  No markdown files found in events directory');
    console.log('This may be normal if no active events exist in the database');
  } else {
    log(`✅ Found ${markdownFiles.length} generated event files`, true);
  }
  
  // Basic validation - check that files have frontmatter
  let validFiles = 0;
  for (const file of markdownFiles.slice(0, 3)) { // Check first 3 files
    const filePath = path.join(contentDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (content.startsWith('---') && content.includes('title:')) {
      validFiles++;
    }
  }
  
  if (validFiles > 0) {
    log(`✅ Generated files appear valid (checked ${validFiles} files)`, true);
  } else if (markdownFiles.length > 0) {
    console.warn('⚠️  Generated files may have formatting issues');
  }
}

/**
 * Main deployment function
 */
async function runDeployment() {
  try {
    console.log('🚀 Starting database-aware deployment...\n');
    
    // Step 1: Verify database tables exist
    console.log('📋 Step 1: Verifying database infrastructure...');
    const tableStatus = await verifyDatabaseTables();
    console.log('');
    
    // Step 2: Check if migration is needed
    console.log('📊 Step 2: Checking migration status...');
    const migrationNeeded = await checkMigrationStatus(tableStatus);
    console.log('');
    
    // Step 3: Run migration if needed
    if (migrationNeeded) {
      console.log('🔄 Step 3: Running database migration...');
      await runDatabaseMigration();
      console.log('');
    } else {
      console.log('⏭️  Step 3: Skipping migration (not needed)');
      console.log('');
    }
    
    // Step 4: Generate Hugo files from database
    console.log('📄 Step 4: Generating Hugo files...');
    await generateHugoFiles();
    console.log('');
    
    // Step 5: Validate generated content
    console.log('🔍 Step 5: Validating generated content...');
    await validateGeneratedContent();
    console.log('');
    
    console.log('✅ Database-aware deployment completed successfully!');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('1. Hugo build process will use the generated markdown files');
    console.log('2. Static site will be deployed with current database content');
    console.log('3. Monitor the deployment for any issues');
    console.log('4. Verify events display correctly on the website');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    console.log('');
    console.log('🔧 General Troubleshooting:');
    console.log('1. Check AWS credentials and permissions');
    console.log('2. Verify Terraform infrastructure is deployed');
    console.log('3. Ensure database tables exist and are accessible');
    console.log('4. Check network connectivity to AWS services');
    console.log('5. Review error details above for specific issues');
    
    process.exit(1);
  }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Database-Aware Deployment Script

Usage: node scripts/deploy-with-database.js [options]

Options:
  --environment ENV       Target environment (staging|prod) [default: staging]
  --force-migration       Force database migration even if data exists
  --skip-hugo             Skip Hugo file generation step
  --verbose               Show detailed output
  --help, -h              Show this help message

Environment Variables:
  AWS_REGION              AWS region [default: us-east-1]
  AWS_PROFILE             AWS profile to use (optional)

This script handles the complete deployment process for the database-driven events system:
1. Verifies database tables exist
2. Checks migration status
3. Runs migrations if needed
4. Generates Hugo files from database
5. Validates generated content

Examples:
  node scripts/deploy-with-database.js                           # Deploy staging
  node scripts/deploy-with-database.js --environment=prod        # Deploy production
  node scripts/deploy-with-database.js --force-migration         # Force migration
  node scripts/deploy-with-database.js --skip-hugo --verbose     # Skip Hugo, verbose output
`);
  process.exit(0);
}

// Run the deployment
runDeployment();