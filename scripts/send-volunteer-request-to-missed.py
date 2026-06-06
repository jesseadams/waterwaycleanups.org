#!/usr/bin/env python3
"""
Send the volunteer-request newsletter to the contacts who missed the latest send
because their SES contact was missing a firstName attribute.

The original scheduled send renders {{firstName}}; contacts without that attribute
were skipped/failed. This script re-sends template `2026-06-04-volunteer-request`
to exactly that cohort, supplying a resolved firstName (from our data) or the
"Volunteer" default when no name is available.

It uses SES v2 list management so the unsubscribe link ({{amazonSESUnsubscribeUrl}})
renders correctly, and only sends to contacts who are OPT_IN on the 'volunteer'
topic and not globally unsubscribed.

Usage:
  python scripts/send-volunteer-request-to-missed.py                 # Dry run (default)
  python scripts/send-volunteer-request-to-missed.py --apply         # Actually send
  python scripts/send-volunteer-request-to-missed.py --apply --limit 2   # Send to first 2 (test)

Requires sesv2:ListContacts/GetContact/SendEmail and dynamodb read access.
"""

import argparse
import json
import sys
import time
import boto3

from ses_contact_names import (
    CONTACT_LIST_NAME, REGION, DEFAULT_FIRST_NAME,
    NameResolver, find_missing_firstname,
)

TEMPLATE_NAME = '2026-06-04-volunteer-request'
TOPIC_NAME = 'volunteer'
FROM_EMAIL = 'Waterway Cleanups <info@waterwaycleanups.org>'
SEND_DELAY_SECONDS = 0.2  # stay well under SES send-rate limits


def main():
    parser = argparse.ArgumentParser(description='Send volunteer-request to contacts who missed it')
    parser.add_argument('--apply', action='store_true', help='Actually send (default is dry run)')
    parser.add_argument('--limit', type=int, default=None, help='Only send to the first N recipients (for testing)')
    parser.add_argument('--template', default=TEMPLATE_NAME, help=f'Template name (default: {TEMPLATE_NAME})')
    parser.add_argument('--from-email', default=FROM_EMAIL, help='Source email address')
    parser.add_argument('--from-json', default=None,
                        help='Send to the cohort recorded in this saved snapshot JSON (from '
                             'find-contacts-missing-firstname.py --json) instead of scanning SES live. '
                             'Use this to re-send to people who have since been backfilled and would '
                             'no longer appear in a live scan.')
    parser.add_argument('--exclude-file', default=None,
                        help='Optional file with one email per line to skip (e.g. recipients already sent).')
    args = parser.parse_args()

    sesv2 = boto3.client('sesv2', region_name=REGION)

    exclude = set()
    if args.exclude_file:
        with open(args.exclude_file) as f:
            exclude = {line.strip().lower() for line in f if line.strip()}
        print(f"Excluding {len(exclude)} email(s) from {args.exclude_file}\n")

    if args.from_json:
        print(f"Loading cohort snapshot from {args.from_json}...")
        with open(args.from_json) as f:
            missing = json.load(f)
        total = len(missing)
        print(f"Snapshot contains {total} contacts.\n")
    else:
        print("Building name indexes from RSVP tables...")
        resolver = NameResolver()
        print(f"  event_rsvps: {len(resolver.event_rsvp_index)} emails, "
              f"rsvps: {len(resolver.rsvp_index)} emails\n")

        print(f"Fetching contacts from '{CONTACT_LIST_NAME}'...")
        missing, total = find_missing_firstname(sesv2, resolver)
        print(f"Found {total} total contacts, {len(missing)} missing firstName.\n")

    # Only email contacts who are opted in to the volunteer topic.
    recipients = [m for m in missing
                  if m['volunteer_topic_status'] == 'OPT_IN'
                  and m['email'].strip().lower() not in exclude]
    skipped_optout = [m for m in missing if m['volunteer_topic_status'] != 'OPT_IN']

    if args.limit is not None:
        recipients = recipients[:args.limit]

    print(f"{'='*72}")
    print(f"Recipients (OPT_IN to '{TOPIC_NAME}'): {len(recipients)}")
    print(f"Excluded (not opted in): {len(skipped_optout)}")
    print(f"Template: {args.template}")
    print(f"Mode: {'APPLY (sending)' if args.apply else 'DRY RUN'}")
    print(f"{'='*72}\n")

    for m in recipients:
        first = m['resolved_first_name'] or DEFAULT_FIRST_NAME
        default_note = '' if m['resolved_first_name'] else '  (DEFAULT)'
        print(f"  {m['email']:42s} firstName='{first}'{default_note}")

    if skipped_optout:
        print("\nExcluded (not OPT_IN to volunteer topic):")
        for m in skipped_optout:
            print(f"  {m['email']} [{m['volunteer_topic_status']}]")

    if not args.apply:
        print("\nRun with --apply to send these emails.")
        sys.exit(0)

    print("\nSending...")
    sent = 0
    failed = 0
    for m in recipients:
        first_name = m['resolved_first_name'] or DEFAULT_FIRST_NAME
        last_name = m['resolved_last_name'] or ''
        template_data = {'firstName': first_name, 'lastName': last_name}
        try:
            sesv2.send_email(
                FromEmailAddress=args.from_email,
                Destination={'ToAddresses': [m['email']]},
                Content={
                    'Template': {
                        'TemplateName': args.template,
                        'TemplateData': json.dumps(template_data),
                    }
                },
                ListManagementOptions={
                    'ContactListName': CONTACT_LIST_NAME,
                    'TopicName': TOPIC_NAME,
                },
            )
            print(f"  SENT {m['email']} (firstName='{first_name}')")
            sent += 1
        except Exception as e:
            print(f"  ERROR sending to {m['email']}: {e}")
            failed += 1
        time.sleep(SEND_DELAY_SECONDS)

    print(f"\nDone. Sent: {sent}, Failed: {failed}")


if __name__ == '__main__':
    main()
