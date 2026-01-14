#!/usr/bin/env python3
"""Test querying RSVPs via email-index"""

import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('event_rsvps-staging')

email = 'jesse@techno-geeks.org'

print(f"Querying RSVPs for {email} using email-index...")

try:
    response = table.query(
        IndexName='email-index',
        KeyConditionExpression=Key('email').eq(email)
    )
    
    items = response.get('Items', [])
    print(f"\n✓ Found {len(items)} RSVP(s):\n")
    
    for item in items:
        attendee_type = item.get('attendee_type', 'volunteer')
        name = f"{item.get('first_name', '')} {item.get('last_name', '')}"
        event_id = item.get('event_id', '')
        print(f"  - {name} ({attendee_type}) for {event_id}")
    
except Exception as e:
    print(f"✗ Error: {e}")
