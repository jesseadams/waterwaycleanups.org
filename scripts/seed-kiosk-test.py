#!/usr/bin/env python3
"""Seed a fake event with RSVPs in staging for kiosk mode testing."""

import boto3
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
events_table = dynamodb.Table('events-staging')
rsvps_table = dynamodb.Table('event_rsvps-staging')

EVENT_ID = 'kiosk-test-cleanup-april-2026'

# RSVPs: mix of volunteers, a minor, and one cancelled
rsvps = [
    {'attendee_id': 'alice@example.com', 'type': 'volunteer', 'first': 'Alice', 'last': 'Johnson', 'email': 'alice@example.com', 'status': 'active'},
    {'attendee_id': 'bob@example.com', 'type': 'volunteer', 'first': 'Bob', 'last': 'Martinez', 'email': 'bob@example.com', 'status': 'active'},
    {'attendee_id': 'carol@example.com', 'type': 'volunteer', 'first': 'Carol', 'last': 'Williams', 'email': 'carol@example.com', 'status': 'active'},
    {'attendee_id': 'dave@example.com', 'type': 'volunteer', 'first': 'Dave', 'last': 'Chen', 'email': 'dave@example.com', 'status': 'active'},
    {'attendee_id': 'emma@example.com', 'type': 'volunteer', 'first': 'Emma', 'last': 'Davis', 'email': 'emma@example.com', 'status': 'active'},
    {'attendee_id': 'frank@example.com', 'type': 'volunteer', 'first': 'Frank', 'last': 'Thompson', 'email': 'frank@example.com', 'status': 'active'},
    {'attendee_id': 'grace@example.com', 'type': 'volunteer', 'first': 'Grace', 'last': 'Kim', 'email': 'grace@example.com', 'status': 'active'},
    {'attendee_id': 'iris@example.com', 'type': 'volunteer', 'first': 'Iris', 'last': 'Nguyen', 'email': 'iris@example.com', 'status': 'active'},
    {'attendee_id': 'henry@example.com', 'type': 'volunteer', 'first': 'Henry', 'last': 'Patel', 'email': 'henry@example.com', 'status': 'cancelled'},
    # Minor under Alice's guardianship
    {'attendee_id': 'minor-lily-johnson-1745618400', 'type': 'minor', 'first': 'Lily', 'last': 'Johnson', 'email': 'alice@example.com', 'status': 'active', 'age': 12, 'dob': '2014-03-15'},
]

now = datetime.now(timezone.utc).isoformat()

print(f"Writing {len(rsvps)} RSVPs for event {EVENT_ID}...")

for r in rsvps:
    item = {
        'event_id': EVENT_ID,
        'attendee_id': r['attendee_id'],
        'attendee_type': r['type'],
        'status': r['status'],
        'first_name': r['first'],
        'last_name': r['last'],
        'email': r['email'],
        'guardian_email': r['email'],
        'no_show': False,
        'walk_in': False,
        'created_at': now,
        'updated_at': now,
    }
    if r['type'] == 'minor':
        item['age'] = r['age']
        item['date_of_birth'] = r['dob']
        item['guardian_email'] = r['email']

    rsvps_table.put_item(Item=item)
    label = f"[{r['type']}]" if r['type'] == 'minor' else ''
    print(f"  ✓ {r['first']} {r['last']} {label} ({r['status']})")

print("\nDone! Event is ready for kiosk testing.")
print(f"  Event ID: {EVENT_ID}")
print(f"  Staging check-in URL: https://staging.waterwaycleanups.org/checkin/?kiosk=true")
