import json
import os
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

events_table_name = os.environ.get('EVENTS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')

events_table = dynamodb.Table(events_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Access-Control-Max-Age': '86400'
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


def respond(status_code, body):
    return {
        'statusCode': status_code,
        'headers': HEADERS,
        'body': json.dumps(body, cls=DecimalEncoder)
    }


def handle_walk_in(event_id, body):
    """Add a walk-in participant who didn't RSVP."""
    first_name = body.get('first_name', '').strip()
    last_name = body.get('last_name', '').strip()
    email = body.get('email', '').strip().lower()

    if not first_name or not last_name:
        return respond(400, {'error': 'first_name and last_name are required'})

    now = datetime.now(timezone.utc).isoformat()

    # Use email as attendee_id if provided, otherwise generate one
    if email:
        attendee_id = email
    else:
        # For walk-ins without email, use a generated ID
        attendee_id = f"walkin-{first_name.lower()}-{last_name.lower()}-{int(datetime.now(timezone.utc).timestamp())}"

    # Check if this attendee already has an RSVP for this event
    if email:
        try:
            existing = rsvps_table.get_item(Key={'event_id': event_id, 'attendee_id': attendee_id})
            if 'Item' in existing:
                return respond(409, {'error': f'{first_name} {last_name} already has an RSVP for this event'})
        except ClientError:
            pass

    item = {
        'event_id': event_id,
        'attendee_id': attendee_id,
        'attendee_type': 'volunteer',
        'status': 'attended',
        'first_name': first_name,
        'last_name': last_name,
        'email': email or '',
        'guardian_email': email or '',
        'no_show': False,
        'walk_in': True,
        'created_at': now,
        'updated_at': now,
    }

    try:
        rsvps_table.put_item(Item=item)
    except ClientError as e:
        print(f"Error creating walk-in RSVP: {e}")
        return respond(500, {'error': 'Failed to add walk-in participant'})

    # Create/update volunteer record if email provided
    if email:
        try:
            volunteers_table.update_item(
                Key={'email': email},
                UpdateExpression="SET first_name = if_not_exists(first_name, :fn), last_name = if_not_exists(last_name, :ln), full_name = if_not_exists(full_name, :full), updated_at = :now",
                ExpressionAttributeValues={
                    ':fn': first_name,
                    ':ln': last_name,
                    ':full': f"{first_name} {last_name}",
                    ':now': now,
                }
            )
        except ClientError as e:
            print(f"Warning: could not upsert volunteer record for {email}: {e}")

    return respond(200, {
        'success': True,
        'message': f'Walk-in participant {first_name} {last_name} added',
        'attendee_id': attendee_id,
    })


def handle_status_update(event_id, body, new_status, no_show_value):
    """Update an RSVP's attendance status (attended, no_show, or revert)."""
    attendee_id = body.get('attendee_id', '').strip()
    email = body.get('email', '').strip()

    if not attendee_id and not email:
        return respond(400, {'error': 'attendee_id or email is required'})

    # Resolve the RSVP record
    try:
        if attendee_id:
            resp = rsvps_table.get_item(Key={'event_id': event_id, 'attendee_id': attendee_id})
            if 'Item' not in resp:
                return respond(404, {'error': 'RSVP not found'})
            rsvp = resp['Item']
        else:
            # Fallback: try email as attendee_id first, then GSI
            resp = rsvps_table.get_item(Key={'event_id': event_id, 'attendee_id': email})
            if 'Item' in resp:
                rsvp = resp['Item']
            else:
                query_resp = rsvps_table.query(
                    IndexName='email-index',
                    KeyConditionExpression=Key('email').eq(email),
                    FilterExpression='event_id = :eid',
                    ExpressionAttributeValues={':eid': event_id}
                )
                items = query_resp.get('Items', [])
                if not items:
                    return respond(404, {'error': 'RSVP not found'})
                rsvp = items[0]

        actual_attendee_id = rsvp['attendee_id']

        # Don't modify cancelled RSVPs
        if rsvp.get('status') == 'cancelled':
            return respond(400, {'error': 'Cannot modify a cancelled RSVP'})

    except ClientError as e:
        print(f"Error looking up RSVP: {e}")
        return respond(500, {'error': 'Failed to look up RSVP'})

    # Perform the update
    now = datetime.now(timezone.utc).isoformat()
    try:
        update_expr = "SET #s = :status, no_show = :ns, updated_at = :now"
        expr_values = {
            ':status': new_status,
            ':ns': no_show_value,
            ':now': now,
        }

        if no_show_value:
            update_expr += ", no_show_marked_at = :nsat"
            expr_values[':nsat'] = now

        rsvps_table.update_item(
            Key={'event_id': event_id, 'attendee_id': actual_attendee_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues=expr_values,
        )

        # Update volunteer no-show metrics
        rsvp_email = rsvp.get('email')
        if rsvp_email and no_show_value and not rsvp.get('no_show'):
            try:
                volunteers_table.update_item(
                    Key={'email': rsvp_email},
                    UpdateExpression="ADD volunteer_metrics.total_no_shows :inc",
                    ExpressionAttributeValues={':inc': 1}
                )
            except ClientError:
                pass  # Non-critical

    except ClientError as e:
        print(f"Error updating RSVP: {e}")
        return respond(500, {'error': 'Failed to update attendance status'})

    return respond(200, {
        'success': True,
        'message': f'Attendance updated to {new_status}',
        'attendee_id': actual_attendee_id,
        'status': new_status,
        'no_show': no_show_value,
    })


def handle_delete(event_id, body):
    """Delete an RSVP record entirely."""
    attendee_id = body.get('attendee_id', '').strip()
    email = body.get('email', '').strip()

    if not attendee_id and not email:
        return respond(400, {'error': 'attendee_id or email is required'})

    # Resolve the RSVP record
    try:
        if attendee_id:
            resp = rsvps_table.get_item(Key={'event_id': event_id, 'attendee_id': attendee_id})
            if 'Item' not in resp:
                return respond(404, {'error': 'RSVP not found'})
            actual_attendee_id = resp['Item']['attendee_id']
        else:
            resp = rsvps_table.get_item(Key={'event_id': event_id, 'attendee_id': email})
            if 'Item' in resp:
                actual_attendee_id = resp['Item']['attendee_id']
            else:
                query_resp = rsvps_table.query(
                    IndexName='email-index',
                    KeyConditionExpression=Key('email').eq(email),
                    FilterExpression='event_id = :eid',
                    ExpressionAttributeValues={':eid': event_id}
                )
                items = query_resp.get('Items', [])
                if not items:
                    return respond(404, {'error': 'RSVP not found'})
                actual_attendee_id = items[0]['attendee_id']
    except ClientError as e:
        print(f"Error looking up RSVP for delete: {e}")
        return respond(500, {'error': 'Failed to look up RSVP'})

    try:
        rsvps_table.delete_item(Key={'event_id': event_id, 'attendee_id': actual_attendee_id})
    except ClientError as e:
        print(f"Error deleting RSVP: {e}")
        return respond(500, {'error': 'Failed to delete RSVP'})

    return respond(200, {
        'success': True,
        'message': 'RSVP deleted',
        'attendee_id': actual_attendee_id,
    })

def handle_add_minor(event_id, body):
    """Add a minor RSVP linked to a guardian's email."""
    first_name = body.get('first_name', '').strip()
    last_name = body.get('last_name', '').strip()
    guardian_email = body.get('guardian_email', '').strip().lower()
    date_of_birth = body.get('date_of_birth', '').strip()

    if not first_name or not last_name:
        return respond(400, {'error': 'first_name and last_name are required'})
    if not guardian_email:
        return respond(400, {'error': 'guardian_email is required'})
    if not date_of_birth:
        return respond(400, {'error': 'date_of_birth is required'})

    # Validate date format (YYYY-MM-DD)
    try:
        dob = datetime.strptime(date_of_birth, '%Y-%m-%d').date()
        today = datetime.now(timezone.utc).date()
        age = (today - dob).days // 365
        if age < 0 or age >= 18:
            return respond(400, {'error': 'Minor must be under 18'})
    except ValueError:
        return respond(400, {'error': 'date_of_birth must be in YYYY-MM-DD format'})

    now = datetime.now(timezone.utc).isoformat()
    attendee_id = f"minor-{first_name.lower()}-{last_name.lower()}-{int(datetime.now(timezone.utc).timestamp())}"

    item = {
        'event_id': event_id,
        'attendee_id': attendee_id,
        'attendee_type': 'minor',
        'status': 'active',
        'first_name': first_name,
        'last_name': last_name,
        'email': guardian_email,
        'guardian_email': guardian_email,
        'date_of_birth': date_of_birth,
        'age': age,
        'no_show': False,
        'walk_in': True,
        'created_at': now,
        'updated_at': now,
    }

    try:
        rsvps_table.put_item(Item=item)
    except ClientError as e:
        print(f"Error creating minor RSVP: {e}")
        return respond(500, {'error': 'Failed to add minor'})

    return respond(200, {
        'success': True,
        'message': f'Minor {first_name} {last_name} added under {guardian_email}',
        'attendee_id': attendee_id,
    })



def handle_bulk_confirm(event_id, body):
    """Mark all active (non-cancelled, non-no-show) RSVPs as attended."""
    try:
        resp = rsvps_table.query(
            KeyConditionExpression=Key('event_id').eq(event_id)
        )
        rsvps = resp.get('Items', [])
    except ClientError as e:
        print(f"Error querying RSVPs: {e}")
        return respond(500, {'error': 'Failed to query RSVPs'})

    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    skipped = 0

    for rsvp in rsvps:
        # Skip cancelled and already-processed RSVPs
        if rsvp.get('status') == 'cancelled' or rsvp.get('no_show') == True or rsvp.get('status') == 'attended':
            skipped += 1
            continue

        try:
            rsvps_table.update_item(
                Key={'event_id': event_id, 'attendee_id': rsvp['attendee_id']},
                UpdateExpression="SET #s = :status, updated_at = :now",
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues={
                    ':status': 'attended',
                    ':now': now,
                }
            )
            updated += 1
        except ClientError as e:
            print(f"Error updating {rsvp['attendee_id']}: {e}")

    return respond(200, {
        'success': True,
        'message': f'Confirmed attendance for {updated} participants ({skipped} skipped)',
        'updated': updated,
        'skipped': skipped,
    })


def handler(event, context):
    """
    Admin attendance management endpoint.
    POST /events/{event_id}/attendance

    Actions:
      - walk_in: Add a walk-in participant
      - no_show: Mark as no-show
      - attended: Confirm attendance
      - undo_no_show: Revert no-show back to active
      - bulk_confirm: Mark all remaining active RSVPs as attended
    """
    print(f"Received event: {json.dumps(event)}")

    if event.get('httpMethod') == 'OPTIONS':
        return respond(200, {'message': 'CORS preflight successful'})

    try:
        # Get event_id from path
        path_params = event.get('pathParameters') or {}
        event_id = path_params.get('event_id')
        if not event_id:
            return respond(400, {'error': 'Missing event_id in path'})

        # Verify event exists
        try:
            ev_resp = events_table.get_item(Key={'event_id': event_id})
            if 'Item' not in ev_resp:
                return respond(404, {'error': f'Event {event_id} not found'})
        except ClientError as e:
            print(f"Error checking event: {e}")
            return respond(500, {'error': 'Failed to verify event'})

        body = json.loads(event.get('body', '{}'))
        action = body.get('action', '')

        if action == 'walk_in':
            return handle_walk_in(event_id, body)
        elif action == 'no_show':
            return handle_status_update(event_id, body, 'no_show', True)
        elif action == 'attended':
            return handle_status_update(event_id, body, 'attended', False)
        elif action == 'undo_no_show':
            return handle_status_update(event_id, body, 'active', False)
        elif action == 'bulk_confirm':
            return handle_bulk_confirm(event_id, body)
        elif action == 'delete':
            return handle_delete(event_id, body)
        elif action == 'add_minor':
            return handle_add_minor(event_id, body)
        else:
            return respond(400, {'error': f'Unknown action: {action}. Valid: walk_in, no_show, attended, undo_no_show, bulk_confirm, delete, add_minor'})

    except Exception as e:
        print(f"Error: {str(e)}")
        return respond(500, {'error': str(e), 'success': False})
