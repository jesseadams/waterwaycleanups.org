# Data Migration Scripts

This directory contains scripts to migrate the waterway cleanups system from file-based event management to a database-driven approach.

## Overview

The migration process converts:
- Event markdown files → DynamoDB Events table
- Old RSVP records → Normalized Volunteers and RSVPs tables
- Generates Hugo files from database records

## Prerequisites

1. **Install Dependencies**
   ```bash
   npm install js-yaml
   ```

2. **AWS Credentials**
   The scripts will automatically discover AWS credentials from:
   - AWS CLI profile: `aws configure` or `export AWS_PROFILE=your-profile`
   - Environment variables: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
   - IAM role (if running on EC2/Lambda)
   - AWS SSO profile
   
   No manual credential setup required if you have AWS CLI configured.

3. **DynamoDB Tables**
   Ensure the following tables exist:
   - `events-staging` / `events` (prod)
   - `volunteers-staging` / `volunteers` (prod)
   - `rsvps-staging` / `rsvps` (prod)

## Migration Scripts

### 1. Full Migration (Recommended)

Run the complete migration process:

```bash
# Dry run to preview changes
node scripts/run-full-migration.js --dry-run --environment=staging --verbose

# Run actual migration
node scripts/run-full-migration.js --environment=staging --verbose
```

**Options:**
- `--dry-run`: Preview changes without making them
- `--environment=staging|prod`: Target environment
- `--verbose`: Show detailed output
- `--skip-validation`: Skip data integrity validation

### 2. Individual Scripts

#### Parse Event Markdown Files
```bash
node scripts/data-migration.js --dry-run --environment=staging --verbose
```

Converts event markdown files to database records.

#### Migrate RSVP Data
```bash
node scripts/migrate-rsvp-data.js --dry-run --environment=staging --verbose
```

Migrates old RSVP records to normalized structure.

#### Validate Migration
```bash
node scripts/validate-migration.js --environment=staging --verbose
```

Validates data integrity after migration.

#### Generate Hugo Files
```bash
node scripts/hugo-generator.js --dry-run --environment=staging --verbose
```

Generates Hugo markdown files from database records.

## Migration Process

### Step 1: Parse Event Files
- Reads all `.md` files from `content/en/events/`
- Extracts frontmatter (title, dates, tags, etc.)
- Parses content for location and attendance cap
- Converts to database event records
- Determines event status based on dates

### Step 2: Migrate RSVP Data
- Reads existing RSVP records from `event_rsvps` table
- Creates volunteer records from RSVP data
- Maps old event IDs to new event IDs
- Creates normalized RSVP records
- Calculates volunteer metrics

### Step 3: Validate Data
- Checks required fields and data types
- Validates foreign key relationships
- Verifies business logic constraints
- Compares with original markdown files
- Generates detailed validation report

### Step 4: Generate Hugo Files
- Queries active events from database
- Generates Hugo markdown with proper frontmatter
- Preserves existing custom shortcodes
- Cleans up old event files

## Data Mapping

### Event ID Generation
Event IDs are generated from titles using Hugo's slug rules:
- Convert to lowercase
- Replace spaces with hyphens
- Remove special characters
- Example: "Brooke Road and Thorny Point Road Cleanup" → "brooke-road-and-thorny-point-road-cleanup"

### Event Status
- `active`: Future events
- `completed`: Past events
- `cancelled`: Manually cancelled events
- `archived`: Old completed events

### RSVP Status
- `active`: Confirmed attendance
- `cancelled`: Cancelled by volunteer
- `no_show`: Didn't attend
- `attended`: Confirmed attendance

## Troubleshooting

### Common Issues

1. **AWS Credentials Error**
   ```
   ❌ AWS Credentials: Not available
   ```
   Solution: Configure AWS credentials using one of:
   - `aws configure` (recommended)
   - `export AWS_PROFILE=your-profile`
   - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
   - Use IAM role if running on EC2/Lambda

2. **Table Not Found**
   ```
   ResourceNotFoundException
   ```
   Solution: Ensure DynamoDB tables exist with correct names

3. **Permission Denied**
   ```
   AccessDeniedException
   ```
   Solution: Ensure AWS user has DynamoDB read/write permissions

4. **Missing Dependencies**
   ```
   ❌ Missing dependency: js-yaml
   ```
   Solution: Run `npm install js-yaml`

### Event ID Mapping Issues

If RSVPs reference events that can't be mapped:
1. Check the event ID mapping output
2. Manually verify event titles match expected slugs
3. Update event frontmatter if needed
4. Re-run migration

### Validation Failures

If validation finds issues:
1. Review the validation report
2. Fix data integrity issues
3. Re-run validation
4. Continue with Hugo generation

## File Structure

```
scripts/
├── data-migration.js           # Main migration script
├── migrate-rsvp-data.js       # RSVP-specific migration
├── validate-migration.js      # Data integrity validation
├── hugo-generator.js          # Hugo file generation
├── run-full-migration.js      # Migration orchestrator
└── README-MIGRATION.md        # This file
```

## Safety Features

- **Dry Run Mode**: Preview all changes before applying
- **Conditional Writes**: Prevents overwriting existing records
- **Data Validation**: Comprehensive integrity checks
- **Backup Recommendations**: Always backup before migration
- **Rollback Support**: Original files preserved during migration

## Post-Migration

After successful migration:

1. **Test the System**
   - Verify events display correctly
   - Test RSVP functionality
   - Check volunteer dashboard

2. **Update Deployment**
   - Integrate Hugo generator into CI/CD
   - Update environment variables
   - Test deployment pipeline

3. **Monitor**
   - Watch for any data inconsistencies
   - Monitor application performance
   - Check error logs

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Run validation to identify specific problems
3. Review script output for error details
4. Check AWS CloudWatch logs for Lambda errors