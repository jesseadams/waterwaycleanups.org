"""
Cleanup Suggestions Lambda
Public POST to submit suggestions, admin GET to list them.
"""

import json
import os
import uuid
import boto3
from datetime import datetime, timezone
from decimal import Decimal
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
suggestions_table = dynamodb.Table(os.environ.get('SUGGESTIONS_TABLE_NAME', 'cleanup_suggestions'))
sessions_table = dynamodb.Table(os.environ.get('SESSION_TABLE_NAME', 'auth_sessions'))

ADMIN_EMAILS = [
    'admin@waterwaycleanups.org',
    'contact@waterwaycleanups.org',
    'jesse@techno-geeks.org',
    'jesse@waterwaycleanups.org'
]

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    'Content-Type': 'application/json'
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o) if o % 1 else int(o)
        return super().default(o)


def respond(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, cls=DecimalEncoder)
    }


def validate_admin(token):
    if not token:
        return None
    try:
        result = sessions_table.get_item(Key={'session_token': token})
        session = result.get('Item')
        if not session:
            return None
        exp = session.get('expires_at', '').replace('Z', '+00:00')
        if datetime.fromisoformat(exp) < datetime.now(timezone.utc):
            return None
        if session.get('email', '').lower() in ADMIN_EMAILS:
            return session
        return None
    except Exception:
        return None


def handle_submit(body):
    """Public: submit a cleanup suggestion."""
    name = (body.get('name') or '').strip()
    email = (body.get('email') or '').strip().lower()
    phone = (body.get('phone') or '').strip()
    description = (body.get('description') or '').strip()
    features = body.get('features', {})

    if not name:
        return respond(400, {'success': False, 'message': 'Name is required'})
    if not email:
        return respond(400, {'success': False, 'message': 'Email is required'})
    if not features.get('paths') and not features.get('zones'):
        return respond(400, {'success': False, 'message': 'Please draw at least one path or area on the map'})

    now = datetime.now(timezone.utc).isoformat()
    suggestion_id = str(uuid.uuid4())

    # Convert floats to Decimal for DynamoDB
    features_str = json.dumps(features)
    features_decimal = json.loads(features_str, parse_float=Decimal)

    item = {
        'suggestion_id': suggestion_id,
        'status': 'pending',
        'name': name,
        'email': email,
        'phone': phone,
        'description': description,
        'features': features_decimal,
        'created_at': now,
        'updated_at': now
    }

    suggestions_table.put_item(Item=item)

    return respond(200, {
        'success': True,
        'suggestion_id': suggestion_id,
        'message': 'Thank you! Your cleanup suggestion has been submitted.'
    })


def handle_list(params, session):
    """Admin: list all suggestions."""
    status_filter = (params or {}).get('status', 'pending')

    try:
        result = suggestions_table.query(
            IndexName='status-created_at-index',
            KeyConditionExpression=Key('status').eq(status_filter),
            ScanIndexForward=False
        )
        return respond(200, {
            'success': True,
            'suggestions': result.get('Items', []),
            'count': result.get('Count', 0)
        })
    except Exception as e:
        print(f'Error listing suggestions: {e}')
        return respond(500, {'success': False, 'message': 'Failed to list suggestions'})


def handle_update_status(body, session):
    """Admin: update suggestion status (pending -> reviewed/accepted/rejected)."""
    suggestion_id = body.get('suggestion_id')
    new_status = body.get('status')

    if not suggestion_id or not new_status:
        return respond(400, {'success': False, 'message': 'suggestion_id and status required'})

    valid_statuses = ['pending', 'reviewed', 'accepted', 'rejected']
    if new_status not in valid_statuses:
        return respond(400, {'success': False, 'message': f'Invalid status. Valid: {", ".join(valid_statuses)}'})

    now = datetime.now(timezone.utc).isoformat()
    suggestions_table.update_item(
        Key={'suggestion_id': suggestion_id},
        UpdateExpression='SET #s = :status, updated_at = :now, reviewed_by = :by',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={
            ':status': new_status,
            ':now': now,
            ':by': session.get('email', '')
        }
    )

    return respond(200, {'success': True, 'message': f'Suggestion updated to {new_status}'})


def handler(event, context):
    method = event.get('httpMethod', '')

    if method == 'OPTIONS':
        return respond(200, {'message': 'CORS preflight successful'})

    if method == 'POST':
        try:
            body = json.loads(event.get('body', '{}'))
        except (json.JSONDecodeError, TypeError):
            return respond(400, {'success': False, 'message': 'Invalid JSON'})

        action = body.get('action')

        # Admin actions require auth
        if action in ('list', 'update_status'):
            headers = event.get('headers', {}) or {}
            auth = headers.get('Authorization') or headers.get('authorization', '')
            token = auth.replace('Bearer ', '') if auth.startswith('Bearer ') else body.get('session_token')
            session = validate_admin(token)
            if not session:
                return respond(403, {'success': False, 'message': 'Admin access required'})

            if action == 'list':
                return handle_list(body, session)
            elif action == 'update_status':
                return handle_update_status(body, session)

        # Public submit (no auth needed)
        return handle_submit(body)

    if method == 'GET':
        # Admin list via GET
        headers = event.get('headers', {}) or {}
        auth = headers.get('Authorization') or headers.get('authorization', '')
        token = auth.replace('Bearer ', '') if auth.startswith('Bearer ')  else ''
        session = validate_admin(token)
        if not session:
            return respond(403, {'success': False, 'message': 'Admin access required'})
        params = event.get('queryStringParameters')
        return handle_list(params, session)

    return respond(405, {'success': False, 'message': 'Method not allowed'})
