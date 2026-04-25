import json
import os
import boto3
from decimal import Decimal
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
volunteers_table = dynamodb.Table(os.environ.get('VOLUNTEERS_TABLE_NAME'))
rsvps_table = dynamodb.Table(os.environ.get('RSVPS_TABLE_NAME'))
events_table = dynamodb.Table(os.environ.get('EVENTS_TABLE_NAME'))


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def scan_all(table):
    items = []
    response = table.scan()
    items.extend(response.get('Items', []))
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response.get('Items', []))
    return items


def handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Content-Type': 'application/json'
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    try:
        now = datetime.now(timezone.utc)

        # Load all events
        all_events = {}
        for ev in scan_all(events_table):
            all_events[ev['event_id']] = ev

        # Build set of public event IDs sorted by date for streak calc
        public_events_chrono = []
        for eid, ev in all_events.items():
            if not ev.get('private', False) and ev.get('start_time'):
                try:
                    dt = datetime.fromisoformat(ev['start_time'].replace('Z', '+00:00'))
                    if dt <= now:
                        public_events_chrono.append((dt, eid))
                except Exception:
                    pass
        public_events_chrono.sort(key=lambda x: x[0])

        # Load all RSVPs grouped by email (exclude minors)
        rsvps_by_email = {}
        for rsvp in scan_all(rsvps_table):
            if rsvp.get('attendee_type') == 'minor':
                continue
            email = rsvp.get('email', '').lower()
            if email:
                rsvps_by_email.setdefault(email, []).append(rsvp)

        # Load volunteers for display names
        volunteers = {}
        for vol in scan_all(volunteers_table):
            volunteers[vol.get('email', '').lower()] = vol

        # Compute leaderboard
        excluded_emails = {'jesse@techno-geeks.org', 'jesse@waterwaycleanups.org'}
        leaderboard = []
        for email, rsvps in rsvps_by_email.items():
            attended = 0
            cancelled = 0
            no_shows = 0
            future_rsvps = 0
            attended_public_eids = set()

            for rsvp in rsvps:
                status = rsvp.get('status', 'active')
                eid = rsvp.get('event_id', '')
                ev = all_events.get(eid, {})
                is_private = ev.get('private', False)

                if status == 'attended':
                    attended += 1
                    if not is_private:
                        attended_public_eids.add(eid)
                elif status == 'cancelled':
                    cancelled += 1
                elif status == 'no_show' or rsvp.get('no_show'):
                    no_shows += 1
                elif status == 'active':
                    st = ev.get('start_time')
                    if st:
                        try:
                            if datetime.fromisoformat(st.replace('Z', '+00:00')) > now:
                                future_rsvps += 1
                        except Exception:
                            pass

            # Streak
            streak = 0
            current_streak = 0
            for _, eid in public_events_chrono:
                if eid in attended_public_eids:
                    current_streak += 1
                    streak = max(streak, current_streak)
                else:
                    current_streak = 0

            # A streak of 1 doesn't count
            if streak < 2:
                streak = 0

            # Points (uncapped)
            points = max(0,
                (attended * 10) +
                (streak * 5) +
                (future_rsvps * 3) -
                (cancelled * 2) -
                (no_shows * 5)
            )

            if attended == 0:
                continue

            vol = volunteers.get(email, {})
            first = vol.get('first_name', '')
            last = vol.get('last_name', '')

            # Fall back to name from RSVP data if volunteer record has no name
            if not first:
                for rsvp in rsvps:
                    rsvp_first = rsvp.get('first_name', '')
                    rsvp_last = rsvp.get('last_name', '')
                    if rsvp_first:
                        first = rsvp_first
                        last = rsvp_last or last
                        break

            display_pref = vol.get('leaderboard_display', 'initial')

            if display_pref == 'anonymous':
                display_name = 'Volunteer User'
            elif display_pref == 'full':
                display_name = f"{first} {last}".strip() if first else email.split('@')[0]
            else:
                # Default: first name + last initial
                if first and last:
                    display_name = f"{first} {last[0]}."
                elif first:
                    display_name = first
                else:
                    display_name = email.split('@')[0]

            leaderboard.append({
                'name': display_name,
                'points': points,
                'events_attended': attended,
                'streak': streak,
                'future_rsvps': future_rsvps,
                '_email': email  # internal, stripped before response
            })

        # Sort by points descending
        leaderboard.sort(key=lambda x: -x['points'])

        # Check if a specific user's rank was requested
        query_params = event.get('queryStringParameters') or {}
        lookup_email = (query_params.get('email') or '').lower().strip()
        my_rank = None
        if lookup_email:
            for i, entry in enumerate(leaderboard):
                if entry['_email'] == lookup_email:
                    my_rank = {
                        'rank': i + 1,
                        'name': entry['name'],
                        'points': entry['points'],
                        'events_attended': entry['events_attended'],
                        'streak': entry['streak'],
                        'future_rsvps': entry['future_rsvps'],
                        'total': len(leaderboard)
                    }
                    break

        # Top 50 for public list, strip internal fields, exclude admin emails
        excluded_emails = {'jesse@techno-geeks.org', 'jesse@waterwaycleanups.org'}
        public_leaderboard = []
        for entry in leaderboard:
            if entry['_email'] in excluded_emails:
                continue
            public_leaderboard.append({
                'name': entry['name'],
                'points': entry['points'],
                'events_attended': entry['events_attended'],
                'streak': entry['streak'],
                'future_rsvps': entry['future_rsvps']
            })
            if len(public_leaderboard) >= 50:
                break

        result = {
            'success': True,
            'leaderboard': public_leaderboard,
            'updated_at': now.isoformat()
        }
        if my_rank:
            result['my_rank'] = my_rank

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(result, default=decimal_default)
        }

    except Exception as e:
        print(f"Leaderboard error: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'message': 'Failed to load leaderboard'})
        }
