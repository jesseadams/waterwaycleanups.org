#!/usr/bin/env python3
"""Clear all RSVP data from the OLD rsvps-staging table"""

import boto3

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('rsvps-staging')

def clear_all_rsvps():
    """Scan and delete all items from the old rsvps table"""
    print("Scanning OLD rsvps-staging table (the one user-dashboard uses)...")
    
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
        email = item['email']  # Old table uses email as range key
        
        try:
            table.delete_item(
                Key={
                    'event_id': event_id,
                    'email': email
                }
            )
            deleted_count += 1
            print(f"  Deleted: {event_id} / {email}")
        except Exception as e:
            print(f"  ✗ Error deleting {event_id} / {email}: {e}")
    
    print(f"\n✓ Successfully deleted {deleted_count} RSVP records from OLD rsvps table")
    print("✓ The volunteers dashboard should now show 0 RSVPs")

if __name__ == '__main__':
    try:
        clear_all_rsvps()
    except Exception as e:
        print(f"✗ Error: {e}")
        exit(1)
