"""
Helper functions for managing volunteer metrics in the normalized data structure
"""
import boto3
from botocore.exceptions import ClientError
from decimal import Decimal

def update_volunteer_metrics(volunteers_table, email, metric_updates):
    """
    Update volunteer metrics atomically
    
    Args:
        volunteers_table: DynamoDB table resource for volunteers
        email: Volunteer email
        metric_updates: Dict of metrics to update (e.g., {'total_rsvps': 1, 'total_cancellations': 1})
    """
    try:
        # Build update expression for metrics
        update_expression_parts = []
        expression_values = {}
        
        for metric, increment in metric_updates.items():
            if increment != 0:
                update_expression_parts.append(f"volunteer_metrics.{metric} :inc_{metric}")
                expression_values[f":inc_{metric}"] = increment
        
        if not update_expression_parts:
            return True  # No updates needed
        
        update_expression = "ADD " + ", ".join(update_expression_parts)
        
        volunteers_table.update_item(
            Key={'email': email},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values
        )
        
        return True
        
    except ClientError as e:
        print(f"Error updating volunteer metrics for {email}: {e}")
        return False

def recalculate_volunteer_metrics(volunteers_table, rsvps_table, email):
    """
    Recalculate all volunteer metrics from scratch based on RSVP history
    
    Args:
        volunteers_table: DynamoDB table resource for volunteers
        rsvps_table: DynamoDB table resource for RSVPs
        email: Volunteer email
    """
    try:
        # Query all RSVPs for this volunteer
        from boto3.dynamodb.conditions import Key
        
        rsvp_response = rsvps_table.query(
            IndexName='email-created_at-index',
            KeyConditionExpression=Key('email').eq(email)
        )
        
        # Calculate metrics
        total_rsvps = 0
        total_cancellations = 0
        total_no_shows = 0
        total_attended = 0
        first_event_date = None
        last_event_date = None
        
        for rsvp in rsvp_response.get('Items', []):
            total_rsvps += 1
            
            if rsvp.get('status') == 'cancelled':
                total_cancellations += 1
            
            if rsvp.get('no_show') == True:
                total_no_shows += 1
            
            # For attended, we assume active RSVPs that are not no-shows are attended
            # This could be enhanced with explicit attendance tracking
            if rsvp.get('status') == 'active' and not rsvp.get('no_show'):
                total_attended += 1
            
            # Track date range
            created_at = rsvp.get('created_at')
            if created_at:
                if not first_event_date or created_at < first_event_date:
                    first_event_date = created_at
                if not last_event_date or created_at > last_event_date:
                    last_event_date = created_at
        
        # Update volunteer metrics
        update_expression = """
            SET volunteer_metrics.total_rsvps = :total_rsvps,
                volunteer_metrics.total_cancellations = :total_cancellations,
                volunteer_metrics.total_no_shows = :total_no_shows,
                volunteer_metrics.total_attended = :total_attended
        """
        
        expression_values = {
            ':total_rsvps': total_rsvps,
            ':total_cancellations': total_cancellations,
            ':total_no_shows': total_no_shows,
            ':total_attended': total_attended
        }
        
        if first_event_date:
            update_expression += ", volunteer_metrics.first_event_date = :first_event_date"
            expression_values[':first_event_date'] = first_event_date
        
        if last_event_date:
            update_expression += ", volunteer_metrics.last_event_date = :last_event_date"
            expression_values[':last_event_date'] = last_event_date
        
        volunteers_table.update_item(
            Key={'email': email},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values
        )
        
        return True
        
    except ClientError as e:
        print(f"Error recalculating volunteer metrics for {email}: {e}")
        return False