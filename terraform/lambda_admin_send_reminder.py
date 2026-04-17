import json
import os
import boto3
from datetime import datetime
from botocore.exceptions import ClientError

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
ses_client = boto3.client('ses')

# Environment variables
session_table_name = os.environ.get('SESSION_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
events_table_name = os.environ.get('EVENTS_TABLE_NAME')

session_table = dynamodb.Table(session_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
events_table = dynamodb.Table(events_table_name)

ADMIN_EMAILS = [
    'admin@waterwaycleanups.org',
    'contact@waterwaycleanups.org',
    'jesse@techno-geeks.org',
    'jesse@waterwaycleanups.org'
]

SENDER_EMAIL = 'info@waterwaycleanups.org'


def validate_admin_session(session_token):
    """Validate session token and check admin access."""
    try:
        response = session_table.get_item(Key={'session_token': session_token})
        if 'Item' not in response:
            return None
        session = response['Item']
        email = session.get('email', '').lower()
        is_admin = session.get('isAdmin', 'false')
        if is_admin == 'true' or email in ADMIN_EMAILS:
            return session
        return None
    except Exception as e:
        print(f"Session validation error: {e}")
        return None


def format_event_date(start_time):
    """Format event start_time for display in emails."""
    if not start_time:
        return 'Date TBD'
    try:
        dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        return dt.strftime('%A, %B %d, %Y at %I:%M %p')
    except Exception:
        return 'Date TBD'


def build_email_html(event_title, event_date, location_str, message_body):
    """Build the HTML email content."""
    # Escape HTML in user message
    safe_message = (message_body
                    .replace('&', '&amp;')
                    .replace('<', '&lt;')
                    .replace('>', '&gt;')
                    .replace('\n', '<br/>'))

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 0 auto;">
        <div style="background-color: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Waterway Cleanups</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #6b7280; font-size: 14px; margin-top: 0;">
            Regarding: <strong>{event_title}</strong><br/>
            {event_date}{'<br/>' + location_str if location_str else ''}
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <div style="line-height: 1.6;">{safe_message}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            You're receiving this because you RSVP'd for this event.
            If you have questions, reply to this email.
          </p>
        </div>
      </div>
    </body>
    </html>
    """


def handle_generate(headers, event_data, event_title, event_date, location_str):
    """Use Bedrock to generate a short reminder message draft."""
    try:
        bedrock = boto3.client('bedrock-runtime')
        description = event_data.get('description', '')

        prompt = (
            f"Write a short, friendly reminder message (3-4 sentences max) for volunteers who RSVP'd for "
            f"a waterway cleanup event. The tone should be warm and casual.\n\n"
            f"Event: {event_title}\n"
            f"Date: {event_date}\n"
            f"Location: {location_str}\n"
            f"{f'Description: {description[:200]}' if description else ''}\n\n"
            f"Just write the message body — no subject line, no greeting like 'Dear volunteer', "
            f"no sign-off. Keep it under 4 sentences."
        )

        response = bedrock.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0',
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 256,
                'messages': [{'role': 'user', 'content': prompt}]
            })
        )

        result = json.loads(response['body'].read())
        generated = result.get('content', [{}])[0].get('text', '').strip()

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'success': True, 'generated_message': generated})
        }
    except Exception as e:
        print(f"Bedrock generate error: {e}")
        # Fallback to a simple template if Bedrock fails
        fallback = (
            f"Just a friendly reminder about our upcoming cleanup at {location_str or 'the scheduled location'} "
            f"on {event_date}. We're looking forward to seeing you there! "
            f"Please let us know if you have any questions or if your plans have changed."
        )
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'success': True, 'generated_message': fallback, 'fallback': True})
        }


def handler(event, context):
    """Lambda handler for sending reminder messages to event RSVPs."""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Content-Type': 'application/json'
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': json.dumps({'message': 'CORS preflight successful'})}

    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': headers, 'body': json.dumps({'success': False, 'message': 'Method Not Allowed'})}

    try:
        body = json.loads(event.get('body', '{}'))

        session_token = body.get('session_token')
        if not session_token:
            return {'statusCode': 401, 'headers': headers, 'body': json.dumps({'success': False, 'message': 'Session token is required'})}

        session = validate_admin_session(session_token)
        if not session:
            return {'statusCode': 403, 'headers': headers, 'body': json.dumps({'success': False, 'message': 'Admin access required'})}

        action = body.get('action', 'send')
        event_id = body.get('event_id')

        if not event_id:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'event_id is required'})}

        # Fetch event details
        event_result = events_table.get_item(Key={'event_id': event_id})
        if 'Item' not in event_result:
            return {'statusCode': 404, 'headers': headers, 'body': json.dumps({'success': False, 'message': 'Event not found'})}

        event_data = event_result['Item']
        event_title = event_data.get('title', event_id)
        event_date = format_event_date(event_data.get('start_time'))
        location = event_data.get('location', {})
        location_str = ' — '.join(filter(None, [location.get('name'), location.get('address')]))

        # Handle generate action — use Bedrock to draft a message
        if action == 'generate':
            return handle_generate(headers, event_data, event_title, event_date, location_str)

        # Send action — validate remaining fields
        subject = body.get('subject', '').strip()
        message = body.get('message', '').strip()

        if not subject or not message:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'subject and message are required'})}

        # Fetch active RSVPs for this event
        from boto3.dynamodb.conditions import Key as DDBKey
        rsvp_result = rsvps_table.query(
            KeyConditionExpression=DDBKey('event_id').eq(event_id)
        )
        rsvps = [r for r in (rsvp_result.get('Items', []))
                 if r.get('status') != 'cancelled' and r.get('no_show') is not True]

        if not rsvps:
            return {'statusCode': 200, 'headers': headers,
                    'body': json.dumps({'success': True, 'message': 'No active RSVPs to message', 'sent': 0})}

        # Collect unique emails
        emails = list(set(r.get('email') for r in rsvps if r.get('email')))

        if not emails:
            return {'statusCode': 200, 'headers': headers,
                    'body': json.dumps({'success': True, 'message': 'No email addresses found in RSVPs', 'sent': 0})}

        admin_email = session.get('email', SENDER_EMAIL)
        full_subject = f"[{event_title}] {subject}"
        html_body = build_email_html(event_title, event_date, location_str, message)
        text_body = f"Waterway Cleanups\n\nRegarding: {event_title}\n{event_date}\n{location_str}\n\n{message}\n\n---\nYou're receiving this because you RSVP'd for this event."

        # Send in batches of 50 (SES limit)
        sent = 0
        failed = 0
        batch_size = 50

        for i in range(0, len(emails), batch_size):
            batch = emails[i:i + batch_size]
            try:
                ses_client.send_email(
                    Source=SENDER_EMAIL,
                    Destination={'BccAddresses': batch},
                    ReplyToAddresses=[SENDER_EMAIL],
                    Message={
                        'Subject': {'Data': full_subject, 'Charset': 'UTF-8'},
                        'Body': {
                            'Html': {'Data': html_body, 'Charset': 'UTF-8'},
                            'Text': {'Data': text_body, 'Charset': 'UTF-8'}
                        }
                    }
                )
                sent += len(batch)
            except ClientError as e:
                print(f"SES error for batch starting at {i}: {e}")
                failed += len(batch)

        print(f"Reminder sent by {admin_email} for event {event_id}: {sent} sent, {failed} failed")

        result_msg = f"Message sent to {sent} attendee{'s' if sent != 1 else ''}"
        if failed > 0:
            result_msg += f" ({failed} failed)"

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': result_msg,
                'sent': sent,
                'failed': failed,
                'total_recipients': len(emails)
            })
        }

    except Exception as e:
        print(f"Error sending reminder: {e}")
        return {'statusCode': 500, 'headers': headers, 'body': json.dumps({'success': False, 'message': 'Internal server error'})}
