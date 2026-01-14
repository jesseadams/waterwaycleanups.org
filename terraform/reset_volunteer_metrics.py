#!/usr/bin/env python3
"""Reset volunteer metrics in staging"""

import boto3

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
volunteers_table = dynamodb.Table('volunteers-staging')

email = 'jesse@techno-geeks.org'

print(f"Resetting metrics for {email}...")

volunteers_table.update_item(
    Key={'email': email},
    UpdateExpression='REMOVE volunteer_metrics'
)

print("✓ Volunteer metrics cleared")
print("✓ The volunteers page should now show 0 RSVPs")
