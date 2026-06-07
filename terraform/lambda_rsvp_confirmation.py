"""
RSVP confirmation email sender.

Triggered by the event-rsvp SNS topic (the same notification the RSVP submit
lambda already publishes for admins). For each RSVP it sends the volunteer a
thank-you email that includes:
  - a friendly thank-you and the event details
  - an "Add to Google Calendar" link
  - an attached .ics calendar invite (works with Apple Calendar, Outlook, etc.)

The email is sent via SES SendRawEmail because we need a multipart message to
carry the .ics attachment. Failures are logged but never raised: a confirmation
email must never break or retry the RSVP itself (the RSVP is already committed
by the time SNS fires).
"""
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

import boto3
from botocore.exceptions import ClientError

aws_region = os.environ.get('AWS_REGION', 'us-east-1')
dynamodb = boto3.resource('dynamodb', region_name=aws_region)
ses_client = boto3.client('ses', region_name=aws_region)

events_table = dynamodb.Table(os.environ.get('EVENTS_TABLE_NAME', 'events'))

SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'info@waterwaycleanups.org')
SITE_URL = os.environ.get('SITE_URL', 'https://waterwaycleanups.org').rstrip('/')
ORG_NAME = 'Waterway Cleanups'


def parse_iso(dt_str):
    """Parse an ISO timestamp into an aware UTC datetime, or None."""
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, AttributeError):
        return None


def format_event_date(start_dt, end_dt):
    """Human-friendly local-ish date range for display in the email body."""
    if not start_dt:
        return 'Date to be announced'
    # Times are stored with their offset; display in that original offset.
    date_str = start_dt.strftime('%A, %B %-d, %Y')
    start_t = start_dt.strftime('%-I:%M %p')
    if end_dt:
        end_t = end_dt.strftime('%-I:%M %p')
        return f"{date_str} from {start_t} to {end_t}"
    return f"{date_str} at {start_t}"


def location_string(location):
    """Flatten the event location dict into a single display string."""
    if not isinstance(location, dict):
        return ''
    return ', '.join(filter(None, [location.get('name'), location.get('address')]))


def ics_escape(text):
    """Escape a value for inclusion in an iCalendar field."""
    if not text:
        return ''
    return (str(text)
            .replace('\\', '\\\\')
            .replace(';', '\\;')
            .replace(',', '\\,')
            .replace('\n', '\\n'))


def build_ics(event_id, title, description, location, start_dt, end_dt, event_url):
    """Build a minimal but valid VEVENT calendar invite as a string."""
    def fmt(dt):
        return dt.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')

    # Default to a 2-hour event if no end time is known.
    if start_dt and not end_dt:
        end_dt = start_dt + timedelta(hours=2)

    now_stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    uid = f"{event_id}-{uuid.uuid4().hex}@waterwaycleanups.org"

    desc_parts = []
    if description:
        desc_parts.append(description)
    if event_url:
        desc_parts.append(f"Event details: {event_url}")
    desc_parts.append("Thank you for volunteering with Waterway Cleanups!")
    full_desc = '\\n\\n'.join(ics_escape(p) for p in desc_parts)

    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Waterway Cleanups//RSVP//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        f'UID:{uid}',
        f'DTSTAMP:{now_stamp}',
        f'DTSTART:{fmt(start_dt)}',
        f'DTEND:{fmt(end_dt)}',
        f'SUMMARY:{ics_escape(title)}',
        f'DESCRIPTION:{full_desc}',
        f'LOCATION:{ics_escape(location)}',
        f'URL:{ics_escape(event_url)}',
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        f'DESCRIPTION:{ics_escape(title)}',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ]
    return '\r\n'.join(lines) + '\r\n'


def google_calendar_link(title, description, location, start_dt, end_dt, event_url):
    """Build an 'Add to Google Calendar' URL."""
    from urllib.parse import urlencode

    if start_dt and not end_dt:
        end_dt = start_dt + timedelta(hours=2)

    def fmt(dt):
        return dt.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')

    details = description or ''
    if event_url:
        details = (details + f"\n\nEvent details: {event_url}").strip()

    params = {
        'action': 'TEMPLATE',
        'text': title,
        'dates': f"{fmt(start_dt)}/{fmt(end_dt)}",
        'details': details,
        'location': location or '',
    }
    return 'https://www.google.com/calendar/render?' + urlencode(params)


def build_html(first_name, title, date_display, location, event_url, gcal_link):
    greeting = f"Hi {first_name}," if first_name else "Hi there,"
    safe_location_block = f'<br/>{location}' if location else ''
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background:#f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background:#ffffff;">
    <div style="background-color: #166534; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
      <h2 style="margin: 0;">You're registered! 🌊</h2>
    </div>
    <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
      <p style="font-size:16px;">{greeting}</p>
      <p style="line-height:1.6;">
        Thank you for signing up to volunteer with {ORG_NAME}! Your time and effort
        help keep our local waterways clean and healthy. We can't wait to see you there.
      </p>
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px; margin:20px 0;">
        <div style="font-weight:700; font-size:16px; color:#166534;">{title}</div>
        <div style="color:#374151; margin-top:6px;">{date_display}{safe_location_block}</div>
      </div>
      <p style="margin:24px 0;">
        <a href="{gcal_link}"
           style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none;
                  padding:12px 20px; border-radius:6px; font-weight:600;">
          ➕ Add to Google Calendar
        </a>
      </p>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">
        A calendar invite (.ics) is attached to this email — open it to add the event to
        Apple Calendar, Outlook, or any other calendar app.
      </p>
      <p style="color:#4b5563; font-size:14px; line-height:1.6;">
        Need to cancel or change your RSVP? Log in at
        <a href="{event_url}">{event_url}</a>. If you have any questions, just reply to this email.
      </p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />
      <p style="color:#9ca3af; font-size:12px;">
        You're receiving this because you RSVP'd for this event with {ORG_NAME}.
      </p>
    </div>
  </div>
</body>
</html>"""


def build_text(first_name, title, date_display, location, event_url, gcal_link):
    greeting = f"Hi {first_name}," if first_name else "Hi there,"
    lines = [
        greeting,
        '',
        f"Thank you for signing up to volunteer with {ORG_NAME}! Your time helps keep "
        "our local waterways clean and healthy. We can't wait to see you there.",
        '',
        f"Event: {title}",
        f"When: {date_display}",
    ]
    if location:
        lines.append(f"Where: {location}")
    lines += [
        '',
        f"Add to Google Calendar: {gcal_link}",
        "An .ics calendar invite is attached so you can add this to any calendar app.",
        '',
        f"Need to cancel or change your RSVP? Log in at {event_url}.",
        "Questions? Just reply to this email.",
        '',
        f"You're receiving this because you RSVP'd for this event with {ORG_NAME}.",
    ]
    return '\n'.join(lines)


def send_confirmation(to_email, first_name, event_data):
    """Build and send one confirmation email with an .ics attachment."""
    title = event_data.get('title', 'Waterway Cleanup')
    description = event_data.get('description', '')
    location = location_string(event_data.get('location'))
    start_dt = parse_iso(event_data.get('start_time'))
    end_dt = parse_iso(event_data.get('end_time'))
    date_display = format_event_date(start_dt, end_dt)

    slug = event_data.get('hugo_slug') or event_data.get('event_id')
    event_url = f"{SITE_URL}/events/{slug}/" if slug else f"{SITE_URL}/volunteer/"

    gcal_link = google_calendar_link(title, description, location, start_dt, end_dt, event_url) \
        if start_dt else event_url

    msg = MIMEMultipart('mixed')
    msg['Subject'] = f"You're registered: {title}"
    msg['From'] = f"{ORG_NAME} <{SENDER_EMAIL}>"
    msg['To'] = to_email
    msg['Reply-To'] = SENDER_EMAIL

    body = MIMEMultipart('alternative')
    body.attach(MIMEText(build_text(first_name, title, date_display, location, event_url, gcal_link),
                         'plain', 'utf-8'))
    body.attach(MIMEText(build_html(first_name, title, date_display, location, event_url, gcal_link),
                         'html', 'utf-8'))
    msg.attach(body)

    # Attach the .ics invite only when we have a real start time.
    if start_dt:
        ics = build_ics(event_data.get('event_id', 'event'), title, description, location,
                        start_dt, end_dt, event_url)
        part = MIMEApplication(ics.encode('utf-8'), _subtype='octet-stream')
        part.add_header('Content-Type', 'text/calendar; method=PUBLISH; name="invite.ics"')
        part.add_header('Content-Disposition', 'attachment; filename="invite.ics"')
        msg.attach(part)

    ses_client.send_raw_email(
        Source=SENDER_EMAIL,
        Destinations=[to_email],
        RawMessage={'Data': msg.as_string()},
    )


def first_name_for(message, event_data):
    """Pick a first name for the greeting from the RSVP attendees, falling back to none."""
    for att in message.get('attendees', []):
        if att.get('type') == 'volunteer' and att.get('first_name'):
            return att.get('first_name')
    return ''


def handle_record(record):
    """Process a single SNS record (one RSVP notification)."""
    try:
        message = json.loads(record['Sns']['Message'])
    except (KeyError, json.JSONDecodeError) as e:
        print(f"Skipping record with unparseable SNS message: {e}")
        return

    to_email = message.get('guardian_email')
    if not to_email:
        print("No guardian_email in message; skipping")
        return

    event_id = message.get('event_id')
    if not event_id:
        print("No event_id in message; skipping")
        return

    try:
        resp = events_table.get_item(Key={'event_id': event_id})
        event_data = resp.get('Item')
    except Exception as e:
        print(f"Error fetching event {event_id}: {e}")
        return

    if not event_data:
        print(f"Event {event_id} not found; skipping confirmation")
        return

    event_data.setdefault('event_id', event_id)
    first_name = first_name_for(message, event_data)

    try:
        send_confirmation(to_email, first_name, event_data)
        print(f"Confirmation email sent to {to_email} for event {event_id}")
    except ClientError as e:
        print(f"SES error sending confirmation to {to_email}: {e}")
    except Exception as e:
        print(f"Unexpected error sending confirmation to {to_email}: {e}")


def handler(event, context):
    """Lambda entry point — SNS can batch multiple records."""
    records = event.get('Records', [])
    for record in records:
        if record.get('EventSource') == 'aws:sns' or record.get('Sns'):
            handle_record(record)
    return {'statusCode': 200, 'processed': len(records)}
