import json
import os
import re
import boto3
from datetime import datetime, timezone, timedelta
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')
aws_region = os.environ.get('AWS_REGION', 'us-east-1')
ses = boto3.client('ses', region_name=aws_region)
sesv2 = boto3.client('sesv2', region_name=aws_region)

# Get environment variables
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')
sender_email = os.environ.get('SENDER_EMAIL', 'info@waterwaycleanups.org')
site_url = os.environ.get('SITE_URL', 'https://waterwaycleanups.org').rstrip('/')
contact_list_name = os.environ.get('CONTACT_LIST_NAME', 'WaterwayCleanups')


def _set_contact_unsubscribe_all(email, unsubscribe_all):
    """
    Set UnsubscribeAll on a volunteer's SESv2 contact so suspended users stop
    receiving every newsletter/topic send. The scheduled newsletter sender uses
    ListManagementOptions, so SES honors UnsubscribeAll automatically — flipping
    this flag is enough to suppress all sends without touching topic preferences.

    Non-blocking: a missing contact or any SES error is logged but never fails
    the suspend/unsuspend operation. Returns True only if the contact was updated.
    """
    if not email:
        return False
    try:
        sesv2.update_contact(
            ContactListName=contact_list_name,
            EmailAddress=email,
            UnsubscribeAll=unsubscribe_all,
        )
        print(f"Set UnsubscribeAll={unsubscribe_all} for contact {email}")
        return True
    except sesv2.exceptions.NotFoundException:
        # No SES contact for this email (never subscribed) — nothing to suppress.
        print(f"No SES contact found for {email}; skipping opt-out")
        return False
    except Exception as e:
        print(f"Error updating SES contact {email}: {e}")
        return False

# Initialize tables
events_table = dynamodb.Table(events_table_name)
rsvps_table = dynamodb.Table(rsvps_table_name)
volunteers_table = dynamodb.Table(volunteers_table_name)

def handler(event, context):
    """
    Lambda function for event lifecycle management
    Handles automatic status updates, archiving, and cancellation workflows
    """
    print(f"Received event: {json.dumps(event)}")
    
    # Set default response headers for CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,PUT',
        'Access-Control-Max-Age': '86400'
    }
    
    # Handle preflight OPTIONS request
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        action = body.get('action')
        
        if action == 'update_completed_events':
            return update_completed_events(headers)
        elif action == 'complete_event':
            return complete_event(body, headers)
        elif action == 'update_cleanup_metrics':
            return update_cleanup_metrics(body, headers)
        elif action == 'create_adhoc_event':
            return create_adhoc_event(body, headers)
        elif action == 'suspend_volunteer':
            return suspend_volunteer(body, headers)
        elif action == 'unsuspend_volunteer':
            return unsuspend_volunteer(body, headers)
        elif action == 'archive_events':
            return archive_events(body, headers)
        elif action == 'cancel_event':
            return cancel_event(body, headers)
        elif action == 'categorize_events':
            return categorize_events(headers)
        else:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'error': 'Invalid action. Supported actions: update_completed_events, complete_event, update_cleanup_metrics, create_adhoc_event, suspend_volunteer, unsuspend_volunteer, archive_events, cancel_event, categorize_events'
                })
            }
            
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e), 'success': False})
        }

def update_completed_events(headers):
    """
    Identify past events that are ready for completion (admin must manually complete with metrics).
    This no longer auto-completes events — it just reports which ones need attention.
    """
    try:
        now = datetime.now(timezone.utc)
        current_time = now.isoformat()
        today_date = now.date()
        ready_events = []
        pending_events = []
        
        # Query active events
        response = events_table.query(
            IndexName='status-start_time-index',
            KeyConditionExpression=Key('status').eq('active')
        )
        
        active_events = response.get('Items', [])
        
        for event in active_events:
            end_time = event.get('end_time')
            if not end_time or end_time >= current_time:
                continue
            
            # Check that it's the day after the event
            try:
                event_end_date = datetime.fromisoformat(end_time.replace('Z', '+00:00')).date()
            except (ValueError, AttributeError):
                continue
            
            if today_date <= event_end_date:
                continue
            
            # Check RSVP status
            try:
                rsvp_response = rsvps_table.query(
                    KeyConditionExpression=Key('event_id').eq(event['event_id'])
                )
                rsvps = rsvp_response.get('Items', [])
            except ClientError:
                continue
            
            final_statuses = {'attended', 'no_show', 'cancelled', 'admin_cancelled'}
            pending_rsvps = [
                r for r in rsvps
                if r.get('status', 'active') not in final_statuses
                and r.get('no_show') != True
            ]
            
            event_summary = {
                'event_id': event['event_id'],
                'title': event.get('title', ''),
                'end_time': end_time,
                'total_rsvps': len(rsvps),
                'pending_rsvps': len(pending_rsvps)
            }
            
            if pending_rsvps:
                pending_events.append(event_summary)
            else:
                ready_events.append(event_summary)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': f'{len(ready_events)} event(s) ready for completion, {len(pending_events)} still have pending RSVPs',
                'ready_events': ready_events,
                'pending_events': pending_events,
                'success': True
            })
        }
        
    except Exception as e:
        print(f"Error updating completed events: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Failed to update completed events: {str(e)}'})
        }

LBS_PER_BAG = 25


def _slugify(text):
    text = (text or '').lower()
    text = re.sub(r"[''']", '', text)
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return re.sub(r'^-+|-+$', '', text)


def _cancel_future_active_rsvps(email):
    """
    Cancel all of a volunteer's still-active RSVPs for events that haven't
    happened yet. Sets status to 'admin_cancelled'. Returns the count cancelled.
    Past events and already-finalized RSVPs (attended/no_show/cancelled) are
    left untouched. Minors under this guardian are cancelled too.
    """
    now = datetime.now(timezone.utc)
    cancelled = 0
    email = (email or '').lower()
    if not email:
        return 0

    # Collect this volunteer's RSVPs: their own (email) and minors they guard.
    rsvps = []
    try:
        # Volunteer's own RSVPs via the email index if present, else scan-filter.
        resp = rsvps_table.scan(
            FilterExpression=Attr('email').eq(email) | Attr('guardian_email').eq(email)
        )
        rsvps = resp.get('Items', [])
        while 'LastEvaluatedKey' in resp:
            resp = rsvps_table.scan(
                FilterExpression=Attr('email').eq(email) | Attr('guardian_email').eq(email),
                ExclusiveStartKey=resp['LastEvaluatedKey']
            )
            rsvps.extend(resp.get('Items', []))
    except ClientError as e:
        print(f"Error scanning RSVPs for {email}: {e}")
        return 0

    for rsvp in rsvps:
        if rsvp.get('status', 'active') != 'active':
            continue
        event_id = rsvp.get('event_id')
        attendee_id = rsvp.get('attendee_id')
        if not event_id or not attendee_id:
            continue
        # Only future events.
        ev = events_table.get_item(Key={'event_id': event_id}).get('Item', {})
        start = ev.get('start_time')
        if start:
            try:
                if datetime.fromisoformat(start.replace('Z', '+00:00')) <= now:
                    continue  # event already started/past
            except (ValueError, AttributeError):
                pass
        try:
            rsvps_table.update_item(
                Key={'event_id': event_id, 'attendee_id': attendee_id},
                UpdateExpression='SET #s = :c, updated_at = :now',
                ConditionExpression=Attr('status').eq('active'),
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues={
                    ':c': 'admin_cancelled',
                    ':now': now.isoformat(),
                }
            )
            cancelled += 1
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') != 'ConditionalCheckFailedException':
                print(f"Error cancelling RSVP {event_id}/{attendee_id}: {e}")
    return cancelled


def _send_suspension_email(email, first_name, reason):
    """Email the volunteer a notice with a link to the Code of Conduct. Never raises."""
    if not email:
        return False
    greeting = f"Hi {first_name}," if first_name else "Hello,"
    coc_url = f"{site_url}/code-of-conduct/"
    reason_line = f"<p>{reason}</p>" if reason else ""
    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f3f4f6;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:#991b1b;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;">Volunteer Status Update</h2>
    </div>
    <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;line-height:1.6;">
      <p>{greeting}</p>
      <p>Following a review, your volunteer access with Waterway Cleanups has been
      <strong>suspended</strong>, effective immediately. You will not be able to log in to the
      volunteer dashboard or register for events during this time, and any upcoming
      registrations have been cancelled.</p>
      {reason_line}
      <p>This action was taken under our
      <a href="{coc_url}">Code of Conduct &amp; Anti-Harassment Policy</a>. Please review it here:
      <br/><a href="{coc_url}">{coc_url}</a></p>
      <p>If you have questions about this decision, you may reply to this email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
      <p style="color:#9ca3af;font-size:12px;">Waterway Cleanups</p>
    </div>
  </div>
</body></html>"""
    text = (f"{greeting}\n\nFollowing a review, your volunteer access with Waterway Cleanups has "
            "been suspended, effective immediately. You will not be able to log in or register "
            "for events, and any upcoming registrations have been cancelled.\n\n"
            + (reason + "\n\n" if reason else "")
            + f"This action was taken under our Code of Conduct & Anti-Harassment Policy: {coc_url}\n\n"
            "If you have questions, you may reply to this email.\n\nWaterway Cleanups")
    try:
        ses.send_email(
            Source=sender_email,
            Destination={'ToAddresses': [email]},
            ReplyToAddresses=[sender_email],
            Message={
                'Subject': {'Data': 'Important: Your Waterway Cleanups volunteer status', 'Charset': 'UTF-8'},
                'Body': {
                    'Html': {'Data': html, 'Charset': 'UTF-8'},
                    'Text': {'Data': text, 'Charset': 'UTF-8'},
                }
            }
        )
        return True
    except Exception as e:
        print(f"Error sending suspension email to {email}: {e}")
        return False


def suspend_volunteer(body, headers):
    """
    Suspend a volunteer for a Code of Conduct violation. This:
      1. Flags the volunteers record as suspended (blocks login + dashboard).
      2. Hides them from the leaderboard (the flag is honored there).
      3. Cancels their active RSVPs for future events.
      4. Opts them out of all SES contact-list email (UnsubscribeAll).
      5. Emails them a notice with a link to the Code of Conduct.
    """
    email = (body.get('email') or '').strip().lower()
    reason = (body.get('reason') or '').strip()
    if not email:
        return {'statusCode': 400, 'headers': headers,
                'body': json.dumps({'error': 'email is required'})}

    now = datetime.now(timezone.utc).isoformat()

    # 1. Flag the volunteer record (create if missing so the flag always sticks).
    first_name = ''
    try:
        existing = volunteers_table.get_item(Key={'email': email}).get('Item', {})
        first_name = existing.get('first_name', '')
        volunteers_table.update_item(
            Key={'email': email},
            UpdateExpression=('SET suspended = :t, suspended_at = :now, '
                              'suspension_reason = :r, updated_at = :now, '
                              'created_at = if_not_exists(created_at, :now)'),
            ExpressionAttributeValues={':t': True, ':now': now, ':r': reason},
        )
    except ClientError as e:
        print(f"Error flagging volunteer {email}: {e}")
        return {'statusCode': 500, 'headers': headers,
                'body': json.dumps({'error': 'Failed to suspend volunteer'})}

    # 3. Cancel active future RSVPs.
    cancelled = _cancel_future_active_rsvps(email)

    # 4. Opt them out of all SES contact-list email (non-blocking).
    opted_out = _set_contact_unsubscribe_all(email, True)

    # 5. Email notice (non-blocking). Sent directly (not via the contact list),
    #    so the opt-out above doesn't suppress this one-time notice.
    emailed = _send_suspension_email(email, first_name, reason)

    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({
            'success': True,
            'message': f'Volunteer {email} suspended.',
            'email': email,
            'rsvps_cancelled': cancelled,
            'email_sent': emailed,
            'email_opted_out': opted_out,
        })
    }


def unsuspend_volunteer(body, headers):
    """Reinstate a suspended volunteer. Does not restore cancelled RSVPs.

    Re-subscribes them to SES email (clears UnsubscribeAll) so reinstated
    volunteers receive newsletters again. Their per-topic preferences are left
    as they were, so anyone who had deliberately opted out of a topic stays
    opted out of that topic.
    """
    email = (body.get('email') or '').strip().lower()
    if not email:
        return {'statusCode': 400, 'headers': headers,
                'body': json.dumps({'error': 'email is required'})}
    now = datetime.now(timezone.utc).isoformat()
    try:
        volunteers_table.update_item(
            Key={'email': email},
            UpdateExpression='SET suspended = :f, updated_at = :now REMOVE suspended_at, suspension_reason',
            ExpressionAttributeValues={':f': False, ':now': now},
        )
    except ClientError as e:
        print(f"Error unsuspending volunteer {email}: {e}")
        return {'statusCode': 500, 'headers': headers,
                'body': json.dumps({'error': 'Failed to reinstate volunteer'})}

    # Clear the all-email opt-out so reinstated volunteers can be contacted again.
    resubscribed = _set_contact_unsubscribe_all(email, False)

    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({
            'success': True,
            'message': f'Volunteer {email} reinstated.',
            'email': email,
            'email_resubscribed': resubscribed,
        })
    }


def create_adhoc_event(body, headers):
    """
    Create an ad hoc, private, completed event with cleanup metrics.

    Ad hoc events are unofficial cleanups that should appear only in aggregate
    impact stats (the /impact page), not as full event pages. They are marked
    ad_hoc=true and private=true so the Hugo generator skips page generation.

    Required: title, date (YYYY-MM-DD), bags_of_trash
    Optional: location_name, number_of_tires, large_items_weight_lbs OR
              total_litter_lbs, volunteer_count, event_hours
    """
    from decimal import Decimal
    try:
        title = (body.get('title') or '').strip()
        date_str = (body.get('date') or '').strip()
        if not title:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'error': 'title is required'})}
        if not date_str:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'error': 'date is required (YYYY-MM-DD)'})}

        bags_of_trash = body.get('bags_of_trash')
        if bags_of_trash is None:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'error': 'bags_of_trash is required'})}

        try:
            event_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return {'statusCode': 400, 'headers': headers,
                    'body': json.dumps({'error': 'date must be in YYYY-MM-DD format'})}

        bags_of_trash = int(bags_of_trash)
        number_of_tires = int(body.get('number_of_tires', 0))
        volunteer_count = int(body.get('volunteer_count', 0))
        event_hours = int(body.get('event_hours', 2) or 2)

        # Accept total_litter_lbs directly (source of truth), else derive from
        # bags + large items like the complete_event flow.
        if body.get('total_litter_lbs') is not None:
            total_litter_lbs = float(body.get('total_litter_lbs'))
            large_items_weight_lbs = max(0.0, total_litter_lbs - (bags_of_trash * LBS_PER_BAG))
        else:
            large_items_weight_lbs = float(body.get('large_items_weight_lbs', 0))
            total_litter_lbs = (bags_of_trash * LBS_PER_BAG) + large_items_weight_lbs

        location_name = (body.get('location_name') or title).strip()

        # 9am Eastern start; end based on event_hours so the date renders right.
        start_dt = datetime(event_date.year, event_date.month, event_date.day, 9, 0, 0,
                            tzinfo=timezone(timedelta(hours=-4)))
        end_dt = start_dt + timedelta(hours=event_hours)
        now = datetime.now(timezone.utc).isoformat()

        event_id = f"adhoc-{event_date.isoformat()}-{_slugify(location_name or title)}"[:120]

        item = {
            'event_id': event_id,
            'title': title,
            'description': (body.get('description') or 'Community cleanup (unofficial event).').strip(),
            'start_time': start_dt.isoformat(),
            'end_time': end_dt.isoformat(),
            'location': {'name': location_name, 'address': (body.get('location_address') or '').strip()},
            'status': 'completed',
            'ad_hoc': True,
            'private': True,
            'attendance_cap': 0,
            'volunteer_count': volunteer_count,
            'cleanup_metrics': {
                'bags_of_trash': bags_of_trash,
                'number_of_tires': number_of_tires,
                'large_items_weight_lbs': Decimal(str(large_items_weight_lbs)),
                'total_litter_lbs': Decimal(str(total_litter_lbs)),
            },
            'created_at': now,
            'updated_at': now,
        }

        try:
            events_table.put_item(
                Item=item,
                ConditionExpression='attribute_not_exists(event_id)'
            )
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
                return {'statusCode': 409, 'headers': headers,
                        'body': json.dumps({
                            'error': f'An ad hoc event already exists for this date and location ({event_id}).',
                            'event_id': event_id
                        })}
            raise

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': f'Ad hoc event {event_id} created',
                'event_id': event_id,
                'volunteer_count': volunteer_count,
                'cleanup_metrics': {
                    'bags_of_trash': bags_of_trash,
                    'number_of_tires': number_of_tires,
                    'large_items_weight_lbs': large_items_weight_lbs,
                    'total_litter_lbs': total_litter_lbs
                },
                'success': True
            })
        }

    except Exception as e:
        print(f"Error creating ad hoc event: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Failed to create ad hoc event: {str(e)}'})
        }


def mark_active_rsvps_attended(event_id):
    """
    Convert all RSVPs for an event that are still in 'active' status to
    'attended'. Records in any other status (no_show, cancelled, already
    attended, etc.) are left untouched.

    Returns the number of RSVPs updated. Never raises: completing the event
    must not fail just because attendance backfill hit a snag.
    """
    updated = 0
    try:
        query_kwargs = {
            'KeyConditionExpression': Key('event_id').eq(event_id),
            'FilterExpression': Attr('status').eq('active')
        }
        while True:
            resp = rsvps_table.query(**query_kwargs)
            for item in resp.get('Items', []):
                attendee_id = item.get('attendee_id')
                if attendee_id is None:
                    continue
                try:
                    rsvps_table.update_item(
                        Key={'event_id': event_id, 'attendee_id': attendee_id},
                        UpdateExpression='SET #status = :attended, updated_at = :now',
                        # Only flip it if it is still active, so we never clobber
                        # a status that changed between the query and the update.
                        ConditionExpression=Attr('status').eq('active'),
                        ExpressionAttributeNames={'#status': 'status'},
                        ExpressionAttributeValues={
                            ':attended': 'attended',
                            ':now': datetime.now(timezone.utc).isoformat()
                        }
                    )
                    updated += 1
                except ClientError as e:
                    code = e.response.get('Error', {}).get('Code', '')
                    if code == 'ConditionalCheckFailedException':
                        # Status changed out from under us; leave it alone.
                        continue
                    print(f"Error marking RSVP {attendee_id} attended: {e}")
            last_key = resp.get('LastEvaluatedKey')
            if not last_key:
                break
            query_kwargs['ExclusiveStartKey'] = last_key
    except Exception as e:
        print(f"Error converting active RSVPs to attended for {event_id}: {e}")
    return updated


def complete_event(body, headers):
    """
    Manually complete an event with cleanup metrics.
    Required: event_id, bags_of_trash
    Optional: number_of_tires, large_items_weight_lbs
    Auto-calculated: total_litter_lbs = (bags_of_trash * 25) + large_items_weight_lbs
    """
    try:
        event_id = body.get('event_id')
        if not event_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'event_id is required'})
            }

        bags_of_trash = body.get('bags_of_trash')
        if bags_of_trash is None:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'bags_of_trash is required'})
            }

        bags_of_trash = int(bags_of_trash)
        number_of_tires = int(body.get('number_of_tires', 0))
        large_items_weight_lbs = float(body.get('large_items_weight_lbs', 0))
        total_litter_lbs = (bags_of_trash * 25) + large_items_weight_lbs

        # Verify event exists and is active
        try:
            event_response = events_table.get_item(Key={'event_id': event_id})
            if 'Item' not in event_response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': f'Event {event_id} not found'})
                }
            event_data = event_response['Item']
            if event_data.get('status') not in ('active', None):
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'error': f'Event is already {event_data.get("status")}. Only active events can be completed.'})
                }
        except ClientError as e:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': f'Failed to retrieve event: {e.response["Error"]["Message"]}'})
            }

        # Update event with metrics and set status to completed
        now = datetime.now(timezone.utc).isoformat()
        from decimal import Decimal
        events_table.update_item(
            Key={'event_id': event_id},
            UpdateExpression='SET #status = :status, updated_at = :now, cleanup_metrics = :metrics',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'completed',
                ':now': now,
                ':metrics': {
                    'bags_of_trash': bags_of_trash,
                    'number_of_tires': number_of_tires,
                    'large_items_weight_lbs': Decimal(str(large_items_weight_lbs)),
                    'total_litter_lbs': Decimal(str(total_litter_lbs))
                }
            }
        )

        # Convert any still-active RSVPs to 'attended'. Other statuses
        # (no_show, cancelled, already attended) are left as-is.
        attended_count = mark_active_rsvps_attended(event_id)

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': f'Event {event_id} completed with metrics',
                'event_id': event_id,
                'rsvps_marked_attended': attended_count,
                'cleanup_metrics': {
                    'bags_of_trash': bags_of_trash,
                    'number_of_tires': number_of_tires,
                    'large_items_weight_lbs': large_items_weight_lbs,
                    'total_litter_lbs': total_litter_lbs
                },
                'success': True
            })
        }

    except Exception as e:
        print(f"Error completing event: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Failed to complete event: {str(e)}'})
        }

def update_cleanup_metrics(body, headers):
    """
    Add or update cleanup metrics on an existing event, without touching
    status/RSVPs. Unlike complete_event, this works on ANY event regardless
    of status (completed, ad hoc, or even active) — it's meant for correcting
    or backfilling stats after the fact.

    Required: event_id, bags_of_trash
    Optional: number_of_tires, large_items_weight_lbs, volunteer_count
    Auto-calculated: total_litter_lbs = (bags_of_trash * 25) + large_items_weight_lbs
    """
    try:
        event_id = body.get('event_id')
        if not event_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'event_id is required'})
            }

        bags_of_trash = body.get('bags_of_trash')
        if bags_of_trash is None:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'bags_of_trash is required'})
            }

        bags_of_trash = int(bags_of_trash)
        number_of_tires = int(body.get('number_of_tires', 0))
        large_items_weight_lbs = float(body.get('large_items_weight_lbs', 0))
        total_litter_lbs = (bags_of_trash * LBS_PER_BAG) + large_items_weight_lbs

        # Verify event exists (any status is fine here)
        try:
            event_response = events_table.get_item(Key={'event_id': event_id})
            if 'Item' not in event_response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': f'Event {event_id} not found'})
                }
        except ClientError as e:
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': f'Failed to retrieve event: {e.response["Error"]["Message"]}'})
            }

        from decimal import Decimal
        now = datetime.now(timezone.utc).isoformat()
        update_expr = 'SET updated_at = :now, cleanup_metrics = :metrics'
        expr_values = {
            ':now': now,
            ':metrics': {
                'bags_of_trash': bags_of_trash,
                'number_of_tires': number_of_tires,
                'large_items_weight_lbs': Decimal(str(large_items_weight_lbs)),
                'total_litter_lbs': Decimal(str(total_litter_lbs))
            }
        }

        # volunteer_count is optional — only touch it if explicitly provided,
        # since ad hoc/historical events rely on this field for impact stats.
        if body.get('volunteer_count') is not None:
            update_expr += ', volunteer_count = :vc'
            expr_values[':vc'] = int(body.get('volunteer_count'))

        events_table.update_item(
            Key={'event_id': event_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values
        )

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': f'Cleanup metrics updated for {event_id}',
                'event_id': event_id,
                'cleanup_metrics': {
                    'bags_of_trash': bags_of_trash,
                    'number_of_tires': number_of_tires,
                    'large_items_weight_lbs': large_items_weight_lbs,
                    'total_litter_lbs': total_litter_lbs
                },
                'success': True
            })
        }

    except Exception as e:
        print(f"Error updating cleanup metrics: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Failed to update cleanup metrics: {str(e)}'})
        }

def archive_events(body, headers):
    """
    Archive events based on criteria (age, status, etc.)
    """
    try:
        # Get archiving criteria from request
        archive_before_date = body.get('archive_before_date')
        archive_status = body.get('archive_status', 'completed')
        
        if not archive_before_date:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'archive_before_date is required'})
            }
        
        archived_events = []
        
        # Query events by status
        response = events_table.query(
            IndexName='status-start_time-index',
            KeyConditionExpression=Key('status').eq(archive_status)
        )
        
        events_to_archive = response.get('Items', [])
        
        for event in events_to_archive:
            event_date = event.get('start_time', '')
            if event_date < archive_before_date:
                # Update event status to archived
                try:
                    events_table.update_item(
                        Key={'event_id': event['event_id']},
                        UpdateExpression='SET #status = :status, updated_at = :updated_at',
                        ExpressionAttributeNames={'#status': 'status'},
                        ExpressionAttributeValues={
                            ':status': 'archived',
                            ':updated_at': datetime.now(timezone.utc).isoformat()
                        }
                    )
                    archived_events.append(event['event_id'])
                    print(f"Archived event {event['event_id']}")
                except ClientError as e:
                    print(f"Error archiving event {event['event_id']}: {e.response['Error']['Message']}")
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': f'Archived {len(archived_events)} events',
                'archived_events': archived_events,
                'success': True
            })
        }
        
    except Exception as e:
        print(f"Error archiving events: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Failed to archive events: {str(e)}'})
        }

def cancel_event(body, headers):
    """
    Cancel an event and notify registered volunteers
    """
    try:
        event_id = body.get('event_id')
        cancellation_reason = body.get('reason', 'Event cancelled')
        notify_volunteers = body.get('notify_volunteers', True)
        
        if not event_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'event_id is required'})
            }
        
        # Get event details
        try:
            event_response = events_table.get_item(Key={'event_id': event_id})
            if 'Item' not in event_response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'error': f'Event {event_id} not found'})
                }
            
            event_data = event_response['Item']
        except ClientError as e:
            print(f"Error getting event: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to retrieve event'})
            }
        
        # Update event status to cancelled
        try:
            events_table.update_item(
                Key={'event_id': event_id},
                UpdateExpression='SET #status = :status, updated_at = :updated_at, cancellation_reason = :reason',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'cancelled',
                    ':updated_at': datetime.now(timezone.utc).isoformat(),
                    ':reason': cancellation_reason
                }
            )
        except ClientError as e:
            print(f"Error updating event status: {e.response['Error']['Message']}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'error': 'Failed to cancel event'})
            }
        
        # Update RSVPs to admin_cancelled status
        notified_volunteers = []
        try:
            # Get all active RSVPs for this event
            rsvp_response = rsvps_table.query(
                KeyConditionExpression=Key('event_id').eq(event_id),
                FilterExpression=Attr('status').eq('active')
            )
            
            active_rsvps = rsvp_response.get('Items', [])
            
            for rsvp in active_rsvps:
                # Update RSVP status to admin_cancelled (distinct from volunteer-initiated cancellation)
                rsvps_table.update_item(
                    Key={'event_id': event_id, 'attendee_id': rsvp['attendee_id']},
                    UpdateExpression='SET #status = :status, updated_at = :updated_at, cancellation_reason = :reason',
                    ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={
                        ':status': 'admin_cancelled',
                        ':updated_at': datetime.now(timezone.utc).isoformat(),
                        ':reason': f'Event cancelled: {cancellation_reason}'
                    }
                )
                
                # Send notification via SNS if requested
                if notify_volunteers:
                    try:
                        message = {
                            'type': 'event_cancellation',
                            'event_id': event_id,
                            'event_title': event_data.get('title', 'Event'),
                            'volunteer_email': rsvp.get('email', ''),
                            'reason': cancellation_reason,
                            'event_start_time': event_data.get('start_time'),
                            'event_location': event_data.get('location', {}).get('name', 'TBD')
                        }
                        
                        sns.publish(
                            TopicArn=sns_topic_arn,
                            Message=json.dumps(message),
                            Subject=f'Event Cancelled: {event_data.get("title", "Event")}'
                        )
                        
                        notified_volunteers.append(rsvp.get('email', ''))
                        print(f"Notified volunteer {rsvp.get('email', '')} about event cancellation")
                        
                    except ClientError as e:
                        print(f"Error sending notification to {rsvp.get('email', '')}: {e.response['Error']['Message']}")
                    
        except ClientError as e:
            print(f"Error processing RSVPs: {e.response['Error']['Message']}")
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': f'Event {event_id} cancelled successfully',
                'event_id': event_id,
                'notified_volunteers': notified_volunteers,
                'notification_count': len(notified_volunteers),
                'success': True
            })
        }
        
    except Exception as e:
        print(f"Error cancelling event: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Failed to cancel event: {str(e)}'})
        }

def categorize_events(headers):
    """
    Categorize events based on their dates (upcoming, current, past)
    """
    try:
        current_time = datetime.now(timezone.utc).isoformat()
        categories = {
            'upcoming': [],
            'current': [],
            'past': []
        }
        
        # Scan all active events
        response = events_table.query(
            IndexName='status-start_time-index',
            KeyConditionExpression=Key('status').eq('active')
        )
        
        active_events = response.get('Items', [])
        
        for event in active_events:
            start_time = event.get('start_time', '')
            end_time = event.get('end_time', '')
            
            if end_time and end_time < current_time:
                categories['past'].append({
                    'event_id': event['event_id'],
                    'title': event.get('title', ''),
                    'start_time': start_time,
                    'end_time': end_time
                })
            elif start_time and start_time > current_time:
                categories['upcoming'].append({
                    'event_id': event['event_id'],
                    'title': event.get('title', ''),
                    'start_time': start_time,
                    'end_time': end_time
                })
            else:
                categories['current'].append({
                    'event_id': event['event_id'],
                    'title': event.get('title', ''),
                    'start_time': start_time,
                    'end_time': end_time
                })
        
        # Sort each category by start_time
        for category in categories.values():
            category.sort(key=lambda x: x['start_time'])
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'categories': categories,
                'summary': {
                    'upcoming_count': len(categories['upcoming']),
                    'current_count': len(categories['current']),
                    'past_count': len(categories['past'])
                },
                'success': True
            })
        }
        
    except Exception as e:
        print(f"Error categorizing events: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': f'Failed to categorize events: {str(e)}'})
        }