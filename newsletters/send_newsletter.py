#!/usr/bin/env python
# -*- coding: utf-8 -*-
import csv
import boto3
import argparse
import sys
from datetime import datetime

# Set up argument parsing
parser = argparse.ArgumentParser(description='Create an SES template with a date parameter')
parser.add_argument('--date', type=str, help='Date for the template name (YYYY-MM-DD format)', required=True)
args = parser.parse_args()

template_name = "waterway-cleanups-"
from_email = "info@waterwaycleanups.org"

# Validate and use the date
try:
    template_name += args.date
except ValueError:
    print("Error: Date must be in YYYY-MM-DD format")
    sys.exit(1)

sesv2 = boto3.client('sesv2', region_name='us-east-1')

def get_contact_emails(contact_list_name, topic=None):
    emails = []
    next_token = None

    # Manual pagination implementation
    while True:
        # Prepare the request parameters
        params = {'ContactListName': contact_list_name}
        if next_token:
            params['NextToken'] = next_token

        # Make the API call
        response = sesv2.list_contacts(**params)

        # Process contacts in the current page
        for contact in response.get('Contacts', []):
            if contact.get("UnsubscribeAll"):
                continue
            if topic:
                topics = contact.get("TopicPreferences", [])
                if not any(tp["TopicName"] == topic and tp["SubscriptionStatus"] == "OPT_IN" for tp in topics):
                    continue
            emails.append(contact["EmailAddress"])

        # Check if there are more pages
        next_token = response.get('NextToken')
        if not next_token:
            break

    return emails

def send_templated_email(template_name, from_email, to_email, template_data):
    response = sesv2.send_email(
        FromEmailAddress=from_email,
        Destination={'ToAddresses': [to_email]},
        Content={
            'Template': {
                'TemplateName': template_name,
                'TemplateData': template_data
            }
        }
    )
    print(f"Sent to {to_email}: Message ID {response['MessageId']}")

def get_contact_information():
    contacts = {}
    with open('volunteers.csv', newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            contacts[row["email"]] = row

    return contacts

if __name__ == "__main__":
    contact_list_name = "WaterwayCleanups"
    template_name = "WaterwayCleanupsTemplate"
    from_email = "info@waterwaycleanups.org"

    emails = get_contact_emails("WaterwayCleanups")
    contacts = get_contact_information()
    print(contacts)

    for email in emails:
        template_data = '{"firstName": "' + contacts[email]['first_name'] + '"}'
        print(f"Sending email to {email} with template data: {template_data}")
        send_templated_email(template_name, from_email, email, template_data)