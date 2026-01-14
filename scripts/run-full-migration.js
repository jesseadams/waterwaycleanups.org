#!/usr/bin/env node

/**
 * Full Migration Orchestrator
 * 
 * Runs the complete data migration process in the correct order:
 * 1. Parse and migrate event markdown files
 * 2. Migrate RSVP data to normalized structure
 * 3. Validate data integrity
 * 4. Generate Hugo files from database
 * 
 * Usage: node scripts/run-full-migration.js [--dry-run] [--environment staging|prod] [--verbose] [--skip-validation]
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');
const skipValidation = args.includes('--skip-validation');
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
}

console.log(`🚀 Full Data Migration Orchestrator`);
console.log(`Environment: ${environment}`);
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
console.log(`Verbose: ${isVerbose ? 'ON' : 'OFF'}`);
console.log(`Validation: ${skipValidation ? 'SKIPPED' : 'ENABLED'}`);
console.log('');

/**
 * Run a script and return a promise
 */
function runScript(scriptPath, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const scriptName = path.basename(scriptPath);
    console.log(`🔄 Running ${scriptName}...`);
    
    const child = spawn('node', [scriptPath, ...scriptArgs], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptName} completed successfully\n`);
        resolve();
      } else {
        console.error(`❌ ${scriptName} failed with exit code ${code}\n`);
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
 * Build script arguments based on command line options
 */
function buildScriptArgs() {
  const scriptArgs = [`--environment=${environment}`];
  
  if (isDryRun) {
    scriptArgs.push('--dry-run');
  }
  
  if (isVerbose) {
    scriptArgs.push('--verbose');
  }
  
  return scriptArgs;
}

/**
 * Check if required dependencies are installed
 */
function checkDependencies() {
  console.log('🔍 Checking dependencies...');
  
  try {
    require('js-yaml');
    console.log('✅ js-yaml dependency found');
  } catch (error) {
    console.error('❌ Missing dependency: js-yaml');
    console.log('Install with: npm install js-yaml');
    process.exit(1);
  }
  
  // Check AWS credentials - AWS SDK will automatically discover credentials
  // from AWS profile, IAM role, or environment variables
  console.log('✅ AWS SDK will use default credential chain (profile, IAM role, or env vars)');
  console.log('');
}

/**
 * Display migration plan
 */
function displayMigrationPlan() {
  console.log('📋 Migration Plan:');
  console.log('');
  console.log('1. 📁 Parse Event Markdown Files');
  console.log('   - Read all event markdown files from content/en/events/');
  console.log('   - Extract frontmatter and content');
  console.log('   - Convert to database event records');
  console.log('   - Write events to DynamoDB');
  console.log('');
  console.log('2. 📊 Migrate RSVP Data');
  console.log('   - Read existing RSVP records from old table');
  console.log('   - Create volunteer records from RSVP data');
  console.log('   - Create normalized RSVP records');
  console.log('   - Map old event IDs to new event IDs');
  console.log('   - Write volunteers and RSVPs to DynamoDB');
  console.log('');
  if (!skipValidation) {
    console.log('3. 🔍 Validate Data Integrity');
    console.log('   - Check all records for required fields');
    console.log('   - Validate foreign key relationships');
    console.log('   - Check business logic constraints');
    console.log('   - Compare with original markdown files');
    console.log('   - Generate validation report');
    console.log('');
  }
  console.log(`${skipValidation ? '3' : '4'}. 📄 Generate Hugo Files`);
  console.log('   - Query active events from database');
  console.log('   - Generate Hugo markdown files with frontmatter');
  console.log('   - Preserve existing custom shortcodes');
  console.log('   - Clean up old event files');
  console.log('');
  
  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE: No actual changes will be made');
    console.log('');
  }
}

/**
 * Confirm migration with user (unless dry run)
 */
function confirmMigration() {
  if (isDryRun) {
    return Promise.resolve(true);
  }
  
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question('❓ Proceed with migration? This will modify your database. (y/N): ', (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Main migration orchestrator
 */
async function runFullMigration() {
  try {
    // Check dependencies
    checkDependencies();
    
    // Display migration plan
    displayMigrationPlan();
    
    // Confirm migration (unless dry run)
    const confirmed = await confirmMigration();
    if (!confirmed) {
      console.log('❌ Migration cancelled by user');
      process.exit(0);
    }
    
    console.log('🚀 Starting full migration process...\n');
    
    const scriptArgs = buildScriptArgs();
    const scriptsDir = path.join(__dirname);
    
    // Step 1: Run main data migration (events + RSVPs)
    await runScript(path.join(scriptsDir, 'data-migration.js'), scriptArgs);
    
    // Step 2: Run RSVP-specific migration (in case main migration didn't handle all cases)
    console.log('🔄 Running additional RSVP migration...');
    try {
      await runScript(path.join(scriptsDir, 'migrate-rsvp-data.js'), scriptArgs);
    } catch (error) {
      console.log('⚠️  RSVP migration had issues, but continuing...');
    }
    
    // Step 3: Validate data integrity (unless skipped)
    if (!skipValidation) {
      console.log('🔄 Running data validation...');
      try {
        await runScript(path.join(scriptsDir, 'validate-migration.js'), [
          `--environment=${environment}`,
          ...(isVerbose ? ['--verbose'] : [])
        ]);
      } catch (error) {
        console.log('⚠️  Validation found issues, but migration data is available');
        console.log('   Review validation report and fix issues as needed');
      }
    }
    
    // Step 4: Generate Hugo files from database
    if (!isDryRun) {
      console.log('🔄 Generating Hugo files from database...');
      try {
        await runScript(path.join(scriptsDir, 'hugo-generator.js'), [
          `--environment=${environment}`,
          ...(isVerbose ? ['--verbose'] : [])
        ]);
      } catch (error) {
        console.log('⚠️  Hugo generation had issues, but database migration is complete');
      }
    } else {
      console.log('⏭️  Skipping Hugo generation in dry run mode');
    }
    
    // Migration complete
    console.log('🎉 Full migration process completed!');
    console.log('');
    
    if (isDryRun) {
      console.log('📋 Next Steps (Dry Run):');
      console.log('1. Review the dry run output above');
      console.log('2. Fix any issues identified');
      console.log('3. Run the migration for real:');
      console.log(`   node scripts/run-full-migration.js --environment=${environment}`);
    } else {
      console.log('📋 Next Steps:');
      console.log('1. Review the migration results above');
      console.log('2. Test your application with the new database structure');
      console.log('3. Update your deployment pipeline to use the Hugo generator');
      console.log('4. Monitor the system for any issues');
      
      if (!skipValidation) {
        console.log('5. Address any validation issues if found');
      }
    }
    
    console.log('');
    console.log('📚 Additional Resources:');
    console.log('- Run validation anytime: node scripts/validate-migration.js');
    console.log('- Generate Hugo files: node scripts/hugo-generator.js');
    console.log('- Check specific RSVP issues: node scripts/migrate-rsvp-data.js');
    
  } catch (error) {
    console.error('❌ Full migration failed:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check AWS credentials and permissions');
    console.log('2. Ensure DynamoDB tables exist');
    console.log('3. Verify network connectivity');
    console.log('4. Run individual scripts to isolate issues');
    console.log('5. Check the error details above');
    
    process.exit(1);
  }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Full Migration Orchestrator

Usage: node scripts/run-full-migration.js [options]

Options:
  --dry-run               Show what would be migrated without making changes
  --verbose               Show detailed output from all scripts
  --environment ENV       Target environment (staging|prod) [default: staging]
  --skip-validation       Skip data integrity validation step
  --help, -h              Show this help message

Environment Variables:
  AWS_ACCESS_KEY_ID       AWS access key (required)
  AWS_SECRET_ACCESS_KEY   AWS secret key (required)
  AWS_REGION              AWS region [default: us-east-1]

This orchestrator runs the complete migration process:
1. Parse event markdown files and create database records
2. Migrate RSVP data to normalized structure
3. Validate data integrity (unless --skip-validation)
4. Generate Hugo files from database (unless --dry-run)

Examples:
  node scripts/run-full-migration.js --dry-run              # Preview migration
  node scripts/run-full-migration.js --verbose              # Run with detailed output
  node scripts/run-full-migration.js -e prod                # Run for production
  node scripts/run-full-migration.js --skip-validation      # Skip validation step
`);
  process.exit(0);
}

// Run the full migration
runFullMigration();