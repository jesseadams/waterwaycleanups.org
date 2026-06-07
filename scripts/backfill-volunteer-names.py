#!/usr/bin/env python3
"""
Backfill the volunteers table with names for people who have a name on file
elsewhere (most importantly an adult waiver) but whose volunteers record is
missing or has no first_name.

Why drive this off the waivers table rather than scanning volunteers:
  Volunteers records are only *created* by paths that already require a name
  (complete-profile, minor graduation). The waiver and RSVP paths historically
  only read the volunteers table, never created a nameless row. So the people
  who "signed a waiver but never completed a profile" usually have NO volunteers
  row at all -- a scan of volunteers for empty names finds nothing. The names we
  want live in the waivers table, so we enumerate candidates from there.

For each candidate email we resolve the best real name via NameResolver (which
checks volunteers, then waivers, then the RSVP tables) and upsert the volunteers
record, setting profile_complete = True. Existing names are never overwritten
(if_not_exists). Only adult waivers are considered: a minor waiver's name is the
minor's, not the account holder's.

Usage:
  python scripts/backfill-volunteer-names.py            # Dry run (default)
  python scripts/backfill-volunteer-names.py --apply    # Apply updates

Requires dynamodb read access to volunteers/waivers/RSVP tables and
dynamodb:UpdateItem on the volunteers table.
"""

import argparse
import sys
import time
from datetime import datetime, timezone

from ses_contact_names import VOLUNTEERS_TABLE, WAIVERS_TABLE, NameResolver, _is_placeholder


def collect_adult_waiver_emails(waivers_table):
    """Scan the waivers table and return the set of emails from adult waivers."""
    emails = set()
    scan_kwargs = {}
    while True:
        resp = waivers_table.scan(**scan_kwargs)
        for item in resp.get('Items', []):
            # Only adult waivers carry the account holder's own name. Minor
            # waivers store the minor's name, which must not populate the
            # guardian/account volunteers record.
            if not item.get('is_adult'):
                continue
            email = (item.get('email') or '').strip().lower()
            if email:
                emails.add(email)
        token = resp.get('LastEvaluatedKey')
        if not token:
            break
        scan_kwargs['ExclusiveStartKey'] = token
    return emails


def volunteer_has_real_name(volunteers_table, email):
    """True if the volunteers record already has a usable (non-placeholder) name."""
    try:
        item = volunteers_table.get_item(Key={'email': email}).get('Item')
    except Exception as e:
        print(f"  WARN volunteers lookup {email}: {e}")
        return False
    if not item:
        return False
    first = (item.get('first_name') or '').strip()
    last = (item.get('last_name') or '').strip()
    return bool(first) and not _is_placeholder(first, last)


def main():
    parser = argparse.ArgumentParser(
        description='Backfill volunteers table first/last name from waivers and RSVP data'
    )
    parser.add_argument('--apply', action='store_true',
                        help='Actually apply changes (default is dry run)')
    args = parser.parse_args()

    print("Building name indexes from RSVP tables...")
    resolver = NameResolver()
    print(f"  event_rsvps: {len(resolver.event_rsvp_index)} emails, "
          f"rsvps: {len(resolver.rsvp_index)} emails\n")

    volunteers_table = resolver.volunteers
    waivers_table = resolver.waivers

    print(f"Scanning '{WAIVERS_TABLE}' for adult waiver emails...")
    candidates = collect_adult_waiver_emails(waivers_table)
    print(f"Found {len(candidates)} unique adult-waiver emails.\n")

    to_update = []
    already_named = 0
    skipped = []
    for email in sorted(candidates):
        if volunteer_has_real_name(volunteers_table, email):
            already_named += 1
            continue
        first, last, source = resolver.resolve(email)
        if first:
            to_update.append({
                'email': email,
                'first_name': first,
                'last_name': last,
                'source': source,
            })
        else:
            skipped.append(email)

    print(f"{'='*72}")
    print(f"Already have a name (no action): {already_named}")
    print(f"Will populate: {len(to_update)}")
    print(f"Skipped (no resolvable name): {len(skipped)}")
    print(f"Mode: {'APPLY' if args.apply else 'DRY RUN'}")
    print(f"{'='*72}\n")

    for m in to_update:
        print(f"  FIX {m['email']:42s} -> first_name='{m['first_name']}' "
              f"last_name='{m['last_name']}' [{m['source']}]")
    if skipped:
        print("\nSkipped (no data, will prompt on next login):")
        for email in skipped:
            print(f"  SKIP {email}")

    if not args.apply:
        print("\nRun with --apply to update these volunteer records.")
        sys.exit(0)

    print("\nApplying updates...")
    success = 0
    errors = 0
    for m in to_update:
        now = datetime.now(timezone.utc).isoformat()
        full_name = f"{m['first_name']} {m['last_name']}".strip()
        try:
            # update_item upserts: it creates the volunteers row if it doesn't
            # exist. if_not_exists guards against clobbering a name written
            # between the scan and this update.
            volunteers_table.update_item(
                Key={'email': m['email']},
                UpdateExpression=(
                    'SET first_name = if_not_exists(first_name, :fn), '
                    'last_name = if_not_exists(last_name, :ln), '
                    'full_name = if_not_exists(full_name, :full), '
                    'profile_complete = :pc, '
                    'updated_at = :now, created_at = if_not_exists(created_at, :now)'
                ),
                ExpressionAttributeValues={
                    ':fn': m['first_name'],
                    ':ln': m['last_name'],
                    ':full': full_name,
                    ':pc': True,
                    ':now': now,
                },
            )
            print(f"  UPDATED {m['email']}")
            success += 1
        except Exception as e:
            print(f"  ERROR updating {m['email']}: {e}")
            errors += 1
        time.sleep(0.05)

    print(f"\nDone. Updated: {success}, Errors: {errors}, Skipped: {len(skipped)}")


if __name__ == '__main__':
    main()
