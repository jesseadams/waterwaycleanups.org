# Event RSVPs Multi-Person Migration Scripts

This directory contains migration scripts for updating the `event_rsvps` table to support multi-person RSVPs.

## Scripts

### 1. backfill-event-rsvps-attendee-fields.js

**Purpose:** Backfills existing event_rsvps records with new fields after schema update.

**What it does:**
- Scans all records in the `event_rsvps` table
- Adds `attendee_type = "volunteer"` to records missing this field
- Adds `attendee_id = email` to records missing this field
- Verifies the backfill was successful

**Usage:**
```bash
# Dry run (preview changes)
node scripts/backfill-event-rsvps-attendee-fields.js --dry-run

# Live run (apply changes)
node scripts/backfill-event-rsvps-attendee-fields.js

# With custom table suffix
node scripts/backfill-event-rsvps-attendee-fields.js --table-suffix=-dev
```

**Options:**
- `--dry-run` - Preview changes without applying them
- `--table-suffix=SUFFIX` - Specify table name suffix (e.g., `-dev`, `-prod`)

**Environment Variables:**
- `AWS_REGION` - AWS region (default: us-east-1)

**Prerequisites:**
- AWS credentials configured
- Node.js installed
- AWS SDK for JavaScript installed (`npm install`)

**When to run:**
- After Terraform has updated the table schema
- Before deploying updated Lambda functions

### 2. migrate-event-rsvps-multi-person.js

**Purpose:** Full migration script that creates a new table and migrates data.

**What it does:**
1. Creates a new table with updated schema
2. Copies all records from old table to new table
3. Transforms records during copy (adds new fields)
4. Verifies migration
5. Provides instructions for table swap

**Usage:**
```bash
# Dry run (preview changes)
node scripts/migrate-event-rsvps-multi-person.js --dry-run

# Live run (apply changes)
node scripts/migrate-event-rsvps-multi-person.js

# With custom table suffix
node scripts/migrate-event-rsvps-multi-person.js --table-suffix=-dev
```

**Options:**
- `--dry-run` - Preview changes without applying them
- `--table-suffix=SUFFIX` - Specify table name suffix (e.g., `-dev`, `-prod`)

**Environment Variables:**
- `AWS_REGION` - AWS region (default: us-east-1)
- `ENVIRONMENT` - Environment name for tagging (default: development)

**Prerequisites:**
- AWS credentials configured
- Node.js installed
- AWS SDK for JavaScript installed (`npm install`)

**When to run:**
- Alternative to in-place schema update
- When you want a separate migration table
- For testing migration process

**Note:** This script creates a new table (`event_rsvps_new`) and does not automatically swap tables. Manual steps are required to complete the migration.

## Recommended Migration Approach

We recommend using the **in-place update approach** with Terraform:

1. **Update schema** via Terraform (adds GSI, updates sort key)
2. **Run backfill script** to add new fields to existing records
3. **Deploy updated Lambda functions** that support new schema

This approach:
- ✅ No downtime
- ✅ Simpler process
- ✅ Leverages DynamoDB's schema flexibility
- ✅ No table swapping required

## Migration Workflow

### Step-by-Step Process

1. **Backup current data**
   ```bash
   aws dynamodb scan --table-name event_rsvps --output json > backup.json
   ```

2. **Update Terraform configuration**
   ```bash
   cd terraform
   terraform plan
   terraform apply
   ```

3. **Run backfill script (dry run)**
   ```bash
   node scripts/backfill-event-rsvps-attendee-fields.js --dry-run
   ```

4. **Run backfill script (live)**
   ```bash
   node scripts/backfill-event-rsvps-attendee-fields.js
   ```

5. **Verify migration**
   ```bash
   # Check sample records
   aws dynamodb scan --table-name event_rsvps --limit 5
   
   # Test GSI query
   aws dynamodb query \
     --table-name event_rsvps \
     --index-name guardian-email-index \
     --key-condition-expression "guardian_email = :email" \
     --expression-attribute-values '{":email":{"S":"test@example.com"}}'
   ```

6. **Deploy updated Lambda functions**
   ```bash
   cd terraform
   terraform apply
   ```

## Verification

After running migration scripts, verify:

### Check Record Structure
```bash
aws dynamodb get-item \
  --table-name event_rsvps \
  --key '{"event_id":{"S":"test-event"},"attendee_id":{"S":"test@example.com"}}'
```

Expected fields:
- `event_id` (hash key)
- `attendee_id` (range key)
- `attendee_type` (should be "volunteer" for existing records)
- `email`
- `first_name`
- `last_name`
- `created_at`
- Other existing fields

### Check GSI Status
```bash
aws dynamodb describe-table --table-name event_rsvps \
  | jq '.Table.GlobalSecondaryIndexes'
```

Expected GSIs:
- `email-index` (existing)
- `guardian-email-index` (new)

Both should have `IndexStatus: "ACTIVE"`

### Test Queries

**Query by email (existing functionality):**
```bash
aws dynamodb query \
  --table-name event_rsvps \
  --index-name email-index \
  --key-condition-expression "email = :email" \
  --expression-attribute-values '{":email":{"S":"volunteer@example.com"}}'
```

**Query by guardian_email (new functionality):**
```bash
aws dynamodb query \
  --table-name event_rsvps \
  --index-name guardian-email-index \
  --key-condition-expression "guardian_email = :email" \
  --expression-attribute-values '{":email":{"S":"guardian@example.com"}}'
```

## Troubleshooting

### Script fails with "Table not found"

**Cause:** Table name or suffix is incorrect

**Solution:** Check table name and use correct suffix
```bash
aws dynamodb list-tables | grep event_rsvps
node scripts/backfill-event-rsvps-attendee-fields.js --table-suffix=-YOUR-SUFFIX
```

### Script fails with "Access denied"

**Cause:** AWS credentials don't have DynamoDB permissions

**Solution:** Ensure IAM user/role has these permissions:
- `dynamodb:Scan`
- `dynamodb:UpdateItem`
- `dynamodb:GetItem`
- `dynamodb:Query`

### GSI queries fail

**Cause:** GSI is still being created

**Solution:** Wait for GSI to become ACTIVE
```bash
aws dynamodb describe-table --table-name event_rsvps \
  | jq '.Table.GlobalSecondaryIndexes[] | select(.IndexName=="guardian-email-index") | .IndexStatus'
```

### Records missing new fields after backfill

**Cause:** Script may have encountered errors

**Solution:** Re-run the backfill script
```bash
node scripts/backfill-event-rsvps-attendee-fields.js
```

Check CloudWatch logs for errors:
```bash
aws logs tail /aws/lambda/event_rsvp_submit --follow
```

## Performance Considerations

### Backfill Script Performance

- Processes ~1000 records per minute
- Uses batch size of 100 records per scan
- No throttling protection (assumes PAY_PER_REQUEST billing)

For large tables (>10,000 records):
- Consider running during off-peak hours
- Monitor DynamoDB metrics for throttling
- May need to add exponential backoff

### GSI Creation Time

- Small tables (<1000 records): 2-5 minutes
- Medium tables (1000-10000 records): 5-15 minutes
- Large tables (>10000 records): 15+ minutes

## Rollback

If migration fails or causes issues:

### Option 1: Restore from Backup
```bash
# Restore from JSON backup
aws dynamodb batch-write-item --request-items file://backup.json

# Or restore from point-in-time backup
aws dynamodb restore-table-to-point-in-time \
  --source-table-name event_rsvps \
  --target-table-name event_rsvps_restored \
  --restore-date-time <timestamp>
```

### Option 2: Revert Terraform Changes
```bash
cd terraform
git revert <commit-hash>
terraform apply
```

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review DynamoDB table metrics
3. Consult migration guide: `docs/event-rsvps-multi-person-migration.md`
4. Contact development team

## Related Documentation

- [Migration Guide](../docs/event-rsvps-multi-person-migration.md)
- [Design Document](../.kiro/specs/multi-person-event-rsvp/design.md)
- [Requirements](../.kiro/specs/multi-person-event-rsvp/requirements.md)
