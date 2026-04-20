"""
Impact Templates API Lambda
CRUD operations for impact map templates stored in DynamoDB.
Public read (GET list/get), admin-only write (POST save/delete).
"""

import json
import os
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
impact_templates_table = dynamodb.Table(os.environ.get('IMPACT_TEMPLATES_TABLE_NAME', 'impact_templates'))
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


def validate_admin_session(token):
    if not token:
        return None
    try:
        result = sessions_table.get_item(Key={'session_token': token})
        session = result.get('Item')
        if not session:
            print(f"[AUTH] No session found for token (length={len(token)})")
            return None
        
        # Check expiration
        expires_at = session.get('expires_at', '')
        from datetime import datetime, timezone
        try:
            # Handle various ISO format timestamps
            exp = expires_at.replace('Z', '+00:00')
            expiry = datetime.fromisoformat(exp)
            # Make both aware or both naive for comparison
            now = datetime.now(timezone.utc)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry <= now:
                print(f"[AUTH] Session expired: {expires_at}")
                return None
        except (ValueError, AttributeError) as e:
            print(f"[AUTH] Could not parse expires_at '{expires_at}': {e}")
            return None
        
        email = session.get('email', '').lower()
        if email in ADMIN_EMAILS:
            print(f"[AUTH] Admin validated: {email}")
            return session
        
        print(f"[AUTH] Not an admin: {email}")
        return None
    except Exception as e:
        print(f"[AUTH] Session validation error: {e}")
        return None


def handle_list(params):
    try:
        scan_kwargs = {}
        if params and params.get('reusable') == 'true':
            scan_kwargs['FilterExpression'] = boto3.dynamodb.conditions.Attr('reusable').eq(True)

        result = impact_templates_table.scan(**scan_kwargs)
        templates = sorted(result.get('Items', []), key=lambda t: t.get('updated_at', ''), reverse=True)
        return respond(200, {'success': True, 'templates': templates, 'count': len(templates)})
    except Exception as e:
        print(f'Error listing templates: {e}')
        return respond(500, {'success': False, 'message': 'Failed to list templates'})


def handle_get(template_id):
    try:
        result = impact_templates_table.get_item(Key={'template_id': template_id})
        item = result.get('Item')
        if not item:
            return respond(404, {'success': False, 'message': 'Template not found'})
        return respond(200, {'success': True, 'template': item})
    except Exception as e:
        print(f'Error getting template: {e}')
        return respond(500, {'success': False, 'message': 'Failed to get template'})


def handle_save(body, session):
    template = body.get('template')
    if not template or not template.get('id') or not template.get('name'):
        return respond(400, {'success': False, 'message': 'Template with id and name is required'})

    # Check existing version for auto-increment
    existing_version = 0
    try:
        existing = impact_templates_table.get_item(Key={'template_id': template['id']})
        if existing.get('Item'):
            existing_version = existing['Item'].get('version', 0)
    except Exception:
        pass

    new_version = template.get('version', existing_version + 1)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    item = {
        'template_id': template['id'],
        'name': template['name'],
        'description': template.get('description', ''),
        'version': new_version,
        'created_at': template.get('created_at', now),
        'updated_at': now,
        'updated_by': session.get('email', ''),
        'center': template.get('center', [0, 0]),
        'zoom': template.get('zoom', 14),
        'reusable': template.get('reusable', True),
        'estimated_miles': Decimal(str(template.get('estimated_miles', 0))),
        'features': template.get('features', {'parking': [], 'paths': [], 'zones': []})
    }

    # Convert any floats in features to Decimal for DynamoDB
    item = json.loads(json.dumps(item, cls=DecimalEncoder), parse_float=Decimal)

    impact_templates_table.put_item(Item=item)
    return respond(200, {
        'success': True,
        'template_id': template['id'],
        'version': new_version,
        'message': f"Template saved (v{new_version})"
    })


def handle_delete(body, session):
    template_id = body.get('template_id')
    if not template_id:
        return respond(400, {'success': False, 'message': 'template_id required'})

    impact_templates_table.delete_item(Key={'template_id': template_id})
    return respond(200, {'success': True, 'message': f'Template {template_id} deleted'})


def handler(event, context):
    http_method = event.get('httpMethod', '')

    if http_method == 'OPTIONS':
        return respond(200, {'message': 'CORS preflight successful'})

    # GET requests are public
    if http_method == 'GET':
        params = event.get('queryStringParameters') or {}
        template_id = params.get('id')
        if template_id:
            return handle_get(template_id)
        return handle_list(params)

    # POST requests require admin auth
    if http_method != 'POST':
        return respond(405, {'success': False, 'message': 'Method Not Allowed'})

    try:
        body = json.loads(event.get('body', '{}'))
    except (json.JSONDecodeError, TypeError):
        return respond(400, {'success': False, 'message': 'Invalid JSON body'})

    # Extract auth token
    headers = event.get('headers', {}) or {}
    auth_header = headers.get('Authorization') or headers.get('authorization', '')
    token = None
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.replace('Bearer ', '')
        print(f"[HANDLER] Token from Authorization header (length={len(token)})")
    elif body.get('session_token'):
        token = body.get('session_token')
        print(f"[HANDLER] Token from body (length={len(token)})")
    else:
        print("[HANDLER] No token found in header or body")

    session = validate_admin_session(token)
    if not session:
        return respond(403, {'success': False, 'message': 'Admin access required'})

    action = body.get('action')
    try:
        if action == 'save':
            return handle_save(body, session)
        elif action == 'delete':
            return handle_delete(body, session)
        else:
            return respond(400, {'success': False, 'message': f'Unknown action: {action}'})
    except Exception as e:
        print(f'Error handling {action}: {e}')
        return respond(500, {'success': False, 'message': 'Internal server error', 'error': str(e)})
