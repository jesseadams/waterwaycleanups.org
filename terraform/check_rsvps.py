#!/usr/bin/env python3
"""Check RSVPs in event_rsvps-staging table"""

import boto3
import json

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('event_rsvps-staging')

print("Scanning event_rsvps-staging table...")
response = table.scan()
items = response.get('Items', [])

print(f"\nFound {len(items)} RSVP records:\n")
for item in items:
    print(json.dumps(item, indent=2, default=str))
    print("\n" + "="*60 + "\n")
