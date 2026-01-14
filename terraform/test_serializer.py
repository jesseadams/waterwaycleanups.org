#!/usr/bin/env python3
from boto3.dynamodb.types import TypeSerializer
import json

serializer = TypeSerializer()

item = {
    'event_id': 'test-event',
    'attendee_id': 'test@example.com',
    'attendee_type': 'volunteer',
    'first_name': 'Test',
    'last_name': 'User',
    'email': 'test@example.com',
    'created_at': '2026-01-14T21:00:00',
    'updated_at': '2026-01-14T21:00:00',
    'submission_date': '2026-01-14T21:00:00'
}

serialized = {k: serializer.serialize(v) for k, v in item.items()}
print("Serialized item:")
print(json.dumps(serialized, indent=2))
