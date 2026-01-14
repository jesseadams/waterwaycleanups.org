#!/usr/bin/env python3
import boto3
import json

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('event_rsvps-staging')

response = table.get_item(
    Key={
        'event_id': 'brooke-road-and-thorny-point-road-cleanup-february-2026',
        'attendee_id': '4ec1a94a-429c-4fce-a2d3-2993c1041d45'
    }
)

print("Mara's RSVP record:")
print(json.dumps(response.get('Item'), indent=2, default=str))
