"""
Lambda function to capture a volunteer's first/last name at first login.

This is the single place that guarantees we always have a name for a volunteer
before they can RSVP. It is called by the frontend immediately after a
successful code verification when `profile_complete` is false.

It:
  1. Upserts the volunteers table record with first_name/last_name/full_name
     (without clobbering an existing name).
  2. Creates or updates the SES contact so the newsletter firstName attribute
     is always populated (create_contact, then update_contact on AlreadyExists).

It is intentionally tolerant: a failure to write the SES contact must never
block the volunteer from proceeding, but it is logged for follow-up.
"""
import json
import os
import re
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')
sesv2 = boto3.client('sesv2')

sessions_table = dynamodb.Table(os.environ.get('SESSIONS_TABLE_NAME', 'auth_sessions'))
volunteers_table = dynamodb.Table(os.environ.get('VOLUNTEERS_TABLE_NAME', 'volunteers'))

CONTACT_LIST_NAME = os.environ.get('CONTACT_LIST_NAME', 'WaterwayCleanups')
TOPIC_NAME = os.environ.get('TOPIC_NAME', 'volunteer')

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
}

MAX_NAME_LENGTH = 100


def respond(status_code, body):
    return {'statusCode': status_code, 'headers': HEADERS, 'body': json.dumps(body)}


def validate_session(session_token):
    """Return the session email if the token is valid and unexpired, else None."""
    if not session_token:
        return None
    try:
        resp = sessions_table.get_item(Key={'session_token': session_token})
        session = resp.get('Item')
        if not session:
            return None
        expires_at = session.get('expires_at', '')
        if expires_at:
            normalized = expires_at.replace('Z', '+00:00')
            try:
                expiry = datetime.fromisoformat(normalized)
                # Sessions are written with naive UTC timestamps
                # (datetime.utcnow().isoformat()), so treat a missing tzinfo as UTC
                # to avoid a naive-vs-aware comparison TypeError.
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
                if expiry <= datetime.now(timezone.utc):
                    return None
            except ValueError:
                pass  # If we can't parse it, fall through and trust the token
        return (session.get('email') or '').lower() or None
    except Exception as e:
        print(f"Session validation error: {e}")
        return None


def clean_name(value):
    """Collapse whitespace and trim a submitted name field."""
    return re.sub(r'\s+', ' ', (value or '').strip())


def upsert_volunteer(email, first_name, last_name, overwrite):
    """
    Create or update the volunteer record. When overwrite is False, existing
    non-empty names are preserved via if_not_exists.
    """
    now = datetime.now(timezone.utc).isoformat()
    full_name = f"{first_name} {last_name}".strip()
    if overwrite:
        volunteers_table.update_item(
            Key={'email': email},
            UpdateExpression=(
                'SET first_name = :fn, last_name = :ln, full_name = :full, '
                'updated_at = :now, created_at = if_not_exists(created_at, :now)'
            ),
            ExpressionAttributeValues={
                ':fn': first_name, ':ln': last_name, ':full': full_name, ':now': now,
            },
        )
    else:
        volunteers_table.update_item(
            Key={'email': email},
            UpdateExpression=(
                'SET first_name = if_not_exists(first_name, :fn), '
                'last_name = if_not_exists(last_name, :ln), '
                'full_name = if_not_exists(full_name, :full), '
                'updated_at = :now, created_at = if_not_exists(created_at, :now)'
            ),
            ExpressionAttributeValues={
                ':fn': first_name, ':ln': last_name, ':full': full_name, ':now': now,
            },
        )


def upsert_ses_contact(email, first_name, last_name):
    """
    Ensure the SES contact exists with the given name attributes.
    Returns True on success, False on failure (never raises).
    """
    attributes = json.dumps({'firstName': first_name, 'lastName': last_name})
    topic_prefs = [{'TopicName': TOPIC_NAME, 'SubscriptionStatus': 'OPT_IN'}]
    try:
        sesv2.create_contact(
            ContactListName=CONTACT_LIST_NAME,
            EmailAddress=email,
            TopicPreferences=topic_prefs,
            AttributesData=attributes,
        )
        return True
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'AlreadyExistsException':
            # Contact exists (possibly with a blank name) - fill it in.
            try:
                sesv2.update_contact(
                    ContactListName=CONTACT_LIST_NAME,
                    EmailAddress=email,
                    AttributesData=attributes,
                )
                return True
            except Exception as update_err:
                print(f"Error updating SES contact {email}: {update_err}")
                return False
        print(f"Error creating SES contact {email}: {e}")
        return False
    except Exception as e:
        print(f"Unexpected error creating SES contact {email}: {e}")
        return False


def handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return respond(200, {'message': 'CORS preflight successful'})

    if event.get('httpMethod') != 'POST':
        return respond(405, {'success': False, 'message': 'Method Not Allowed'})

    try:
        body = json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        return respond(400, {'success': False, 'message': 'Invalid JSON'})

    email = validate_session(body.get('session_token'))
    if not email:
        return respond(401, {'success': False, 'message': 'Invalid or expired session'})

    first_name = clean_name(body.get('first_name'))
    last_name = clean_name(body.get('last_name'))

    if not first_name or not last_name:
        return respond(400, {'success': False, 'message': 'First name and last name are required'})
    if len(first_name) > MAX_NAME_LENGTH or len(last_name) > MAX_NAME_LENGTH:
        return respond(400, {'success': False, 'message': 'Name is too long'})

    # By default, do not overwrite an existing name. Allow it only if the caller
    # explicitly asks (e.g. user editing their own profile).
    overwrite = bool(body.get('overwrite', False))

    try:
        upsert_volunteer(email, first_name, last_name, overwrite)
    except Exception as e:
        print(f"Error upserting volunteer record for {email}: {e}")
        return respond(500, {'success': False, 'message': 'Failed to save profile'})

    # Non-blocking: contact write failure should not stop the user.
    contact_ok = upsert_ses_contact(email, first_name, last_name)

    return respond(200, {
        'success': True,
        'message': 'Profile saved',
        'email': email,
        'first_name': first_name,
        'last_name': last_name,
        'contact_synced': contact_ok,
    })
