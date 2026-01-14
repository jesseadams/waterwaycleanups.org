import json
import os
import boto3
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')

# Get environment variables
events_table_name = os.environ.get('EVENTS_TABLE_NAME')
rsvps_table_name = os.environ.get('RSVPS_TABLE_NAME')
volunteers_table_name = os.environ.get('VOLUNTEERS_TABLE_NAME')
sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')

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
                    'error': 'Invalid action. Supported actions: update_completed_events, archive_events, cancel_event, categorize_events'
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
    Automatically update status of events that have passed their end time
    """
    try:
        current_time = datetime.now(timezone.utc).isoformat()
        updated_events = []
        
        # Query active events
        response = events_table.query(
            IndexName='status-start_time-index',
            KeyConditionExpression=Key('status').eq('active')
        )
        
        active_events = response.get('Items', [])
        
        for event in active_events:
            end_time = event.get('end_time')
            if end_time and end_time < current_time:
                # Update event status to completed
                try:
                    events_table.update_item(
                        Key={'event_id': event['event_id']},
                        UpdateExpression='SET #status = :status, updated_at = :updated_at',
                        ExpressionAttributeNames={'#status': 'status'},
                        ExpressionAttributeValues={
                            ':status': 'completed',
                            ':updated_at': current_time
                        }
                    )
                    updated_events.append(event['event_id'])
                    print(f"Updated event {event['event_id']} to completed status")
                except ClientError as e:
                    print(f"Error updating event {event['event_id']}: {e.response['Error']['Message']}")
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': f'Updated {len(updated_events)} events to completed status',
                'updated_events': updated_events,
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
        
        # Update RSVPs to cancelled status
        notified_volunteers = []
        if notify_volunteers:
            try:
                # Get all active RSVPs for this event
                rsvp_response = rsvps_table.query(
                    KeyConditionExpression=Key('event_id').eq(event_id),
                    FilterExpression=Attr('status').eq('active')
                )
                
                active_rsvps = rsvp_response.get('Items', [])
                
                for rsvp in active_rsvps:
                    # Update RSVP status
                    rsvps_table.update_item(
                        Key={'event_id': event_id, 'email': rsvp['email']},
                        UpdateExpression='SET #status = :status, updated_at = :updated_at, cancellation_reason = :reason',
                        ExpressionAttributeNames={'#status': 'status'},
                        ExpressionAttributeValues={
                            ':status': 'cancelled',
                            ':updated_at': datetime.now(timezone.utc).isoformat(),
                            ':reason': f'Event cancelled: {cancellation_reason}'
                        }
                    )
                    
                    # Send notification via SNS
                    try:
                        message = {
                            'type': 'event_cancellation',
                            'event_id': event_id,
                            'event_title': event_data.get('title', 'Event'),
                            'volunteer_email': rsvp['email'],
                            'reason': cancellation_reason,
                            'event_start_time': event_data.get('start_time'),
                            'event_location': event_data.get('location', {}).get('name', 'TBD')
                        }
                        
                        sns.publish(
                            TopicArn=sns_topic_arn,
                            Message=json.dumps(message),
                            Subject=f'Event Cancelled: {event_data.get("title", "Event")}'
                        )
                        
                        notified_volunteers.append(rsvp['email'])
                        print(f"Notified volunteer {rsvp['email']} about event cancellation")
                        
                    except ClientError as e:
                        print(f"Error sending notification to {rsvp['email']}: {e.response['Error']['Message']}")
                        
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