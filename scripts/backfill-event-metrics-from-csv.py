#!/usr/bin/env python3
"""
Backfill cleanup metrics for events from a historical CSV.

For each CSV row:
  - If it matches an existing event (same calendar date, optionally
    disambiguated by location), update that event's cleanup_metrics and
    volunteer_count in place. Status and all other fields are left untouched.
  - If it does NOT match any event, create an "ad hoc" event record. Ad hoc
    events are unofficial cleanups that should appear only in aggregate impact
    stats (the /impact page), not as full event pages. They are marked with
    ad_hoc=true and private=true so the Hugo generator skips them.

CSV columns (header required):
  Date, Location, Volunteers, EventHours, Volunteer Hours, Trash Bags, Estimated Pounds

Metric reconciliation:
  The site stores total_litter_lbs and derives it as (bags * 25) + large items.
  The CSV provides "Estimated Pounds" directly, which we treat as the source of
  truth for total_litter_lbs. We back out large_items_weight_lbs = max(0,
  estimated - bags*25) so the stored record stays internally consistent.
  number_of_tires is not in the CSV, so it defaults to 0.

Usage:
  python scripts/backfill-event-metrics-from-csv.py --csv data.csv               # Dry run (default)
  python scripts/backfill-event-metrics-from-csv.py --csv data.csv --apply       # Apply
  python scripts/backfill-event-metrics-from-csv.py --csv data.csv --environment=staging

Defaults to the production tables. Requires dynamodb read/write on the events table.
"""

import argparse
import csv
import re
import sys
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

REGION = 'us-east-1'
LBS_PER_BAG = 25


def table_suffix(environment):
    if environment in ('prod', 'production'):
        return '-production'
    return f'-{environment}'


def slugify(text):
    text = (text or '').lower()
    text = re.sub(r"[''']", '', text)
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return re.sub(r'^-+|-+$', '', text)


def parse_date(date_str):
    """Parse M/D/YYYY (the CSV format) into a date."""
    return datetime.strptime(date_str.strip(), '%m/%d/%Y').date()


def to_int(value, default=0):
    try:
        return int(float(str(value).strip()))
    except (ValueError, TypeError):
        return default


def to_decimal(value, default=0):
    try:
        return Decimal(str(float(str(value).strip())))
    except (ValueError, TypeError):
        return Decimal(default)


def get_tires(row):
    """
    Read the tires count from a CSV row. The column header varies across CSVs
    ('# Tires', 'Tires', 'Number of Tires', ...); older CSVs omit it entirely,
    in which case this returns 0.
    """
    for key in row.keys():
        if key is None:
            continue
        normalized = key.strip().lower().lstrip('#').strip()
        if normalized in ('tires', 'number of tires', 'num tires', 'no tires'):
            return row[key]
    return 0


def load_events(events_table):
    """Scan all events into a list of items."""
    items = []
    kwargs = {}
    while True:
        resp = events_table.scan(**kwargs)
        items.extend(resp.get('Items', []))
        key = resp.get('LastEvaluatedKey')
        if not key:
            break
        kwargs['ExclusiveStartKey'] = key
    return items


def event_date(item):
    """Return the calendar date of an event's start_time, or None."""
    st = item.get('start_time')
    if not st:
        return None
    try:
        dt = datetime.fromisoformat(st.replace('Z', '+00:00'))
        return dt.date()
    except (ValueError, AttributeError):
        return None


def build_metrics(bags, estimated_lbs, tires=0):
    """Build the cleanup_metrics map, treating estimated_lbs as total truth."""
    bags = int(bags)
    tires = int(tires)
    total = Decimal(str(estimated_lbs))
    large = total - (bags * LBS_PER_BAG)
    if large < 0:
        large = Decimal(0)
    return {
        'bags_of_trash': bags,
        'number_of_tires': tires,
        'large_items_weight_lbs': large,
        'total_litter_lbs': total,
    }


def make_adhoc_event(row_date, location, metrics, volunteer_count, event_hours):
    """Build a new ad hoc event item for an unmatched CSV row."""
    # Noon local-ish start so the date renders correctly regardless of tz.
    start_dt = datetime(row_date.year, row_date.month, row_date.day, 9, 0, 0,
                        tzinfo=timezone(timedelta(hours=-4)))
    hours = to_int(event_hours, 2) or 2
    end_dt = start_dt + timedelta(hours=hours)
    now = datetime.now(timezone.utc).isoformat()
    event_id = f"adhoc-{row_date.isoformat()}-{slugify(location)}"[:120]
    return {
        'event_id': event_id,
        'title': location.strip(),
        'description': 'Community cleanup (historical record).',
        'start_time': start_dt.isoformat(),
        'end_time': end_dt.isoformat(),
        'location': {'name': location.strip(), 'address': ''},
        'status': 'completed',
        'ad_hoc': True,
        'private': True,
        'attendance_cap': 0,
        'volunteer_count': int(volunteer_count),
        'cleanup_metrics': metrics,
        'created_at': now,
        'updated_at': now,
    }


def main():
    parser = argparse.ArgumentParser(description='Backfill event cleanup metrics from a CSV')
    parser.add_argument('--csv', required=True, help='Path to the CSV file')
    parser.add_argument('--environment', default='production',
                        help='Target environment (production or staging). Default: production')
    parser.add_argument('--apply', action='store_true',
                        help='Apply changes (default is dry run)')
    args = parser.parse_args()

    suffix = table_suffix(args.environment)
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    events_table = dynamodb.Table(f'events{suffix}')

    print(f"Environment: {args.environment} (events{suffix})")
    print(f"Mode: {'APPLY' if args.apply else 'DRY RUN'}\n")

    # Load and index existing events by calendar date.
    existing = load_events(events_table)
    by_date = {}
    for item in existing:
        d = event_date(item)
        if d:
            by_date.setdefault(d, []).append(item)
    print(f"Loaded {len(existing)} existing events.\n")

    with open(args.csv, newline='') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    updates = []   # (event_id, metrics, volunteer_count, matched_title)
    creations = []  # ad hoc event items

    for row in rows:
        # The CSV may contain trailing blank rows (and stray trailing commas
        # create empty cells). Skip any row without a usable date + location.
        date_raw = (row.get('Date') or '').strip()
        location = (row.get('Location') or '').strip()
        if not date_raw or not location:
            continue

        try:
            row_date = parse_date(date_raw)
        except ValueError:
            print(f"  WARN skipping row with unparseable date: {date_raw!r}")
            continue

        bags = to_int(row.get('Trash Bags'))
        estimated = to_int(row.get('Estimated Pounds'))
        volunteers = to_int(row.get('Volunteers'))
        tires = to_int(get_tires(row))
        event_hours = row.get('EventHours', 2)

        metrics = build_metrics(bags, estimated, tires)

        candidates = by_date.get(row_date, [])
        # Prefer a candidate that isn't already ad hoc; if multiple, disambiguate
        # by location token overlap, else take the first.
        match = None
        if candidates:
            non_adhoc = [c for c in candidates if not c.get('ad_hoc')]
            pool = non_adhoc or candidates
            if len(pool) == 1:
                match = pool[0]
            else:
                loc_tokens = set(slugify(location).split('-'))
                best, best_score = None, 0
                for c in pool:
                    name = c.get('location', {}).get('name', '') or c.get('title', '')
                    score = len(loc_tokens & set(slugify(name).split('-')))
                    if score > best_score:
                        best, best_score = c, score
                match = best or pool[0]

        if match:
            updates.append((match['event_id'], metrics, volunteers,
                            match.get('title', match['event_id']), row_date, location))
        else:
            creations.append(make_adhoc_event(row_date, location, metrics, volunteers, event_hours))

    # Report
    print(f"{'='*72}")
    print(f"Matched existing events to update: {len(updates)}")
    print(f"Ad hoc events to create:           {len(creations)}")
    print(f"{'='*72}\n")

    print("UPDATES (existing events):")
    for event_id, metrics, vols, title, row_date, loc in updates:
        print(f"  {row_date}  '{loc}' -> {event_id}")
        print(f"      bags={metrics['bags_of_trash']} tires={metrics['number_of_tires']} "
              f"total_lbs={metrics['total_litter_lbs']} volunteers={vols} [matched: {title}]")

    print("\nAD HOC (new events):")
    for item in creations:
        cm = item['cleanup_metrics']
        print(f"  {item['start_time'][:10]}  '{item['title']}' -> {item['event_id']}")
        print(f"      bags={cm['bags_of_trash']} total_lbs={cm['total_litter_lbs']} "
              f"volunteers={item['volunteer_count']}")

    if not args.apply:
        print("\nRun with --apply to write these changes.")
        sys.exit(0)

    print("\nApplying...")
    updated = errors = created = 0

    for event_id, metrics, vols, title, row_date, loc in updates:
        try:
            events_table.update_item(
                Key={'event_id': event_id},
                UpdateExpression=('SET cleanup_metrics = :cm, volunteer_count = :v, '
                                  'updated_at = :now'),
                ExpressionAttributeValues={
                    ':cm': metrics,
                    ':v': int(vols),
                    ':now': datetime.now(timezone.utc).isoformat(),
                },
                ConditionExpression='attribute_exists(event_id)',
            )
            print(f"  UPDATED {event_id}")
            updated += 1
        except Exception as e:
            print(f"  ERROR updating {event_id}: {e}")
            errors += 1

    for item in creations:
        try:
            # Don't overwrite an ad hoc event that already exists (idempotent re-runs).
            events_table.put_item(
                Item=item,
                ConditionExpression='attribute_not_exists(event_id)',
            )
            print(f"  CREATED {item['event_id']}")
            created += 1
        except Exception as e:
            code = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
            if code == 'ConditionalCheckFailedException':
                print(f"  SKIP (exists) {item['event_id']}")
            else:
                print(f"  ERROR creating {item['event_id']}: {e}")
                errors += 1

    print(f"\nDone. Updated: {updated}, Created: {created}, Errors: {errors}")


if __name__ == '__main__':
    main()
