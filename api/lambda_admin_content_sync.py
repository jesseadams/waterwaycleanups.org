"""
Admin Content Sync Lambda
Manages event content: save drafts to DynamoDB, publish to events table, trigger rebuild
"""

import json
import os
import boto3
import urllib.request
import urllib.error
from datetime import datetime
from decimal import Decimal

# Custom JSON encoder to handle Decimal types from DynamoDB
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

dynamodb = boto3.resource('dynamodb')
ssm = boto3.client('ssm')

session_table_name = os.environ.get('SESSION_TABLE_NAME', 'auth_sessions')
content_edits_table_name = os.environ.get('CONTENT_EDITS_TABLE_NAME', 'content_edits')
events_table_name = os.environ.get('EVENTS_TABLE_NAME', 'events')
github_token_parameter = os.environ.get('GITHUB_TOKEN_PARAMETER', '')
github_repo = os.environ.get('GITHUB_REPO', 'waterwaycleanups/waterwaycleanups.org')
github_branch = os.environ.get('GITHUB_BRANCH', 'main')

session_table = dynamodb.Table(session_table_name)
content_edits_table = dynamodb.Table(content_edits_table_name)
events_table = dynamodb.Table(events_table_name)

# Cache for GitHub token
_github_token_cache = None

def get_github_token():
    """Get GitHub token from SSM Parameter Store with caching"""
    global _github_token_cache
    
    if _github_token_cache is not None:
        return _github_token_cache
    
    if not github_token_parameter:
        return ''
    
    try:
        response = ssm.get_parameter(Name=github_token_parameter, WithDecryption=True)
        _github_token_cache = response['Parameter']['Value']
        return _github_token_cache
    except Exception as e:
        print(f"Error fetching GitHub token from SSM: {e}")
        return ''

ADMIN_EMAILS = [
    'admin@waterwaycleanups.org',
    'contact@waterwaycleanups.org',
    'jesse@techno-geeks.org',
    'jesse@waterwaycleanups.org'
]

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
}

def respond(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def validate_admin_session(session_token):
    """Validate session token and check if user is admin"""
    try:
        response = session_table.get_item(Key={'session_token': session_token})
        session = response.get('Item')
        
        if not session:
            return None
            
        # Check if session is expired
        expires_at = datetime.fromisoformat(session['expires_at'].replace('Z', '+00:00'))
        if expires_at <= datetime.now(expires_at.tzinfo):
            return None
            
        # Check if user is admin
        if session['email'].lower() not in ADMIN_EMAILS:
            return None
            
        return session
    except Exception as e:
        print(f"Error validating session: {e}")
        return None

def slugify(title):
    """Generate URL-friendly slug from title"""
    import re
    slug = title.lower()
    slug = re.sub(r"[''']", '', slug)
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug

def generate_event_id(title, start_time):
    """Generate event_id from title and date"""
    slug = slugify(title)
    date = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
    month = f"{date.month:02d}"
    year = date.year
    return f"{slug}-{month}-{year}"

def trigger_workflow(environment='staging'):
    """Trigger GitHub Actions content-sync workflow"""
    github_token = get_github_token()
    
    if not github_token:
        print("GitHub token not available, skipping workflow trigger")
        return {'triggered': False, 'error': 'No GitHub token'}
    
    try:
        url = f"https://api.github.com/repos/{github_repo}/actions/workflows/content-sync.yml/dispatches"
        headers = {
            'Authorization': f'token {github_token}',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'waterwaycleanups-admin',
            'Content-Type': 'application/json'
        }
        data = json.dumps({
            'ref': github_branch,
            'inputs': {'environment': environment}
        }).encode('utf-8')
        
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req) as response:
            return {'triggered': True, 'environment': environment}
    except urllib.error.HTTPError as e:
        error_msg = f"HTTP {e.code}: {e.read().decode('utf-8')}"
        print(f"Failed to trigger workflow: {error_msg}")
        return {'triggered': False, 'error': error_msg}
    except Exception as e:
        print(f"Failed to trigger workflow: {e}")
        return {'triggered': False, 'error': str(e)}

def handle_save_draft(body, session):
    """Save or update a draft edit in DynamoDB"""
    event_data = body.get('event_data', {})
    
    if not event_data.get('title') or not event_data.get('start_time') or not event_data.get('end_time'):
        return respond(400, {'success': False, 'message': 'Missing required event fields'})
    
    # For existing events, body contains the original event_id.
    # Always regenerate the event_id from the (possibly new) title so the slug stays in sync.
    original_event_id = body.get('event_id')  # None for brand-new events
    new_event_id = generate_event_id(event_data['title'], event_data['start_time'])
    
    # If editing an existing event whose title hasn't changed, keep the original id
    # to avoid unnecessary renames from minor slug differences.
    if original_event_id and original_event_id == new_event_id:
        event_id = original_event_id
    elif original_event_id:
        # Title or date changed — use the new slug
        event_id = new_event_id
    else:
        # Brand-new event
        event_id = new_event_id
    
    edit_id = body.get('edit_id') or f"edit_{int(datetime.now().timestamp())}_{os.urandom(3).hex()}"
    is_new = not original_event_id
    
    # Prepare event data for DynamoDB events table format
    db_event_data = {
        'event_id': event_id,
        'title': event_data['title'],
        'description': event_data.get('description', ''),
        'start_time': event_data['start_time'],
        'end_time': event_data['end_time'],
        'location': {
            'name': event_data.get('location_name', ''),
            'address': event_data.get('location_address', '')
        },
        'attendance_cap': int(event_data.get('attendance_cap', 20)),
        'status': 'active',
        'hugo_config': {
            'image': event_data.get('image', '/uploads/waterway-cleanups/default.jpg'),
            'tags': event_data.get('tags', []),
            'preheader_is_light': event_data.get('preheader_is_light', False)
        }
    }
    
    # Only include private flag if explicitly set to true
    if event_data.get('private', False):
        db_event_data['private'] = True
    
    item = {
        'edit_id': edit_id,
        'event_id': event_id,
        'original_event_id': original_event_id if (original_event_id and original_event_id != event_id) else None,
        'event_data': db_event_data,
        'status': 'draft',
        'edit_type': 'update',  # 'update' or 'delete'
        'is_new_event': is_new,
        'created_at': datetime.utcnow().isoformat() + 'Z',
        'updated_at': datetime.utcnow().isoformat() + 'Z',
        'created_by': session['email']
    }
    
    content_edits_table.put_item(Item=item)
    
    return respond(200, {
        'success': True,
        'edit_id': edit_id,
        'event_id': event_id,
        'message': 'Draft saved successfully'
    })

def handle_list_edits(body, session):
    """List all pending edits"""
    try:
        response = content_edits_table.query(
            IndexName='status-created_at-index',
            KeyConditionExpression='#status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'draft'}
        )
        
        return respond(200, {
            'success': True,
            'edits': response.get('Items', [])
        })
    except Exception as e:
        print(f"Error listing edits: {e}")
        return respond(500, {'success': False, 'message': str(e)})

def handle_delete_edit(body, session):
    """Delete a draft edit"""
    edit_id = body.get('edit_id')
    if not edit_id:
        return respond(400, {'success': False, 'message': 'edit_id required'})
    
    try:
        content_edits_table.delete_item(Key={'edit_id': edit_id})
        return respond(200, {'success': True, 'message': 'Edit deleted'})
    except Exception as e:
        print(f"Error deleting edit: {e}")
        return respond(500, {'success': False, 'message': str(e)})

def handle_load_event(body, session):
    """Load an existing event from the events table"""
    event_id = body.get('event_id')
    if not event_id:
        return respond(400, {'success': False, 'message': 'event_id required'})
    
    try:
        response = events_table.get_item(Key={'event_id': event_id})
        event = response.get('Item')
        
        if not event:
            return respond(404, {'success': False, 'message': 'Event not found'})
        
        return respond(200, {'success': True, 'event': event})
    except Exception as e:
        print(f"Error loading event: {e}")
        return respond(500, {'success': False, 'message': str(e)})

def handle_queue_delete(body, session):
    """Queue an event for deletion"""
    event_id = body.get('event_id')
    if not event_id:
        return respond(400, {'success': False, 'message': 'event_id required'})
    
    try:
        # Check if event exists
        response = events_table.get_item(Key={'event_id': event_id})
        event = response.get('Item')
        
        if not event:
            return respond(404, {'success': False, 'message': 'Event not found'})
        
        # Create deletion edit
        edit_id = f"edit_{int(datetime.now().timestamp())}_{os.urandom(3).hex()}"
        
        item = {
            'edit_id': edit_id,
            'event_id': event_id,
            'event_data': event,  # Store original event data for reference
            'status': 'draft',
            'edit_type': 'delete',
            'is_new_event': False,
            'created_at': datetime.utcnow().isoformat() + 'Z',
            'updated_at': datetime.utcnow().isoformat() + 'Z',
            'created_by': session['email']
        }
        
        content_edits_table.put_item(Item=item)
        
        return respond(200, {
            'success': True,
            'edit_id': edit_id,
            'event_id': event_id,
            'message': 'Event queued for deletion'
        })
    except Exception as e:
        print(f"Error queuing delete: {e}")
        return respond(500, {'success': False, 'message': str(e)})

def migrate_rsvps(rsvps_table, old_event_id, new_event_id):
    """Migrate all RSVPs from old_event_id to new_event_id.
    
    DynamoDB doesn't support updating partition keys, so we copy each RSVP
    to the new event_id and delete the old one.
    
    Returns the number of RSVPs migrated.
    """
    migrated = 0
    try:
        # Query all RSVPs for the old event
        response = rsvps_table.query(
            KeyConditionExpression='event_id = :eid',
            ExpressionAttributeValues={':eid': old_event_id}
        )
        rsvps = response.get('Items', [])
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = rsvps_table.query(
                KeyConditionExpression='event_id = :eid',
                ExpressionAttributeValues={':eid': old_event_id},
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            rsvps.extend(response.get('Items', []))
        
        for rsvp in rsvps:
            # Create new RSVP with updated event_id
            new_rsvp = {**rsvp, 'event_id': new_event_id}
            rsvps_table.put_item(Item=new_rsvp)
            # Delete old RSVP (key is event_id + attendee_id)
            rsvps_table.delete_item(Key={
                'event_id': old_event_id,
                'attendee_id': rsvp['attendee_id']
            })
            migrated += 1
        
        print(f"Migrated {migrated} RSVPs from {old_event_id} to {new_event_id}")
    except Exception as e:
        print(f"Error migrating RSVPs from {old_event_id} to {new_event_id}: {e}")
    
    return migrated

def sync_s3_image_to_github(image_url):
    """If image_url is an S3 event-photos URL, download it and commit to GitHub.
    Returns the local Hugo path, or the original URL if not an S3 upload."""
    bucket_name = os.environ.get('EVENT_PHOTOS_BUCKET', '')
    print(f"[IMAGE_SYNC] Starting sync check for image_url={image_url}, bucket_name={bucket_name}")
    
    if not bucket_name or not image_url:
        print(f"[IMAGE_SYNC] Skipping: bucket_name empty={not bucket_name}, image_url empty={not image_url}")
        return image_url
    
    if bucket_name not in image_url:
        print(f"[IMAGE_SYNC] Skipping: bucket_name '{bucket_name}' not found in image_url '{image_url}'")
        return image_url

    # Extract the filename from the S3 URL
    try:
        parts = image_url.split('/event-photos/')
        if len(parts) != 2:
            print(f"[IMAGE_SYNC] Skipping: could not split on '/event-photos/', parts={parts}")
            return image_url
        filename = parts[1]
        print(f"[IMAGE_SYNC] Extracted filename: {filename}")
    except Exception as e:
        print(f"[IMAGE_SYNC] Error extracting filename: {e}")
        return image_url

    github_token = get_github_token()
    if not github_token:
        print("[IMAGE_SYNC] No GitHub token available, skipping")
        return image_url
    print(f"[IMAGE_SYNC] GitHub token obtained (length={len(github_token)})")

    try:
        import base64

        # Download from S3
        s3_client = boto3.client('s3')
        s3_key = f'event-photos/{filename}'
        print(f"[IMAGE_SYNC] Downloading from S3: bucket={bucket_name}, key={s3_key}")
        response = s3_client.get_object(Bucket=bucket_name, Key=s3_key)
        file_bytes = response['Body'].read()
        file_b64 = base64.b64encode(file_bytes).decode('utf-8')
        print(f"[IMAGE_SYNC] Downloaded {len(file_bytes)} bytes from S3, base64 length={len(file_b64)}")

        repo_path = f'static/uploads/waterway-cleanups/{filename}'
        local_path = f'/uploads/waterway-cleanups/{filename}'

        # Check if file already exists in GitHub (need SHA to update)
        existing_sha = None
        try:
            check_url = f'https://api.github.com/repos/{github_repo}/contents/{repo_path}?ref={github_branch}'
            print(f"[IMAGE_SYNC] Checking GitHub for existing file: {check_url}")
            check_req = urllib.request.Request(check_url, headers={
                'Authorization': f'token {github_token}',
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'waterwaycleanups-admin'
            })
            with urllib.request.urlopen(check_req) as resp:
                existing = json.loads(resp.read().decode('utf-8'))
                existing_sha = existing.get('sha')
                print(f"[IMAGE_SYNC] File exists in GitHub, sha={existing_sha}")
        except urllib.error.HTTPError as e:
            print(f"[IMAGE_SYNC] File not found in GitHub (HTTP {e.code}), will create new")

        commit_data = {
            'message': f'Add event photo: {filename}',
            'content': file_b64,
            'branch': github_branch,
            'committer': {
                'name': 'Waterway Cleanups Admin',
                'email': 'admin@waterwaycleanups.org'
            }
        }
        if existing_sha:
            commit_data['sha'] = existing_sha

        put_url = f'https://api.github.com/repos/{github_repo}/contents/{repo_path}'
        put_data = json.dumps(commit_data).encode('utf-8')
        print(f"[IMAGE_SYNC] Committing to GitHub: {put_url} (payload size={len(put_data)})")
        put_req = urllib.request.Request(put_url, data=put_data, headers={
            'Authorization': f'token {github_token}',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'waterwaycleanups-admin',
            'Content-Type': 'application/json'
        }, method='PUT')

        with urllib.request.urlopen(put_req) as resp:
            resp_body = resp.read().decode('utf-8')
            print(f"[IMAGE_SYNC] GitHub commit success, status={resp.status}")

        print(f"[IMAGE_SYNC] Synced image to GitHub: {repo_path} -> {local_path}")
        return local_path
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"[IMAGE_SYNC] GitHub API error: HTTP {e.code}, body={error_body[:500]}")
        return image_url
    except Exception as e:
        print(f"[IMAGE_SYNC] Failed to sync image {image_url} to GitHub: {e}")
        import traceback
        traceback.print_exc()
        return image_url

def handle_publish(body, session):
    """Publish all pending edits to the events table and trigger rebuild"""
    try:
        # Get all draft edits
        response = content_edits_table.query(
            IndexName='status-created_at-index',
            KeyConditionExpression='#status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'draft'}
        )
        
        edits = response.get('Items', [])
        if not edits:
            return respond(200, {'success': True, 'message': 'No edits to publish', 'published_count': 0})
        
        # Initialize RSVPs table for migration
        rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME', 'rsvps')
        rsvps_table = dynamodb.Table(rsvps_table_name)
        
        # Publish each edit to events table
        published_count = 0
        deleted_count = 0
        migrated_rsvps_count = 0
        
        for edit in edits:
            edit_type = edit.get('edit_type', 'update')
            event_id = edit['event_id']
            
            if edit_type == 'delete':
                # Delete event from events table
                events_table.delete_item(Key={'event_id': event_id})
                deleted_count += 1
            else:
                # Check if event_id changed (rename)
                original_event_id = edit.get('original_event_id')
                if original_event_id and original_event_id != event_id:
                    # Migrate RSVPs from old event_id to new event_id
                    migrated_rsvps_count += migrate_rsvps(
                        rsvps_table, original_event_id, event_id
                    )
                    # Delete old event record
                    events_table.delete_item(Key={'event_id': original_event_id})
                    print(f"Migrated event {original_event_id} -> {event_id}")
                
                # If the image is an S3 upload, commit it to GitHub and rewrite to local path
                event_data = edit['event_data']
                hugo_config = event_data.get('hugo_config', {})
                image_url = hugo_config.get('image', '')
                print(f"[PUBLISH] Event {event_id}: hugo_config={json.dumps(hugo_config, cls=DecimalEncoder)}")
                print(f"[PUBLISH] Event {event_id}: image_url='{image_url}', is_s3={'s3.amazonaws.com' in str(image_url)}")
                if image_url and 's3.amazonaws.com' in str(image_url):
                    print(f"[PUBLISH] Event {event_id}: Triggering S3->GitHub sync for {image_url}")
                    local_path = sync_s3_image_to_github(image_url)
                    print(f"[PUBLISH] Event {event_id}: sync result: '{image_url}' -> '{local_path}'")
                    hugo_config['image'] = local_path
                    event_data['hugo_config'] = hugo_config
                else:
                    print(f"[PUBLISH] Event {event_id}: No S3 image sync needed")
                
                # Update or create event in events table
                events_table.put_item(Item=event_data)
            
            # Mark edit as published
            content_edits_table.update_item(
                Key={'edit_id': edit['edit_id']},
                UpdateExpression='SET #status = :status, published_at = :published_at',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'published',
                    ':published_at': datetime.utcnow().isoformat() + 'Z'
                }
            )
            published_count += 1
        
        # Trigger GitHub Actions workflow to rebuild site
        # Determine environment from DynamoDB table suffix
        env_name = events_table_name.replace('events-', '') if events_table_name.startswith('events-') else 'staging'
        workflow_result = trigger_workflow(env_name)
        
        message_parts = [f'Published {published_count} change(s)']
        if deleted_count > 0:
            message_parts.append(f'{deleted_count} deletion(s)')
        if migrated_rsvps_count > 0:
            message_parts.append(f'{migrated_rsvps_count} RSVP(s) migrated')
        
        return respond(200, {
            'success': True,
            'message': ', '.join(message_parts),
            'published_count': published_count,
            'deleted_count': deleted_count,
            'migrated_rsvps_count': migrated_rsvps_count,
            'workflow': workflow_result
        })
    except Exception as e:
        print(f"Error publishing edits: {e}")
        return respond(500, {'success': False, 'message': str(e)})

def handle_upload_image(body, session):
    """Generate a presigned S3 URL for direct browser upload"""
    filename = body.get('filename', '')

    if not filename:
        return respond(400, {'success': False, 'message': 'filename required'})

    # Sanitize filename
    import re
    sanitized = re.sub(r'[^a-z0-9._-]', '', filename.lower().replace(' ', '-'))

    allowed_exts = ('.jpg', '.jpeg', '.png', '.webp')
    ext_pos = sanitized.rfind('.')
    ext = sanitized[ext_pos:] if ext_pos >= 0 else ''
    if ext not in allowed_exts:
        return respond(400, {'success': False, 'message': f'Invalid file type. Allowed: {", ".join(allowed_exts)}'})

    bucket_name = os.environ.get('EVENT_PHOTOS_BUCKET', '')
    if not bucket_name:
        return respond(500, {'success': False, 'message': 'Photo upload bucket not configured'})

    s3_key = f'event-photos/{sanitized}'
    public_path = f'/uploads/waterway-cleanups/{sanitized}'

    content_type_map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.webp': 'image/webp'
    }

    try:
        s3_client = boto3.client('s3')
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': s3_key,
                'ContentType': content_type_map.get(ext, 'image/jpeg')
            },
            ExpiresIn=300  # 5 minutes
        )

        # The S3 public URL for the uploaded image
        s3_public_url = f'https://{bucket_name}.s3.amazonaws.com/{s3_key}'

        return respond(200, {
            'success': True,
            'upload_url': presigned_url,
            'public_url': s3_public_url,
            'path': public_path,
            'filename': sanitized,
            'content_type': content_type_map.get(ext, 'image/jpeg'),
            'message': 'Upload URL generated. Upload directly to S3.'
        })
    except Exception as e:
        print(f"Error generating presigned URL: {e}")
        return respond(500, {'success': False, 'message': f'Failed to generate upload URL: {str(e)}'})

def handle_list_uploaded_images(body, session):
    """List uploaded event photos from S3"""
    bucket_name = os.environ.get('EVENT_PHOTOS_BUCKET', '')
    if not bucket_name:
        return respond(200, {'success': True, 'images': []})

    try:
        s3_client = boto3.client('s3')
        response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix='event-photos/')
        images = []
        for obj in response.get('Contents', []):
            key = obj['Key']
            if key == 'event-photos/':
                continue
            filename = key.split('/')[-1]
            ext = filename[filename.rfind('.'):].lower() if '.' in filename else ''
            if ext in ('.jpg', '.jpeg', '.png', '.webp'):
                import re
                label = re.sub(r'[-_]', ' ', re.sub(r'\.[^.]+$', '', filename))
                images.append({
                    'path': f'https://{bucket_name}.s3.amazonaws.com/{key}',
                    'label': label.title(),
                    'filename': filename
                })
        return respond(200, {'success': True, 'images': images})
    except Exception as e:
        print(f"Error listing uploaded images: {e}")
        return respond(200, {'success': True, 'images': []})

def handler(event, context):
    """Lambda handler"""
    print(f"[HANDLER] Invoked: method={event.get('httpMethod')}, path={event.get('path')}")
    
    # Handle OPTIONS for CORS
    if event.get('httpMethod') == 'OPTIONS':
        return respond(200, {'message': 'CORS preflight successful'})
    
    if event.get('httpMethod') != 'POST':
        return respond(405, {'success': False, 'message': 'Method Not Allowed'})
    
    # Parse body
    try:
        body = json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        print(f"[HANDLER] Invalid JSON body: {event.get('body', '')[:200]}")
        return respond(400, {'success': False, 'message': 'Invalid JSON body'})
    
    action = body.get('action')
    print(f"[HANDLER] Action: {action}")
    
    # Extract session token from Authorization header OR body
    headers = event.get('headers', {})
    auth_header = headers.get('Authorization') or headers.get('authorization')
    
    session_token = None
    if auth_header:
        session_token = auth_header.replace('Bearer ', '').replace('bearer ', '')
        print(f"[HANDLER] Token from header (length={len(session_token)})")
    elif body.get('session_token'):
        session_token = body.get('session_token')
        print(f"[HANDLER] Token from body (length={len(session_token)})")
    
    if not session_token:
        print("[HANDLER] No session token found")
        return respond(401, {'success': False, 'message': 'Session token required'})
    
    # Validate admin session
    session = validate_admin_session(session_token)
    if not session:
        print(f"[HANDLER] Admin validation failed for token")
        return respond(403, {'success': False, 'message': 'Admin access required'})
    
    print(f"[HANDLER] Authenticated as {session.get('email')}, routing to action={action}")
    
    # Route to action handler
    try:
        if action == 'save_draft':
            return handle_save_draft(body, session)
        elif action == 'list_edits':
            return handle_list_edits(body, session)
        elif action == 'delete_edit':
            return handle_delete_edit(body, session)
        elif action == 'load_event':
            return handle_load_event(body, session)
        elif action == 'queue_delete':
            return handle_queue_delete(body, session)
        elif action == 'publish':
            return handle_publish(body, session)
        elif action == 'upload_image':
            return handle_upload_image(body, session)
        elif action == 'list_uploaded_images':
            return handle_list_uploaded_images(body, session)
        else:
            print(f"[HANDLER] Unknown action: {action}")
            return respond(400, {'success': False, 'message': f'Unknown action: {action}'})
    except Exception as e:
        print(f"[HANDLER] Unhandled exception in action={action}: {e}")
        import traceback
        traceback.print_exc()
        return respond(500, {'success': False, 'message': 'Internal server error', 'error': str(e)})
