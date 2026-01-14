#!/usr/bin/env python3
"""Fix Gavin's RSVP to add missing email and guardian_email fields"""

import boto3

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('event_rsvps-staging')

print("Updating Gavin's RSVP to add email and guardian_email...")

table.update_item(
    Key={
        'event_id': 'brooke-road-and-thorny-point-road-cleanup-february-2026',
        'attendee_id': '3c5ffdf1-615e-4103-a231-69a2bd73e166'
    },
    UpdateExpression='SET email = :email, guardian_email = :guardian_email',
    ExpressionAttributeValues={
        ':email': 'jesse@techno-geeks.org',
        ':guardian_email': 'jesse@techno-geeks.org'
    }
)

print("✓ Updated Gavin's RSVP with email and guardian_email fields")
