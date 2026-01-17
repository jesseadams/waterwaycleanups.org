# Production to Staging Migration - Ready to Use

## What Was Created

Four scripts for complete data migration:

1. **`populate-events-from-markdown.js`** - Parses event markdown files and populates events table
2. **`migrate-prod-to-staging.js`** - Core migration script for production data
3. **`validate-staging-data.js`** - Validation script  
4. **`test-prod-to-staging-migration.sh`** - Orchestration wrapper that runs everything

## Quick Start

```bash
# Preview the migration (safe, no changes)
./scripts/test-prod-to-staging-migration.sh --dry-run --verbose

# Run the actual migration
./scripts/test-prod-to-staging-migration.sh
```

## What It Does

### Step 1: Populate Events from Markdown
Parses all event markdown files from `content/en/events/` and creates event records in the staging events table.

### Step 2: Copy Production → Staging
Migrates all data from production tables to staging tables:
- `event_rsvps` → `event_rsvps-staging` (legacy RSVP table)
- `volunteer_waivers` → `volunteer_waivers-staging`
- Other tables as they become available

### Step 3: Validate
Performs comprehensive validation:
- Count verification
- Missing/extra items detection
- Data integrity checks
- Cross-table relationship validation

## Test Results

Dry run completed successfully:
- ✅ Found 10 events in markdown files
- ✅ Found 54 RSVPs in production (legacy table)
- ✅ Found 50 volunteer waivers in production
- ✅ Would populate 10 events in staging
- ✅ Would migrate 104 items total

## Usage Options

```bash
# Dry run (preview only)
./scripts/test-prod-to-staging-migration.sh --dry-run

# Skip clearing staging (merge mode)
./scripts/test-prod-to-staging-migration.sh --skip-clear

# Verbose output
./scripts/test-prod-to-staging-migration.sh --verbose

# Combine options
./scripts/test-prod-to-staging-migration.sh --dry-run --verbose
```

## Individual Scripts

For more control, run scripts separately:

```bash
# Just populate events
node scripts/populate-events-from-markdown.js --environment=staging --dry-run

# Just migrate production data
node scripts/migrate-prod-to-staging.js --dry-run --verbose

# Just validate
node scripts/validate-staging-data.js --verbose --detailed
```

## Prerequisites

- AWS credentials configured
- DynamoDB tables exist in both environments
- Node.js and dependencies installed (including `js-yaml`)

## Next Steps

1. Run the migration: `./scripts/test-prod-to-staging-migration.sh`
2. Test your application against staging
3. Verify all functionality works
4. Check staging URLs in `.env.development`

## Documentation

See `scripts/README-PROD-TO-STAGING.md` for detailed documentation.
