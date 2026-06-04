#!/usr/bin/env python3
"""
Report SES contacts missing a firstName attribute and whether each name can be
resolved from our other data sources (volunteers, waivers, RSVP tables).

Usage:
  python scripts/find-contacts-missing-firstname.py                 # report only
  python scripts/find-contacts-missing-firstname.py --json out.json # also write JSON

Read-only. Requires sesv2:ListContacts/GetContact and dynamodb:GetItem/Query/Scan.
"""

import argparse
import json
import boto3

from ses_contact_names import (
    CONTACT_LIST_NAME, REGION, NameResolver, find_missing_firstname,
)


def main():
    parser = argparse.ArgumentParser(description='Find SES contacts missing firstName')
    parser.add_argument('--json', dest='json_out', help='Write detailed results to this JSON file')
    args = parser.parse_args()

    sesv2 = boto3.client('sesv2', region_name=REGION)

    print("Building name indexes from RSVP tables...")
    resolver = NameResolver()
    print(f"  event_rsvps: {len(resolver.event_rsvp_index)} emails, "
          f"rsvps: {len(resolver.rsvp_index)} emails\n")

    print(f"Fetching contacts from '{CONTACT_LIST_NAME}'...")
    missing, total = find_missing_firstname(sesv2, resolver)
    print(f"Found {total} total contacts.\n")

    populatable = [m for m in missing if m['can_populate']]
    not_populatable = [m for m in missing if not m['can_populate']]

    print(f"{'='*72}")
    print(f"Contacts missing firstName: {len(missing)}")
    print(f"  Can populate from data sources: {len(populatable)}")
    print(f"  No data available (would use 'Volunteer'): {len(not_populatable)}")
    print(f"{'='*72}\n")

    print("MISSING firstName (populatable):")
    for m in populatable:
        print(f"  {m['email']:42s} -> '{m['resolved_first_name']}' "
              f"'{m['resolved_last_name']}'  [{m['source']}]")

    print("\nMISSING firstName (no data, will fall back to 'Volunteer'):")
    for m in not_populatable:
        print(f"  {m['email']}")

    if args.json_out:
        with open(args.json_out, 'w') as f:
            json.dump(missing, f, indent=2)
        print(f"\nWrote detailed results to {args.json_out}")


if __name__ == '__main__':
    main()
