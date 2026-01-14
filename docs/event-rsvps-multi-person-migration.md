# Event RSVPs Multi-Person Migration Guide

## Overview

This document describes the migration process for updating the `event_rsvps` table to support multi-person RSVPs (volunteers and minors).

## Schema Changes

### Before (Legacy Schema)
```json
{
  "hash_key": "event_id",
  "range_key": "email",
  "attributes": ["event_id", "email"],
  "gsi": ["email-index"]
}
```

### After (Multi-Person Schema)
```json
{
  "hash_key": "event_id",
  "range_key": "attendee_id",
  "attributes": ["event_id", "attendee_id", "email", "guardian_email"],
  "gsi": ["email-index", "guardian-email-index"]
}
```

### New Fields

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `attendee_id` | String | Email for volunteers, minor_id for minors | Yes (sort key) |
| `attendee_type` | String | "volunteer" or "minor" | Yes |
| `guardian_email` | String | Guardian's email (for minor RSVPs only) | No |
| `age` | Number | Minor's age at time of RSVP | No |

### New Global Secondary Index

**guardian-email-index**
- Hash Key: `guardian_email`
- Range Key: `event_id`
- Projection: ALL
- Purpose: Query all RSVPs for a guardian and their minors

## Migration Strategy

The migration uses Terraform's in-place table update capability with DynamoDB's schema flexibility:

1. **Update Schema Definition** - Terraform updates the table schema (adds GSI, changes sort key)
2. **Backfill Existing Records** - Script adds new fields to existing records
3. **Deploy Updated Lambda Functions** - New code handles both old and new record formats
4. **Verify** - Test that all functionality works correctly

## Migration Steps

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js installed (for migration scripts)
- Terraform installed
- Backup of current data (recommended)

### Step 1: Backup Current Data

```bash
# Export current table data
aws dynamodb scan \
  --table-name event_rsvps \
  --output json > event_rsvps_backup_$(date +%Y%m%d).json

# Or use AWS Backup for point-in-time recovery
aws dynamodb update-continuous-backups \
  --table-name event_rsvps \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

### Step 2: Update Terraform Configuration

The schema file `schemas/event-rsvps-table.json` has been updated. Review the changes:

```bash
git diff schemas/event-rsvps-table.json
```

### Step 3: Apply Terraform Changes

```bash
cd terraform

# Preview changes
terraform plan

# Apply changes (this updates the table schema)
terraform apply
```

**Note:** DynamoDB allows adding GSIs and changing sort keys without downtime. The table remains available during the update.

### Step 4: Run Backfill Script (Dry Run)

First, run in dry-run mode to preview changes:

```bash
node scripts/backfill-event-rsvps-attendee-fields.js --dry-run
```

Review the output to ensure it looks correct.

### Step 5: Run Backfill Script (Live)

Apply the backfill:

```bash
node scripts/backfill-event-rsvps-attendee-fields.js
```

This script:
- Scans all existing records
- Adds `attendee_type = "volunteer"` to records missing it
- Adds `attendee_id = email` to records missing it
- Verifies the changes

### Step 6: Deploy Updated Lambda Functions

Deploy the updated Lambda functions that support the new schema:

```bash
cd terraform
terraform apply
```

### Step 7: Verify Migration

Run verification tests:

```bash
# Test querying by email (existing functionality)
aws dynamodb query \
  --table-name event_rsvps \
  --index-name email-index \
  --key-condition-expression "email = :email" \
  --expression-attribute-values '{":email":{"S":"test@example.com"}}'

# Test querying by guardian_email (new functionality)
aws dynamodb query \
  --table-name event_rsvps \
  --index-name guardian-email-index \
  --key-condition-expression "guardian_email = :email" \
  --expression-attribute-values '{":email":{"S":"test@example.com"}}'

# Verify sample records have new fields
aws dynamodb scan \
  --table-name event_rsvps \
  --limit 5
```

### Step 8: Test Application Functionality

1. Test existing single-person RSVP flow
2. Test new multi-person RSVP flow
3. Test RSVP cancellation
4. Test capacity enforcement
5. Test duplicate detection

## Rollback Plan

If issues are discovered:

### Option 1: Restore from Backup

```bash
# Restore from point-in-time backup
aws dynamodb restore-table-to-point-in-time \
  --source-table-name event_rsvps \
  --target-table-name event_rsvps_restored \
  --restore-date-time <timestamp>

# Swap tables (requires application downtime)
# 1. Update Terraform to point to restored table
# 2. Apply Terraform changes
```

### Option 2: Revert Terraform Changes

```bash
cd terraform
git revert <commit-hash>
terraform apply
```

## Backward Compatibility

The migration maintains backward compatibility:

1. **Legacy Records**: Old records work with new code
   - `attendee_id` defaults to `email` if missing
   - `attendee_type` defaults to "volunteer" if missing

2. **Legacy API Requests**: Old API format still works
   - Single-person RSVP requests are converted to multi-person format internally
   - Response format includes all legacy fields

3. **Legacy Queries**: Existing queries continue to work
   - `email-index` GSI is preserved
   - Primary key queries work with `attendee_id = email` for volunteers

## Monitoring

After migration, monitor:

1. **DynamoDB Metrics**
   - Read/Write capacity usage
   - GSI throttling
   - Error rates

2. **Lambda Metrics**
   - Invocation errors
   - Duration
   - Throttles

3. **Application Logs**
   - RSVP submission errors
   - Query failures
   - Validation errors

## Troubleshooting

### Issue: GSI Not Available

**Symptom:** Queries to `guardian-email-index` fail

**Solution:** Wait for GSI to finish creating
```bash
aws dynamodb describe-table --table-name event_rsvps \
  | jq '.Table.GlobalSecondaryIndexes[] | select(.IndexName=="guardian-email-index") | .IndexStatus'
```

### Issue: Records Missing New Fields

**Symptom:** Some records don't have `attendee_type` or `attendee_id`

**Solution:** Re-run backfill script
```bash
node scripts/backfill-event-rsvps-attendee-fields.js
```

### Issue: Duplicate Key Errors

**Symptom:** Cannot create RSVP due to duplicate key

**Solution:** Check if record exists with old key format
```bash
aws dynamodb get-item \
  --table-name event_rsvps \
  --key '{"event_id":{"S":"EVENT_ID"},"attendee_id":{"S":"EMAIL"}}'
```

## Timeline

Estimated migration time:
- Schema update: 5-10 minutes (Terraform apply)
- Backfill: Depends on record count (~1000 records/minute)
- Verification: 10-15 minutes
- Total: 30-60 minutes for typical dataset

## Success Criteria

Migration is successful when:

- [ ] All existing records have `attendee_type` and `attendee_id` fields
- [ ] `guardian-email-index` GSI is ACTIVE
- [ ] Legacy single-person RSVP flow works
- [ ] New multi-person RSVP flow works
- [ ] RSVP queries return correct results
- [ ] No errors in Lambda logs
- [ ] No DynamoDB throttling

## Support

For issues during migration:
1. Check CloudWatch logs for Lambda functions
2. Review DynamoDB table metrics
3. Consult this migration guide
4. Contact development team

## References

- Design Document: `.kiro/specs/multi-person-event-rsvp/design.md`
- Requirements: `.kiro/specs/multi-person-event-rsvp/requirements.md`
- Schema File: `schemas/event-rsvps-table.json`
- Terraform Config: `terraform/event_rsvp.tf`
