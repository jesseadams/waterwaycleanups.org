# RSVP Table Migration Summary

## Issue
The Widewater event page was showing 0 RSVPs when there were actually 3 RSVPs in the database.

## Root Cause
- RSVPs were stored in `rsvps-production` table
- Lambda functions were querying `event_rsvps-production` table
- The two tables were out of sync

## Solution
Renamed `rsvps-production` to `event_rsvps-production` and updated all Terraform references.

## Changes Made

### 1. Database Migration
- Script created: `scripts/rename-rsvps-table.sh`
- Copies all data from `rsvps-production` to `event_rsvps-production`
- Deletes old `rsvps-production` table

### 2. Terraform Updates
All references to `aws_dynamodb_table.rsvps` replaced with `aws_dynamodb_table.event_rsvps`:

- `terraform/event_rsvp.tf` - Updated all Lambda environment variables and IAM policies
- `terraform/minors_management.tf` - Updated Lambda environment variables
- `terraform/auth_system.tf` - Updated IAM policies
- `terraform/database_driven_events.tf` - Commented out duplicate `rsvps` table definition
- `terraform/modules/database-events/main.tf` - Updated references
- `terraform/modules/database-events/outputs.tf` - Updated outputs

### 3. Table Resource
The `event_rsvps` table is now the single source of truth, defined in:
- `terraform/event_rsvp.tf` (resource "aws_dynamodb_table" "event_rsvps")

## Deployment Steps

1. Run the migration script:
   ```bash
   ./scripts/rename-rsvps-table.sh
   ```

2. Apply Terraform changes:
   ```bash
   cd terraform
   terraform plan  # Review changes
   terraform apply # Apply changes
   ```

3. Verify the fix:
   - Visit https://waterwaycleanups.org/events/widewater-state-park-aquia-creek-cleanup-april-2026/
   - Should now show 3 RSVPs instead of 0

## What Won't Break

- All Lambda functions now reference `event_rsvps-production` table
- No duplicate table definitions
- All IAM policies updated to grant access to correct table
- All environment variables point to correct table

## Cleanup

After successful deployment, the old `rsvps-production` table will be deleted by the migration script.
