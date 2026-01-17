# Production to Staging Migration

Quick guide for migrating production data to staging for testing.

## Quick Start

```bash
# Preview what will happen (recommended first)
./scripts/test-prod-to-staging-migration.sh --dry-run --verbose

# Run the actual migration
./scripts/test-prod-to-staging-migration.sh
```

## What It Does

1. **Clears staging tables** - Removes all existing staging data
2. **Copies production data** - Migrates all data from prod to staging
3. **Validates migration** - Ensures data integrity and completeness

## Tables Migrated

- `events` → `events-staging`
- `volunteers` → `volunteers-staging`
- `rsvps` → `rsvps-staging`
- `minors` → `minors-staging`
- `volunteer_waivers` → `volunteer_waivers-staging`
- `auth_codes` → `auth_codes-staging`
- `user_sessions` → `user_sessions-staging`

## Options

- `--dry-run` - Preview changes without applying them
- `--skip-clear` - Don't clear staging data first (merge mode)
- `--verbose` - Show detailed output

## Individual Scripts

If you need more control:

```bash
# Just migrate data
node scripts/migrate-prod-to-staging.js --dry-run --verbose

# Just validate staging
node scripts/validate-staging-data.js --verbose --detailed
```

## Prerequisites

- AWS credentials configured (`aws configure` or `AWS_PROFILE`)
- DynamoDB tables must exist in both environments
- Node.js dependencies installed

## Validation Checks

The validation script checks:
- Item counts match between prod and staging
- All production items exist in staging
- No unexpected extra items in staging
- Data integrity (required fields, valid formats)
- Cross-table relationships (RSVPs → Events, RSVPs → Volunteers, etc.)

## Troubleshooting

**AWS Credentials Error**
```bash
aws configure
# or
export AWS_PROFILE=your-profile
```

**Table Not Found**
Ensure DynamoDB tables exist with correct names (check Terraform)

**Validation Failures**
Review the detailed output to identify specific issues
