"""
Lambda function to delete a minor from a volunteer's account
"""
import json
import boto3
import os
from datetime import datetime
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
minors_table = dynamodb.Table(os.environ.get('MINORS_TABLE_NAME', 'minors'))
session_table = dynamodb.Table(os.environ.get('SESSION_TABLE_NAME', 'auth_sessions'))
event_rsvps_table = dynamodb.Table(os.environ.get('EVENT_RSVPS_TABLE_NAME', 'event_rsvps'))
events_table = dynamodb.Table(os.environ.get('EVENTS_TABLE_NAME', 'events'))

def validate_session(session_token):
    """Validate session token and return session data"""
    try:
        # Query directly using session_token as the primary key
        response = session_table.get_item(
            Key={'session_token': session_token}
        )
        
        session = response.get('Item')
        if not session:
            return None
        
        # Check if session has expired
        expires_at = datetime.fromisoformat(session['expires_at'].replace('Z', '+00:00'))
        if expires_at <= datetime.now(expires_at.tzinfo):
            return None
        
        return session
    except Exception as e:
        print(f"Error validating session: {e}")
        return None

def handler(event, context):
    """Lambda handler for deleting a minor"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS request for CORS
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'CORS preflight successful'})
        }
    
    if event.get('httpMethod') != 'POST':
        return {
            'statusCode': 405,
            'headers': headers,
            'body': json.dumps({'success': False, 'message': 'Method Not Allowed'})
        }
    
    try:
        body = json.loads(event.get('body', '{}'))
        
        # Validate session token
        session_token = body.get('session_token')
        if not session_token:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'success': False, 'message': 'Session token is required'})
            }
        
        # Validate session
        session = validate_session(session_token)
        if not session:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'success': False, 'message': 'Invalid or expired session'})
            }
        
        guardian_email = session['email']
        
        # Validate minor_id
        minor_id = body.get('minor_id')
        if not minor_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'success': False, 'message': 'minor_id is required'})
            }
        
        print(f"Deleting minor {minor_id} for guardian: {guardian_email}")
        
        # Verify the minor exists and belongs to this guardian before deleting
        try:
            response = minors_table.get_item(
                Key={'guardian_email': guardian_email, 'minor_id': minor_id}
            )
            
            if 'Item' not in response:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'message': 'Minor not found or does not belong to your account'
                    })
                }
        except Exception as e:
            print(f"Error fetching minor: {e}")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({'success': False, 'message': 'Error verifying minor'})
            }
        
        # Delete the minor
        minors_table.delete_item(
            Key={'guardian_email': guardian_email, 'minor_id': minor_id}
        )
        print(f"Minor deleted successfully: {minor_id}")
        
        # Cancel all future event RSVPs for this minor
        try:
            from boto3.dynamodb.conditions import Key
            
            # Query all RSVPs for this minor
            rsvp_response = event_rsvps_table.query(
                IndexName='attendee-index',
                KeyConditionExpression=Key('attendee_id').eq(minor_id)
            )
            
            rsvps_to_cancel = rsvp_response.get('Items', [])
            cancelled_count = 0
            
            for rsvp in rsvps_to_cancel:
                event_id = rsvp['event_id']
                
                # Check if event is in the future
                try:
                    event_response = events_table.get_item(Key={'event_id': event_id})
                    event = event_response.get('Item')
                    
                    if event:
                        event_date = datetime.fromisoformat(event['event_date'].replace('Z', '+00:00'))
                        if event_date > datetime.now(event_date.tzinfo):
                            # Event is in the future, cancel the RSVP
                            event_rsvps_table.delete_item(
                                Key={
                                    'event_id': event_id,
                                    'attendee_id': minor_id
                                }
                            )
                            cancelled_count += 1
                            print(f"Cancelled RSVP for minor {minor_id} at event {event_id}")
                except Exception as e:
                    print(f"Error cancelling RSVP for event {event_id}: {e}")
                    # Continue with other RSVPs
            
            if cancelled_count > 0:
                print(f"Cancelled {cancelled_count} future event RSVP(s) for minor {minor_id}")
        except Exception as e:
            print(f"Error cancelling RSVPs: {e}")
            # Don't fail the delete operation if RSVP cleanup fails
        
        # Update session last accessed time (optional - session_token is the key)
        try:
            session_table.update_item(
                Key={'session_token': session_token},
                UpdateExpression='SET last_accessed = :last_accessed',
                ExpressionAttributeValues={
                    ':last_accessed': datetime.utcnow().isoformat() + 'Z'
                }
            )
        except:
            pass  # Non-critical if this fails
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': 'Minor deleted successfully',
                'minor_id': minor_id
            })
        }
        
    except Exception as e:
        print(f"Error deleting minor: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'message': 'Internal server error'})
        }
