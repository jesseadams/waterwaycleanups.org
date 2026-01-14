#!/usr/bin/env python3
"""Clear all RSVP data from staging DynamoDB table"""

import boto3
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('event_rsvps-staging')

def clear_all_rsvps():
    """Scan and delete all items from the table"""
    print("Scanning staging RSVP table...")
    
    # Scan to get all items
    response = table.scan()
    items = response.get('Items', [])
    
    # Handle pagination if there are more items
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response.get('Items', []))
    
    if not items:
        print("✓ Table is already empty")
        return
    
    print(f"Found {len(items)} RSVP records to delete")
    
    # Delete each item
    deleted_count = 0
    for item in items:
        event_id = item['event_id']
        attendee_id = item.get('attendee_id', item.get('email'))
        
        try:
            table.delete_item(
                Key={
                    'event_id': event_id,
                    'attendee_id': attendee_id
                }
            )
            deleted_count += 1
            print(f"  Deleted: {event_id} / {attendee_id}")
        except Exception as e:
            print(f"  ✗ Error deleting {event_id} / {attendee_id}: {e}")
    
    print(f"\n✓ Successfully deleted {deleted_count} RSVP records")
    print("✓ Staging table is now empty and ready for fresh testing")

if __name__ == '__main__':
    try:
        clear_all_rsvps()
    except Exception as e:
        print(f"✗ Error: {e}")
        exit(1)
