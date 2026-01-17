#!/bin/bash

# Clear Test RSVPs from DynamoDB
# This script deletes all RSVP records from test users in the event_rsvps-staging table

TABLE_NAME="event_rsvps-staging"
REGION="us-east-1"

echo "🔍 Scanning $TABLE_NAME for test RSVPs..."

# Scan the table and get all items
ITEMS=$(aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --output json)

# Extract test RSVPs (emails containing @waterwaycleanups-test.org)
echo "$ITEMS" | jq -r '.Items[] | select(.attendee_id.S | contains("@waterwaycleanups-test.org")) | "\(.event_id.S) \(.attendee_id.S)"' | while read -r event_id attendee_id; do
  echo "  🗑️  Deleting: $attendee_id from $event_id"
  
  aws dynamodb delete-item \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --key "{\"event_id\": {\"S\": \"$event_id\"}, \"attendee_id\": {\"S\": \"$attendee_id\"}}" \
    --output text > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo "    ✓ Deleted"
  else
    echo "    ✗ Failed"
  fi
done

echo ""
echo "✅ Cleanup complete!"
