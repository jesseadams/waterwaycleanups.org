#!/usr/bin/env python3
"""Fix Mara's RSVP to add missing email and guardian_email fields"""

import boto3

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('event_rsvps-staging')

print("Updating Mara's RSVP to add email and guardian_email...")

table.update_item(
    Key={
        'event_id': 'brooke-road-and-thorny-point-road-cleanup-february-2026',
        'attendee_id': '4ec1a94a-429c-4fce-a2d3-2993c1041d45'
    },
    UpdateExpression='SET email = :email, guardian_email = :guardian_email',
    ExpressionAttributeValues={
        ':email': 'jesse@techno-geeks.org',
        ':guardian_email': 'jesse@techno-geeks.org'
    }
)

print("✓ Updated Mara's RSVP with email and guardian_email fields")
