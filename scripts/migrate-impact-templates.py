#!/usr/bin/env python3
"""
Migration script for impact_templates table.

Adds a `version` sort key to the table by:
1. Renaming the existing table (backup)
2. Letting Terraform create the new table with the composite key
3. Migrating data from the old table to the new one

Usage:
  # Step 1: Rename old table (run before terraform apply)
  python3 scripts/migrate-impact-templates.py rename --env staging

  # Step 2: Run terraform apply to create the new table
  # cd terraform && terraform workspace select staging && terraform apply

  # Step 3: Migrate data from old table to new
  python3 scripts/migrate-impact-templates.py migrate --env staging

  # Step 4: (Optional) Delete the old renamed table after verifying
  python3 scripts/migrate-impact-templates.py cleanup --env staging
"""

import argparse
import boto3
import re
import time
from decimal import Decimal

def get_table_names(env):
    suffix = '-staging' if env == 'staging' else '-production'
    current = f'impact_templates{suffix}'
    backup = f'impact_templates_old{suffix}'
    return current, backup


def rename_table(env):
    """Rename the existing table by creating a backup copy via AWS DynamoDB export/import isn't
    possible directly. Instead we'll just note the old table name — Terraform will create the new one
    and we migrate data in step 3. We rename by updating the table's tag only (DynamoDB doesn't support rename).
    
    Actually, DynamoDB doesn't support renaming tables. The approach is:
    1. Terraform will try to destroy and recreate the table (since key schema changed)
    2. We prevent data loss by exporting data BEFORE terraform apply
    """
    current, backup = get_table_names(env)
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    client = boto3.client('dynamodb', region_name='us-east-1')
    
    table = dynamodb.Table(current)
    
    # Export all items
    print(f'Exporting data from {current}...')
    items = []
    resp = table.scan()
    items.extend(resp.get('Items', []))
    while 'LastEvaluatedKey' in resp:
        resp = table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'])
        items.extend(resp.get('Items', []))
    
    print(f'  Found {len(items)} records')
    
    # Create backup table with same schema as old (single hash key)
    print(f'Creating backup table: {backup}...')
    try:
        client.create_table(
            TableName=backup,
            KeySchema=[{'AttributeName': 'template_id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'template_id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        # Wait for table to be active
        waiter = client.get_waiter('table_exists')
        waiter.wait(TableName=backup)
        print(f'  Backup table created')
    except client.exceptions.ResourceInUseException:
        print(f'  Backup table already exists, reusing')
    
    # Copy data to backup
    backup_table = dynamodb.Table(backup)
    for item in items:
        backup_table.put_item(Item=item)
    print(f'  Copied {len(items)} records to backup')
    
    print(f'\n✅ Data backed up to {backup}')
    print(f'   Now run: cd terraform && terraform workspace select {env} && terraform apply')
    print(f'   Terraform will destroy and recreate {current} with the new schema.')
    print(f'   Then run: python3 scripts/migrate-impact-templates.py migrate --env {env}')


def migrate_data(env):
    """Migrate data from backup table to new table with composite key."""
    current, backup = get_table_names(env)
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    
    backup_table = dynamodb.Table(backup)
    new_table = dynamodb.Table(current)
    
    # Read from backup
    print(f'Reading from backup table: {backup}...')
    items = []
    resp = backup_table.scan()
    items.extend(resp.get('Items', []))
    while 'LastEvaluatedKey' in resp:
        resp = backup_table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'])
        items.extend(resp.get('Items', []))
    
    print(f'  Found {len(items)} records')
    
    # Group by base template_id (strip :v suffixes)
    templates = {}
    for item in items:
        tid = item['template_id']
        # Skip malformed records
        if re.search(r':v\d+:v\d+', tid):
            print(f'  Skipping malformed: {tid}')
            continue
        
        # Determine base ID and version
        match = re.match(r'^(.+):v(\d+)$', tid)
        if match:
            base_id = match.group(1)
            version = int(match.group(2))
        else:
            base_id = tid
            version = int(item.get('version', 1))
        
        # Keep track of all versions per base_id
        if base_id not in templates:
            templates[base_id] = {}
        templates[base_id][version] = item
    
    # Write to new table
    written = 0
    for base_id, versions in templates.items():
        for version, item in versions.items():
            new_item = dict(item)
            new_item['template_id'] = base_id  # Clean ID (no :v suffix)
            new_item['version'] = version       # Numeric sort key
            
            # Remove any :v suffix artifacts
            if ':v' in new_item.get('template_id', ''):
                new_item['template_id'] = re.sub(r':v\d+$', '', new_item['template_id'])
            
            new_table.put_item(Item=new_item)
            written += 1
            print(f'  Wrote: {new_item["template_id"]} v{version}')
    
    print(f'\n✅ Migrated {written} records to {current}')
    print(f'   Verify with: aws dynamodb scan --table-name {current} --region us-east-1')


def cleanup(env):
    """Delete the backup table after verifying migration."""
    _, backup = get_table_names(env)
    client = boto3.client('dynamodb', region_name='us-east-1')
    
    confirm = input(f'Delete backup table {backup}? This cannot be undone. [y/N] ')
    if confirm.lower() != 'y':
        print('Aborted.')
        return
    
    client.delete_table(TableName=backup)
    print(f'✅ Deleted {backup}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Migrate impact_templates table')
    parser.add_argument('action', choices=['rename', 'migrate', 'cleanup'])
    parser.add_argument('--env', required=True, choices=['staging', 'production'])
    args = parser.parse_args()
    
    if args.action == 'rename':
        rename_table(args.env)
    elif args.action == 'migrate':
        migrate_data(args.env)
    elif args.action == 'cleanup':
        cleanup(args.env)
