#!/usr/bin/env python3
"""Inspect volunteer data in staging"""

import boto3
import json

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
volunteers_table = dynamodb.Table('volunteers-staging')

response = volunteers_table.scan()
items = response.get('Items', [])

print("Volunteer records in staging:\n")
for item in items:
    print(json.dumps(item, indent=2, default=str))
    print("\n" + "="*60 + "\n")
