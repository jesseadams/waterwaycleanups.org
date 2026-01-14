#!/usr/bin/env python3
"""Clear RSVP data from volunteers in staging"""

import boto3

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
volunteers_table = dynamodb.Table('volunteers-staging')

def clear_volunteer_rsvps():
    """Scan volunteers and clear their RSVP data"""
    print("Scanning staging volunteers table...")
    
    # Scan to get all volunteers
    response = volunteers_table.scan()
    items = response.get('Items', [])
    
    # Handle pagination
    while 'LastEvaluatedKey' in response:
        response = volunteers_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response.get('Items', []))
    
    if not items:
        print("✓ No volunteers found")
        return
    
    print(f"Found {len(items)} volunteer records")
    
    # Update each volunteer to clear RSVP data
    updated_count = 0
    for volunteer in items:
        email = volunteer['email']
        
        # Check if volunteer has RSVP data
        has_rsvps = volunteer.get('rsvps') or volunteer.get('total_rsvps', 0) > 0
        
        if has_rsvps:
            try:
                volunteers_table.update_item(
                    Key={'email': email},
                    UpdateExpression='SET rsvps = :empty_list, total_rsvps = :zero',
                    ExpressionAttributeValues={
                        ':empty_list': [],
                        ':zero': 0
                    }
                )
                updated_count += 1
                print(f"  Cleared RSVPs for: {email}")
            except Exception as e:
                print(f"  ✗ Error updating {email}: {e}")
        else:
            print(f"  Skipped (no RSVPs): {email}")
    
    print(f"\n✓ Successfully cleared RSVP data from {updated_count} volunteers")

if __name__ == '__main__':
    try:
        clear_volunteer_rsvps()
    except Exception as e:
        print(f"✗ Error: {e}")
        exit(1)
