"""
Lambda function to graduate an aged-out minor to a full volunteer account.
- Creates a volunteer record with the minor's own email
- Re-attributes past RSVP records to the new email (keeps attendee_type as 'minor')
- Marks the minor record as graduated
- Preserves guardian_email on all historical records for audit trail
"""
import json
import os
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')
minors_table = dynamodb.Table(os.environ.get('MINORS_TABLE_NAME', 'minors'))
volunteers_table = dynamodb.Table(os.environ.get('VOLUNTEERS_TABLE_NAME', 'volunteers'))
rsvps_table = dynamodb.Table(os.environ.get('RSVPS_TABLE_NAME', 'event_rsvps'))
session_table = dynamodb.Table(os.environ.get('SESSION_TABLE_NAME', 'auth_sessions'))


def validate_session(session_token):
    try:
        resp = session_table.get_item(Key={'session_token': session_token})
        session = resp.get('Item')
        if not session:
            return None
        expires_at_str = session['expires_at']
        if not expires_at_str.endswith('Z') and '+' not in expires_at_str and '-' not in expires_at_str[10:]:
            expires_at_str += '+00:00'
        expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
        if expires_at <= datetime.now(timezone.utc):
            return None
        return session
    except Exception as e:
        print(f"Session validation error: {e}")
        return None


def handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Content-Type': 'application/json'
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': headers,
                'body': json.dumps({'success': False, 'message': 'Method Not Allowed'})}

    try:
        body = json.loads(event.get('body', '{}'))

        session_token = body.get('session_token')
        if not session_token:
            return {'statusCode': 401, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'Session token required'})}

        session = validate_session(session_token)
        if not session:
            return {'statusCode': 401, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'Invalid or expired session'})}

        guardian_email = session['email']
        minor_id = body.get('minor_id', '').strip()
        new_email = body.get('email', '').strip().lower()

        if not minor_id or not new_email:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'minor_id and email are required'})}

        # Basic email validation
        if '@' not in new_email or '.' not in new_email:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'Invalid email address'})}

        # Fetch the minor record
        try:
            minor_resp = minors_table.get_item(
                Key={'guardian_email': guardian_email, 'minor_id': minor_id}
            )
        except ClientError as e:
            print(f"Error fetching minor: {e}")
            return {'statusCode': 500, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'Failed to fetch minor record'})}

        if 'Item' not in minor_resp:
            return {'statusCode': 404, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'Minor not found'})}

        minor = minor_resp['Item']

        # Verify they're actually aged out
        from datetime import date
        try:
            dob = datetime.strptime(minor['date_of_birth'], '%Y-%m-%d').date()
            today = date.today()
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except Exception:
            age = 0

        if age < 18:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'Minor is not yet 18'})}

        if minor.get('graduated'):
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'success': False, 'message': 'This minor has already been graduated'})}

        # Check if the new email is already a volunteer
        vol_resp = volunteers_table.get_item(Key={'email': new_email})
        if 'Item' in vol_resp:
            return {'statusCode': 409, 'headers': headers,
                    'body': json.dumps({'success': False,
                                        'message': 'A volunteer account already exists with this email'})}

        now = datetime.now(timezone.utc).isoformat()
        first_name = minor.get('first_name', '').strip()
        last_name = minor.get('last_name', '').strip()

        # 1. Create volunteer record
        volunteers_table.put_item(Item={
            'email': new_email,
            'first_name': first_name,
            'last_name': last_name,
            'full_name': f"{first_name} {last_name}".strip(),
            'date_of_birth': minor.get('date_of_birth'),
            'graduated_from': {
                'guardian_email': guardian_email,
                'minor_id': minor_id,
                'graduated_at': now
            },
            'created_at': now,
            'updated_at': now
        })

        # 2. Re-attribute past RSVP records
        #    Find RSVPs where this minor was an attendee (guardian's email + minor as attendee_id)
        rsvps_updated = 0
        try:
            # Scan for RSVPs with this minor's attendee_id pattern
            # Minor attendee_ids are typically formatted as "minor_{minor_id}" or the guardian email
            # We need to find RSVPs that match this minor specifically
            scan_resp = rsvps_table.scan(
                FilterExpression='email = :ge AND attendee_type = :at AND first_name = :fn AND last_name = :ln',
                ExpressionAttributeValues={
                    ':ge': guardian_email,
                    ':at': 'minor',
                    ':fn': first_name,
                    ':ln': last_name
                }
            )
            minor_rsvps = scan_resp.get('Items', [])

            for rsvp in minor_rsvps:
                try:
                    # Update the email to the new one, keep everything else
                    rsvps_table.update_item(
                        Key={
                            'event_id': rsvp['event_id'],
                            'attendee_id': rsvp['attendee_id']
                        },
                        UpdateExpression='SET email = :ne, graduated_email = :ne, original_guardian_email = :ge, updated_at = :now',
                        ExpressionAttributeValues={
                            ':ne': new_email,
                            ':ge': guardian_email,
                            ':now': now
                        }
                    )
                    rsvps_updated += 1
                except Exception as e:
                    print(f"Error updating RSVP {rsvp['event_id']}: {e}")
        except Exception as e:
            print(f"Error scanning RSVPs for minor: {e}")

        # 3. Mark the minor record as graduated
        minors_table.update_item(
            Key={'guardian_email': guardian_email, 'minor_id': minor_id},
            UpdateExpression='SET graduated = :t, graduated_at = :now, graduated_email = :ne',
            ExpressionAttributeValues={
                ':t': True,
                ':now': now,
                ':ne': new_email
            }
        )

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': f'{first_name} has been graduated to a full volunteer account ({new_email}). {rsvps_updated} past event records were transferred.',
                'new_email': new_email,
                'rsvps_transferred': rsvps_updated
            })
        }

    except Exception as e:
        print(f"Graduation error: {e}")
        return {'statusCode': 500, 'headers': headers,
                'body': json.dumps({'success': False, 'message': 'Internal server error'})}
