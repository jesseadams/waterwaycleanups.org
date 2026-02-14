#!/bin/bash

# Rename rsvps-production to event_rsvps-production
# This script:
# 1. Scans all items from rsvps-production
# 2. Writes them to event_rsvps-production
# 3. Deletes the old rsvps-production table

set -e

REGION="us-east-1"
OLD_TABLE="rsvps-production"
NEW_TABLE="event_rsvps-production"

echo "🔄 Renaming DynamoDB table: $OLD_TABLE -> $NEW_TABLE"
echo ""

# Check if old table exists
echo "1. Checking if $OLD_TABLE exists..."
if ! aws dynamodb describe-table --table-name "$OLD_TABLE" --region "$REGION" &>/dev/null; then
  echo "❌ Table $OLD_TABLE does not exist"
  exit 1
fi
echo "✅ Table $OLD_TABLE exists"

# Check if new table exists
echo ""
echo "2. Checking if $NEW_TABLE exists..."
if aws dynamodb describe-table --table-name "$NEW_TABLE" --region "$REGION" &>/dev/null; then
  echo "⚠️  Table $NEW_TABLE already exists"
  read -p "Do you want to delete it and recreate? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Aborted"
    exit 1
  fi
  echo "Deleting $NEW_TABLE..."
  aws dynamodb delete-table --table-name "$NEW_TABLE" --region "$REGION"
  echo "Waiting for table to be deleted..."
  aws dynamodb wait table-not-exists --table-name "$NEW_TABLE" --region "$REGION"
  echo "✅ Table deleted"
fi

# Get table schema from old table
echo ""
echo "3. Getting table schema from $OLD_TABLE..."
TABLE_SCHEMA=$(aws dynamodb describe-table --table-name "$OLD_TABLE" --region "$REGION" --output json)

# Extract key schema and attribute definitions
KEY_SCHEMA=$(echo "$TABLE_SCHEMA" | jq -c '.Table.KeySchema')
ATTRIBUTE_DEFINITIONS=$(echo "$TABLE_SCHEMA" | jq -c '.Table.AttributeDefinitions')
GLOBAL_SECONDARY_INDEXES=$(echo "$TABLE_SCHEMA" | jq -c '.Table.GlobalSecondaryIndexes // []')

echo "✅ Schema retrieved"
echo "Key Schema: $KEY_SCHEMA"
echo "Attributes: $ATTRIBUTE_DEFINITIONS"

# Create new table with same schema
echo ""
echo "4. Creating $NEW_TABLE with same schema..."

if [ "$GLOBAL_SECONDARY_INDEXES" = "[]" ]; then
  aws dynamodb create-table \
    --table-name "$NEW_TABLE" \
    --key-schema "$KEY_SCHEMA" \
    --attribute-definitions "$ATTRIBUTE_DEFINITIONS" \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" \
    > /dev/null
else
  # Clean up GSIs - remove all fields except what's needed for creation
  GLOBAL_SECONDARY_INDEXES=$(echo "$GLOBAL_SECONDARY_INDEXES" | jq 'map({
    IndexName: .IndexName,
    KeySchema: .KeySchema,
    Projection: .Projection
  })')
  
  aws dynamodb create-table \
    --table-name "$NEW_TABLE" \
    --key-schema "$KEY_SCHEMA" \
    --attribute-definitions "$ATTRIBUTE_DEFINITIONS" \
    --global-secondary-indexes "$GLOBAL_SECONDARY_INDEXES" \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" \
    > /dev/null
fi

echo "Waiting for table to be active..."
aws dynamodb wait table-exists --table-name "$NEW_TABLE" --region "$REGION"
echo "✅ Table created"

# Scan and copy all items
echo ""
echo "5. Copying all items from $OLD_TABLE to $NEW_TABLE..."

# Use Python script for efficient batch copying
python3 - <<EOF
import boto3
import sys

dynamodb = boto3.resource('dynamodb', region_name='$REGION')
old_table = dynamodb.Table('$OLD_TABLE')
new_table = dynamodb.Table('$NEW_TABLE')

# Scan all items
print("Scanning items...")
response = old_table.scan()
items = response['Items']

while 'LastEvaluatedKey' in response:
    response = old_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
    items.extend(response['Items'])

print(f"Found {len(items)} items to copy")

# Batch write to new table
print("Writing items to new table...")
with new_table.batch_writer() as batch:
    for item in items:
        batch.put_item(Item=item)

print(f"✅ Copied {len(items)} items")
EOF

echo ""
echo "6. Verifying item count..."
OLD_COUNT=$(aws dynamodb scan --table-name "$OLD_TABLE" --select COUNT --region "$REGION" | jq '.Count')
NEW_COUNT=$(aws dynamodb scan --table-name "$NEW_TABLE" --select COUNT --region "$REGION" | jq '.Count')

echo "Old table: $OLD_COUNT items"
echo "New table: $NEW_COUNT items"

if [ "$OLD_COUNT" != "$NEW_COUNT" ]; then
  echo "❌ Item counts don't match!"
  exit 1
fi
echo "✅ Item counts match"

# Delete old table
echo ""
read -p "7. Delete old table $OLD_TABLE? (yes/no): " confirm
if [ "$confirm" = "yes" ]; then
  echo "Deleting $OLD_TABLE..."
  aws dynamodb delete-table --table-name "$OLD_TABLE" --region "$REGION"
  echo "✅ Old table deleted"
else
  echo "⚠️  Old table kept. You can delete it manually later."
fi

echo ""
echo "🎉 Done! Table renamed successfully."
echo ""
echo "Next steps:"
echo "1. Revert the Terraform changes (EVENT_RSVPS_TABLE_NAME back to event_rsvps)"
echo "2. Run: cd terraform && terraform apply"
