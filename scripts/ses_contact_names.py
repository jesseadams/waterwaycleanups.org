#!/usr/bin/env python3
"""
Shared helpers for working with SES contacts that are missing a firstName
attribute, and for resolving names from the various DynamoDB data sources.

Used by:
  - find-contacts-missing-firstname.py   (read-only report)
  - backfill-ses-contact-attributes.py   (apply firstName/lastName to SES)
  - send-volunteer-request-to-missed.py  (email the cohort that missed a send)

Name data is resolved (in priority order) from:
  1. volunteers-production        (key: email)
  2. volunteer_waivers-production (key: email + waiver_id, prefer most recent)
  3. event_rsvps-production       (email attribute, scanned)
  4. rsvps-production             (email attribute, scanned)

Placeholder walk-in names (firstName "Volunteer" / lastName "User") are ignored
so those contacts fall back to the default rather than a fake name.
"""

import json
import time
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

CONTACT_LIST_NAME = 'WaterwayCleanups'
VOLUNTEERS_TABLE = 'volunteers-production'
WAIVERS_TABLE = 'volunteer_waivers-production'
EVENT_RSVPS_TABLE = 'event_rsvps-production'
RSVPS_TABLE = 'rsvps-production'
REGION = 'us-east-1'

DEFAULT_FIRST_NAME = 'Volunteer'

# (first_name, last_name) combinations that are placeholders, not real names.
PLACEHOLDER_NAMES = {('volunteer', 'user')}


def _is_placeholder(first, last):
    return (first.strip().lower(), last.strip().lower()) in PLACEHOLDER_NAMES


def get_contact_with_retry(sesv2_client, email, contact_list=CONTACT_LIST_NAME,
                           max_attempts=6, base_delay=0.5):
    """get_contact with exponential backoff on SES throttling."""
    attempt = 0
    while True:
        try:
            return sesv2_client.get_contact(ContactListName=contact_list, EmailAddress=email)
        except ClientError as e:
            code = e.response.get('Error', {}).get('Code', '')
            attempt += 1
            if code in ('TooManyRequestsException', 'Throttling') and attempt < max_attempts:
                time.sleep(base_delay * (2 ** (attempt - 1)))
                continue
            raise


def get_all_contacts(sesv2_client, contact_list=CONTACT_LIST_NAME):
    """Paginate through every contact in the list."""
    contacts = []
    next_token = None
    while True:
        kwargs = {'ContactListName': contact_list, 'PageSize': 100}
        if next_token:
            kwargs['NextToken'] = next_token
        response = sesv2_client.list_contacts(**kwargs)
        contacts.extend(response.get('Contacts', []))
        next_token = response.get('NextToken')
        if not next_token:
            break
    return contacts


def parse_attributes(detail):
    """Parse the AttributesData JSON blob from a get_contact response."""
    attributes_raw = detail.get('AttributesData', '{}')
    try:
        return json.loads(attributes_raw) if attributes_raw else {}
    except json.JSONDecodeError:
        return {}


def get_volunteer_topic_status(detail):
    """Return the subscription status for the 'volunteer' topic, or 'NONE'."""
    for pref in detail.get('TopicPreferences', []):
        if pref.get('TopicName') == 'volunteer':
            return pref.get('SubscriptionStatus', 'NONE')
    return 'NONE'


def scan_email_name_index(table):
    """Scan a table into {email_lower: (first, last)}, ignoring placeholder names."""
    index = {}
    scan_kwargs = {}
    while True:
        resp = table.scan(**scan_kwargs)
        for item in resp.get('Items', []):
            email = (item.get('email') or '').strip().lower()
            if not email:
                continue
            first = (item.get('first_name') or '').strip()
            last = (item.get('last_name') or '').strip()
            if not first or _is_placeholder(first, last):
                continue
            existing = index.get(email)
            if existing is None or not existing[0]:
                index[email] = (first, last)
        token = resp.get('LastEvaluatedKey')
        if not token:
            break
        scan_kwargs['ExclusiveStartKey'] = token
    return index


class NameResolver:
    """Resolves a contact's (first, last, source) across all data sources."""

    def __init__(self, dynamodb=None):
        self.dynamodb = dynamodb or boto3.resource('dynamodb', region_name=REGION)
        self.volunteers = self.dynamodb.Table(VOLUNTEERS_TABLE)
        self.waivers = self.dynamodb.Table(WAIVERS_TABLE)
        # The RSVP tables have no email key/index, so scan them once up front.
        self.event_rsvp_index = scan_email_name_index(self.dynamodb.Table(EVENT_RSVPS_TABLE))
        self.rsvp_index = scan_email_name_index(self.dynamodb.Table(RSVPS_TABLE))

    def resolve(self, email):
        """Return (first_name, last_name, source). Empty source means no data."""
        key = email.strip().lower()

        # 1. volunteers table
        try:
            item = self.volunteers.get_item(Key={'email': email}).get('Item')
            if item:
                first = (item.get('first_name') or '').strip()
                last = (item.get('last_name') or '').strip()
                if first and not _is_placeholder(first, last):
                    return first, last, 'volunteers'
        except Exception as e:
            print(f"  WARN volunteers lookup {email}: {e}")

        # 2. waivers table (most recent submission wins)
        try:
            items = self.waivers.query(
                KeyConditionExpression=Key('email').eq(email)
            ).get('Items', [])
            if items:
                items.sort(key=lambda x: x.get('submission_date', ''), reverse=True)
                first = (items[0].get('first_name') or '').strip()
                last = (items[0].get('last_name') or '').strip()
                if first and not _is_placeholder(first, last):
                    return first, last, 'waivers'
        except Exception as e:
            print(f"  WARN waivers lookup {email}: {e}")

        # 3. event_rsvps scanned index
        if key in self.event_rsvp_index and self.event_rsvp_index[key][0]:
            first, last = self.event_rsvp_index[key]
            return first, last, 'event_rsvps'

        # 4. rsvps scanned index
        if key in self.rsvp_index and self.rsvp_index[key][0]:
            first, last = self.rsvp_index[key]
            return first, last, 'rsvps'

        return '', '', ''


def find_missing_firstname(sesv2_client, resolver, contact_list=CONTACT_LIST_NAME):
    """
    Return a list of dicts describing every contact missing a firstName,
    with resolved names attached.
    """
    contacts = get_all_contacts(sesv2_client, contact_list)
    missing = []
    for contact in contacts:
        email = contact.get('EmailAddress', '')
        try:
            detail = get_contact_with_retry(sesv2_client, email, contact_list)
        except Exception as e:
            print(f"  ERROR getting contact {email}: {e}")
            continue

        attributes = parse_attributes(detail)
        if (attributes.get('firstName') or '').strip():
            continue

        first, last, source = resolver.resolve(email)
        missing.append({
            'email': email,
            'current_attributes': attributes,
            'resolved_first_name': first,
            'resolved_last_name': last,
            'source': source,
            'can_populate': bool(first),
            'volunteer_topic_status': get_volunteer_topic_status(detail),
            'topic_preferences': detail.get('TopicPreferences', []),
        })
    return missing, len(contacts)
