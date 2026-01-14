"""
Lambda function to update a minor's information
"""
import json
import boto3
import os
from datetime import datetime, date

dynamodb = boto3.resource('dynamodb')
minors_table = dynamodb.Table(os.environ.get('MINORS_TABLE_NAME', 'minors'))
session_table = dynamodb.Table(os.environ.get('SESSION_TABLE_NAME', 'auth_sessions'))

def calculate_age(date_of_birth_str):
    """Calculate age from date of birth string (YYYY-MM-DD)"""
    dob = datetime.strptime(date_of_birth_str, '%Y-%m-%d').date()
    today = date.today()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return age

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
    """Lambda handler for updating a minor"""
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
        
        print(f"Updating minor {minor_id} for guardian: {guardian_email}")
        
        # Verify the minor belongs to this guardian
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
        
        # Build update expression dynamically
        update_expressions = []
        expression_attribute_names = {}
        expression_attribute_values = {':updated_at': datetime.utcnow().isoformat() + 'Z'}
        
        # Update first_name if provided
        if body.get('first_name'):
            update_expressions.append('#first_name = :first_name')
            expression_attribute_names['#first_name'] = 'first_name'
            expression_attribute_values[':first_name'] = body['first_name']
        
        # Update last_name if provided
        if body.get('last_name'):
            update_expressions.append('#last_name = :last_name')
            expression_attribute_names['#last_name'] = 'last_name'
            expression_attribute_values[':last_name'] = body['last_name']
        
        # Update date_of_birth if provided
        if body.get('date_of_birth'):
            try:
                datetime.strptime(body['date_of_birth'], '%Y-%m-%d')
            except ValueError:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'message': 'Invalid date of birth format. Please use YYYY-MM-DD format.'
                    })
                }
            
            age = calculate_age(body['date_of_birth'])
            if age >= 18:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'message': 'Only minors (under 18 years old) can be on your account.'
                    })
                }
            
            update_expressions.append('#date_of_birth = :date_of_birth')
            update_expressions.append('#age = :age')
            expression_attribute_names['#date_of_birth'] = 'date_of_birth'
            expression_attribute_names['#age'] = 'age'
            expression_attribute_values[':date_of_birth'] = body['date_of_birth']
            expression_attribute_values[':age'] = age
        
        # Update email if provided
        if 'email' in body:
            email = body['email'].strip()
            if email:
                if '@' not in email or '.' not in email.split('@')[1]:
                    return {
                        'statusCode': 400,
                        'headers': headers,
                        'body': json.dumps({'success': False, 'message': 'Invalid email format'})
                    }
                update_expressions.append('#email = :email')
                expression_attribute_names['#email'] = 'email'
                expression_attribute_values[':email'] = email.lower()
            else:
                # Remove email if empty string provided
                update_expressions.append('REMOVE #email')
                expression_attribute_names['#email'] = 'email'
        
        # Always update updated_at
        update_expressions.append('#updated_at = :updated_at')
        expression_attribute_names['#updated_at'] = 'updated_at'
        
        if len(update_expressions) == 1:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'success': False, 'message': 'No fields to update'})
            }
        
        # Perform update
        update_expression = 'SET ' + ', '.join([expr for expr in update_expressions if not expr.startswith('REMOVE')])
        remove_expressions = [expr.replace('REMOVE ', '') for expr in update_expressions if expr.startswith('REMOVE')]
        if remove_expressions:
            update_expression += ' REMOVE ' + ', '.join(remove_expressions)
        
        response = minors_table.update_item(
            Key={'guardian_email': guardian_email, 'minor_id': minor_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues='ALL_NEW'
        )
        
        updated_minor = response['Attributes']
        
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
                'message': 'Minor updated successfully',
                'minor': {
                    'minor_id': updated_minor['minor_id'],
                    'first_name': updated_minor['first_name'],
                    'last_name': updated_minor['last_name'],
                    'date_of_birth': updated_minor['date_of_birth'],
                    'age': updated_minor['age'],
                    'email': updated_minor.get('email'),
                    'updated_at': updated_minor['updated_at']
                }
            })
        }
        
    except Exception as e:
        print(f"Error updating minor: {e}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'message': 'Internal server error'})
        }
