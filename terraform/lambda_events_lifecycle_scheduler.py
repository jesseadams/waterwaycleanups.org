import json
import boto3
import os
from datetime import datetime, timezone

# Initialize Lambda client
lambda_client = boto3.client('lambda')

# Get environment variables
lifecycle_function_name = os.environ.get('LIFECYCLE_FUNCTION_NAME')

def handler(event, context):
    """
    Scheduled Lambda function to trigger event lifecycle management tasks
    This function is triggered by CloudWatch Events on a schedule
    """
    print(f"Scheduled lifecycle management triggered at {datetime.now(timezone.utc).isoformat()}")
    
    try:
        # Task 1: Update completed events
        print("Triggering automatic status updates for completed events...")
        update_response = lambda_client.invoke(
            FunctionName=lifecycle_function_name,
            InvocationType='Event',  # Asynchronous invocation
            Payload=json.dumps({
                'body': json.dumps({'action': 'update_completed_events'})
            })
        )
        print(f"Update completed events response: {update_response['StatusCode']}")
        
        # Task 2: Categorize events (for monitoring/reporting)
        print("Triggering event categorization...")
        categorize_response = lambda_client.invoke(
            FunctionName=lifecycle_function_name,
            InvocationType='Event',  # Asynchronous invocation
            Payload=json.dumps({
                'body': json.dumps({'action': 'categorize_events'})
            })
        )
        print(f"Categorize events response: {categorize_response['StatusCode']}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Lifecycle management tasks triggered successfully',
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'tasks_triggered': ['update_completed_events', 'categorize_events']
            })
        }
        
    except Exception as e:
        print(f"Error triggering lifecycle management: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': f'Failed to trigger lifecycle management: {str(e)}',
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        }