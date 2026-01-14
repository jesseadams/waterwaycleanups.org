"""
Cascading updates utility for the database-driven events system
Handles updates that need to propagate across Events, Volunteers, and RSVPs tables
"""
import json
import boto3
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Tuple
from botocore.exceptions import ClientError
from decimal import Decimal

from data_validation_utils import (
    ValidationError, DataConsistencyError, EventValidator, 
    VolunteerValidator, RSVPValidator, DataConsistencyChecker
)

class CascadingUpdateManager:
    """Manages cascading updates across related tables"""
    
    def __init__(self, events_table, volunteers_table, rsvps_table):
        self.events_table = events_table
        self.volunteers_table = volunteers_table
        self.rsvps_table = rsvps_table
        self.update_log = []
    
    def update_event_with_cascading(self, event_id: str, updates: Dict[str, Any], user_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an event and cascade changes to related RSVPs and volunteers
        
        Args:
            event_id: ID of the event to update
            updates: Dictionary of fields to update
            user_context: User context for authorization
            
        Returns:
            Dictionary with update results and any warnings
        """
        self.update_log = []
        warnings = []
        
        try:
            # Step 1: Validate the update data
            validation_errors = EventValidator.validate_event_data(updates, is_update=True)
            if validation_errors:
                raise ValidationError("Event validation failed", field="event_data")
            
            # Step 2: Get current event data
            current_event = self._get_event_safely(event_id)
            if not current_event:
                raise ValueError(f"Event {event_id} not found")
            
            # Step 3: Check for critical changes that require cascading updates
            critical_changes = self._identify_critical_changes(current_event, updates)
            
            # Step 4: Get affected RSVPs if there are critical changes
            affected_rsvps = []
            if critical_changes:
                affected_rsvps = self._get_event_rsvps(event_id)
            
            # Step 5: Validate consistency before making changes
            if affected_rsvps:
                proposed_event = {**current_event, **updates}
                consistency_errors = DataConsistencyChecker.check_event_rsvp_consistency(
                    proposed_event, affected_rsvps
                )
                if consistency_errors:
                    warnings.extend([error.message for error in consistency_errors])
            
            # Step 6: Perform the event update
            updated_event = self._update_event_record(event_id, updates)
            self.update_log.append(f"Updated event {event_id}")
            
            # Step 7: Perform cascading updates
            cascade_results = self._perform_cascading_updates(
                event_id, current_event, updated_event, affected_rsvps, critical_changes
            )
            
            return {
                'success': True,
                'event': updated_event,
                'cascading_updates': cascade_results,
                'warnings': warnings,
                'update_log': self.update_log
            }
            
        except Exception as e:
            # Rollback any partial changes if possible
            self._attempt_rollback(event_id, current_event if 'current_event' in locals() else None)
            raise e
    
    def update_volunteer_with_validation(self, email: str, updates: Dict[str, Any], user_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update a volunteer with comprehensive validation and consistency checks
        
        Args:
            email: Email of the volunteer to update
            updates: Dictionary of fields to update
            user_context: User context for authorization
            
        Returns:
            Dictionary with update results
        """
        self.update_log = []
        
        # Step 1: Validate the update data
        validation_errors = VolunteerValidator.validate_volunteer_data(updates, is_update=True)
        if validation_errors:
            raise ValidationError("Volunteer validation failed", field="volunteer_data")
        
        # Step 2: Get current volunteer data
        current_volunteer = self._get_volunteer_safely(email)
        if not current_volunteer:
            raise ValueError(f"Volunteer {email} not found")
        
        # Step 3: Check if email is being changed (requires special handling)
        if 'email' in updates and updates['email'].lower() != email.lower():
            return self._handle_email_change(email, updates['email'], updates, user_context)
        
        # Step 4: Update volunteer record
        updated_volunteer = self._update_volunteer_record(email, updates)
        self.update_log.append(f"Updated volunteer {email}")
        
        # Step 5: Validate metrics consistency if requested
        if updates.get('validate_metrics', False):
            rsvp_history = self._get_volunteer_rsvps(email)
            consistency_errors = DataConsistencyChecker.check_volunteer_metrics_consistency(
                updated_volunteer, rsvp_history
            )
            if consistency_errors:
                # Fix metrics automatically
                corrected_metrics = self._calculate_correct_metrics(rsvp_history)
                self._update_volunteer_metrics(email, corrected_metrics)
                self.update_log.append(f"Corrected metrics for volunteer {email}")
        
        return {
            'success': True,
            'volunteer': updated_volunteer,
            'update_log': self.update_log
        }
    
    def update_rsvp_with_cascading(self, event_id: str, email: str, updates: Dict[str, Any], user_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an RSVP and cascade changes to volunteer metrics
        
        Args:
            event_id: ID of the event
            email: Email of the volunteer
            updates: Dictionary of fields to update
            user_context: User context for authorization
            
        Returns:
            Dictionary with update results
        """
        self.update_log = []
        
        # Step 1: Validate the update data
        validation_errors = RSVPValidator.validate_rsvp_data(updates, is_update=True)
        if validation_errors:
            raise ValidationError("RSVP validation failed", field="rsvp_data")
        
        # Step 2: Get current RSVP data
        current_rsvp = self._get_rsvp_safely(event_id, email)
        if not current_rsvp:
            raise ValueError(f"RSVP not found for {email} at event {event_id}")
        
        # Step 3: Check for status changes that affect metrics
        old_status = current_rsvp.get('status', 'active')
        new_status = updates.get('status', old_status)
        
        # Step 4: Update RSVP record
        updated_rsvp = self._update_rsvp_record(event_id, email, updates)
        self.update_log.append(f"Updated RSVP for {email} at event {event_id}")
        
        # Step 5: Update volunteer metrics if status changed
        if old_status != new_status:
            self._update_volunteer_metrics_for_status_change(email, old_status, new_status)
            self.update_log.append(f"Updated volunteer metrics for {email} due to status change")
        
        return {
            'success': True,
            'rsvp': updated_rsvp,
            'update_log': self.update_log
        }
    
    def _identify_critical_changes(self, current_event: Dict[str, Any], updates: Dict[str, Any]) -> List[str]:
        """Identify changes that require cascading updates"""
        critical_changes = []
        
        # Time changes
        if 'start_time' in updates and updates['start_time'] != current_event.get('start_time'):
            critical_changes.append('start_time')
        if 'end_time' in updates and updates['end_time'] != current_event.get('end_time'):
            critical_changes.append('end_time')
        
        # Location changes
        if 'location' in updates and updates['location'] != current_event.get('location'):
            critical_changes.append('location')
        
        # Status changes
        if 'status' in updates and updates['status'] != current_event.get('status'):
            critical_changes.append('status')
        
        # Attendance cap changes
        if 'attendance_cap' in updates and updates['attendance_cap'] != current_event.get('attendance_cap'):
            critical_changes.append('attendance_cap')
        
        return critical_changes
    
    def _perform_cascading_updates(self, event_id: str, old_event: Dict[str, Any], 
                                 new_event: Dict[str, Any], affected_rsvps: List[Dict[str, Any]], 
                                 critical_changes: List[str]) -> Dict[str, Any]:
        """Perform cascading updates based on critical changes"""
        results = {
            'rsvps_updated': 0,
            'volunteers_notified': 0,
            'actions_taken': []
        }
        
        if not critical_changes or not affected_rsvps:
            return results
        
        # Handle status changes
        if 'status' in critical_changes:
            new_status = new_event.get('status')
            if new_status == 'cancelled':
                results.update(self._handle_event_cancellation(event_id, affected_rsvps))
            elif new_status == 'completed':
                results.update(self._handle_event_completion(event_id, affected_rsvps))
        
        # Handle attendance cap changes
        if 'attendance_cap' in critical_changes:
            results.update(self._handle_attendance_cap_change(event_id, new_event, affected_rsvps))
        
        # Handle time/location changes (notification only)
        if any(change in critical_changes for change in ['start_time', 'end_time', 'location']):
            results.update(self._handle_event_details_change(event_id, old_event, new_event, affected_rsvps))
        
        return results
    
    def _handle_event_cancellation(self, event_id: str, affected_rsvps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Handle cascading updates when an event is cancelled"""
        results = {'rsvps_updated': 0, 'actions_taken': ['event_cancelled']}
        
        # Update all active RSVPs to cancelled status
        for rsvp in affected_rsvps:
            if rsvp.get('status') == 'active':
                try:
                    self.rsvps_table.update_item(
                        Key={'event_id': event_id, 'email': rsvp['email']},
                        UpdateExpression='SET #status = :status, updated_at = :updated_at, cancellation_reason = :reason',
                        ExpressionAttributeNames={'#status': 'status'},
                        ExpressionAttributeValues={
                            ':status': 'cancelled',
                            ':updated_at': datetime.now(timezone.utc).isoformat(),
                            ':reason': 'Event cancelled by organizer'
                        }
                    )
                    results['rsvps_updated'] += 1
                    self.update_log.append(f"Cancelled RSVP for {rsvp['email']} due to event cancellation")
                except ClientError as e:
                    self.update_log.append(f"Failed to cancel RSVP for {rsvp['email']}: {str(e)}")
        
        return results
    
    def _handle_event_completion(self, event_id: str, affected_rsvps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Handle cascading updates when an event is completed"""
        results = {'actions_taken': ['event_completed']}
        
        # Mark no-shows for active RSVPs (optional - could be manual process)
        active_rsvps = [r for r in affected_rsvps if r.get('status') == 'active']
        if active_rsvps:
            results['actions_taken'].append(f'identified_{len(active_rsvps)}_potential_no_shows')
            self.update_log.append(f"Event completed with {len(active_rsvps)} active RSVPs - manual attendance tracking may be needed")
        
        return results
    
    def _handle_attendance_cap_change(self, event_id: str, new_event: Dict[str, Any], 
                                    affected_rsvps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Handle cascading updates when attendance cap changes"""
        results = {'actions_taken': []}
        
        new_cap = int(new_event.get('attendance_cap', 0))
        active_rsvps = [r for r in affected_rsvps if r.get('status') == 'active']
        
        if len(active_rsvps) > new_cap:
            # Attendance cap reduced below current RSVPs
            excess_count = len(active_rsvps) - new_cap
            results['actions_taken'].append(f'attendance_cap_exceeded_by_{excess_count}')
            self.update_log.append(f"Warning: Event has {len(active_rsvps)} active RSVPs but cap is now {new_cap}")
        
        return results
    
    def _handle_event_details_change(self, event_id: str, old_event: Dict[str, Any], 
                                   new_event: Dict[str, Any], affected_rsvps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Handle cascading updates when event details change"""
        results = {'volunteers_notified': len(affected_rsvps), 'actions_taken': ['details_changed']}
        
        # Log the changes for notification system
        changes = []
        if old_event.get('start_time') != new_event.get('start_time'):
            changes.append('start_time')
        if old_event.get('end_time') != new_event.get('end_time'):
            changes.append('end_time')
        if old_event.get('location') != new_event.get('location'):
            changes.append('location')
        
        self.update_log.append(f"Event details changed ({', '.join(changes)}) - {len(affected_rsvps)} volunteers should be notified")
        
        return results
    
    def _handle_email_change(self, old_email: str, new_email: str, updates: Dict[str, Any], 
                           user_context: Dict[str, Any]) -> Dict[str, Any]:
        """Handle volunteer email change (requires moving RSVPs)"""
        # This is a complex operation that should be done carefully
        # For now, we'll prevent email changes and require manual intervention
        raise ValidationError(
            "Email changes are not supported through this API. Please contact support for email changes.",
            field="email",
            code="EMAIL_CHANGE_NOT_SUPPORTED"
        )
    
    def _update_volunteer_metrics_for_status_change(self, email: str, old_status: str, new_status: str):
        """Update volunteer metrics when RSVP status changes"""
        try:
            # Determine metric changes
            metric_changes = {}
            
            # Decrement old status count
            if old_status == 'cancelled':
                metric_changes['total_cancellations'] = -1
            elif old_status == 'no_show':
                metric_changes['total_no_shows'] = -1
            elif old_status == 'attended':
                metric_changes['total_attended'] = -1
            
            # Increment new status count
            if new_status == 'cancelled':
                metric_changes['total_cancellations'] = metric_changes.get('total_cancellations', 0) + 1
            elif new_status == 'no_show':
                metric_changes['total_no_shows'] = metric_changes.get('total_no_shows', 0) + 1
            elif new_status == 'attended':
                metric_changes['total_attended'] = metric_changes.get('total_attended', 0) + 1
            
            # Apply changes
            if metric_changes:
                update_expression_parts = []
                expression_values = {}
                
                for metric, change in metric_changes.items():
                    if change != 0:
                        update_expression_parts.append(f"volunteer_metrics.{metric} :change_{metric}")
                        expression_values[f':change_{metric}'] = change
                
                if update_expression_parts:
                    update_expression = "ADD " + ", ".join(update_expression_parts)
                    self.volunteers_table.update_item(
                        Key={'email': email},
                        UpdateExpression=update_expression,
                        ExpressionAttributeValues=expression_values
                    )
        
        except ClientError as e:
            self.update_log.append(f"Failed to update metrics for {email}: {str(e)}")
    
    def _calculate_correct_metrics(self, rsvp_history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate correct volunteer metrics from RSVP history"""
        metrics = {
            'total_rsvps': len(rsvp_history),
            'total_cancellations': len([r for r in rsvp_history if r.get('status') == 'cancelled']),
            'total_no_shows': len([r for r in rsvp_history if r.get('status') == 'no_show']),
            'total_attended': len([r for r in rsvp_history if r.get('status') == 'attended'])
        }
        
        # Calculate first and last event dates
        event_dates = [r.get('created_at') for r in rsvp_history if r.get('created_at')]
        if event_dates:
            event_dates.sort()
            metrics['first_event_date'] = event_dates[0]
            metrics['last_event_date'] = event_dates[-1]
        
        return metrics
    
    def _update_volunteer_metrics(self, email: str, metrics: Dict[str, Any]):
        """Update volunteer metrics with calculated values"""
        try:
            self.volunteers_table.update_item(
                Key={'email': email},
                UpdateExpression='SET volunteer_metrics = :metrics, updated_at = :updated_at',
                ExpressionAttributeValues={
                    ':metrics': metrics,
                    ':updated_at': datetime.now(timezone.utc).isoformat()
                }
            )
        except ClientError as e:
            self.update_log.append(f"Failed to update metrics for {email}: {str(e)}")
    
    # Safe getter methods with error handling
    def _get_event_safely(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Safely get event data"""
        try:
            response = self.events_table.get_item(Key={'event_id': event_id})
            return response.get('Item')
        except ClientError:
            return None
    
    def _get_volunteer_safely(self, email: str) -> Optional[Dict[str, Any]]:
        """Safely get volunteer data"""
        try:
            response = self.volunteers_table.get_item(Key={'email': email})
            return response.get('Item')
        except ClientError:
            return None
    
    def _get_rsvp_safely(self, event_id: str, email: str) -> Optional[Dict[str, Any]]:
        """Safely get RSVP data"""
        try:
            response = self.rsvps_table.get_item(Key={'event_id': event_id, 'email': email})
            return response.get('Item')
        except ClientError:
            return None
    
    def _get_event_rsvps(self, event_id: str) -> List[Dict[str, Any]]:
        """Get all RSVPs for an event"""
        try:
            response = self.rsvps_table.query(
                KeyConditionExpression='event_id = :event_id',
                ExpressionAttributeValues={':event_id': event_id}
            )
            return response.get('Items', [])
        except ClientError:
            return []
    
    def _get_volunteer_rsvps(self, email: str) -> List[Dict[str, Any]]:
        """Get all RSVPs for a volunteer"""
        try:
            response = self.rsvps_table.query(
                IndexName='email-created_at-index',
                KeyConditionExpression='email = :email',
                ExpressionAttributeValues={':email': email}
            )
            return response.get('Items', [])
        except ClientError:
            return []
    
    def _update_event_record(self, event_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update event record in DynamoDB"""
        # Build update expression with proper attribute name handling
        update_expression = "SET updated_at = :updated_at"
        expression_values = {':updated_at': datetime.now(timezone.utc).isoformat()}
        expression_names = {}
        
        # DynamoDB reserved keywords that need attribute name placeholders
        reserved_keywords = {'location', 'status', 'name', 'timestamp', 'date', 'year', 'month', 'day'}
        
        for field, value in updates.items():
            # Use expression attribute names for reserved keywords
            if field.lower() in reserved_keywords:
                attr_name = f"#{field}"
                expression_names[attr_name] = field
                update_expression += f", {attr_name} = :{field}"
            else:
                update_expression += f", {field} = :{field}"
            expression_values[f':{field}'] = value
        
        # Build update_item parameters
        update_params = {
            'Key': {'event_id': event_id},
            'UpdateExpression': update_expression,
            'ExpressionAttributeValues': expression_values,
            'ReturnValues': 'ALL_NEW'
        }
        
        # Only add ExpressionAttributeNames if we have any
        if expression_names:
            update_params['ExpressionAttributeNames'] = expression_names
        
        response = self.events_table.update_item(**update_params)
        
        return response['Attributes']
    
    def _update_volunteer_record(self, email: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update volunteer record in DynamoDB"""
        # Build update expression
        update_expression = "SET updated_at = :updated_at"
        expression_values = {':updated_at': datetime.now(timezone.utc).isoformat()}
        
        for field, value in updates.items():
            if field != 'validate_metrics':  # Skip internal flags
                update_expression += f", {field} = :{field}"
                expression_values[f':{field}'] = value
        
        response = self.volunteers_table.update_item(
            Key={'email': email},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values,
            ReturnValues='ALL_NEW'
        )
        
        return response['Attributes']
    
    def _update_rsvp_record(self, event_id: str, email: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update RSVP record in DynamoDB"""
        # Build update expression
        update_expression = "SET updated_at = :updated_at"
        expression_values = {':updated_at': datetime.now(timezone.utc).isoformat()}
        
        for field, value in updates.items():
            update_expression += f", {field} = :{field}"
            expression_values[f':{field}'] = value
        
        response = self.rsvps_table.update_item(
            Key={'event_id': event_id, 'email': email},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values,
            ReturnValues='ALL_NEW'
        )
        
        return response['Attributes']
    
    def _attempt_rollback(self, event_id: str, original_event: Optional[Dict[str, Any]]):
        """Attempt to rollback changes in case of error"""
        if original_event:
            try:
                # This is a simplified rollback - in production you'd want more sophisticated transaction handling
                self.update_log.append(f"Attempting rollback for event {event_id}")
                # Implementation would depend on what changes were made
            except Exception as rollback_error:
                self.update_log.append(f"Rollback failed: {str(rollback_error)}")

class DataRecoveryManager:
    """Handles data recovery and consistency repair operations"""
    
    def __init__(self, events_table, volunteers_table, rsvps_table):
        self.events_table = events_table
        self.volunteers_table = volunteers_table
        self.rsvps_table = rsvps_table
        self.recovery_log = []
    
    def repair_volunteer_metrics(self, email: str = None) -> Dict[str, Any]:
        """Repair volunteer metrics by recalculating from RSVP history"""
        self.recovery_log = []
        results = {'volunteers_processed': 0, 'volunteers_corrected': 0, 'errors': []}
        
        try:
            if email:
                # Repair specific volunteer
                volunteers = [{'email': email}]
            else:
                # Repair all volunteers
                volunteers = self._scan_all_volunteers()
            
            for volunteer in volunteers:
                try:
                    vol_email = volunteer['email']
                    rsvp_history = self._get_volunteer_rsvps(vol_email)
                    
                    # Calculate correct metrics
                    correct_metrics = self._calculate_correct_metrics(rsvp_history)
                    
                    # Get current metrics
                    current_volunteer = self._get_volunteer_safely(vol_email)
                    if not current_volunteer:
                        continue
                    
                    current_metrics = current_volunteer.get('volunteer_metrics', {})
                    
                    # Check if correction is needed
                    needs_correction = False
                    for metric, correct_value in correct_metrics.items():
                        current_value = current_metrics.get(metric, 0)
                        if current_value != correct_value:
                            needs_correction = True
                            break
                    
                    if needs_correction:
                        # Update metrics
                        self.volunteers_table.update_item(
                            Key={'email': vol_email},
                            UpdateExpression='SET volunteer_metrics = :metrics, updated_at = :updated_at',
                            ExpressionAttributeValues={
                                ':metrics': correct_metrics,
                                ':updated_at': datetime.now(timezone.utc).isoformat()
                            }
                        )
                        results['volunteers_corrected'] += 1
                        self.recovery_log.append(f"Corrected metrics for {vol_email}")
                    
                    results['volunteers_processed'] += 1
                    
                except Exception as e:
                    error_msg = f"Failed to repair metrics for {volunteer.get('email', 'unknown')}: {str(e)}"
                    results['errors'].append(error_msg)
                    self.recovery_log.append(error_msg)
            
            return {
                'success': True,
                'results': results,
                'recovery_log': self.recovery_log
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'recovery_log': self.recovery_log
            }
    
    def _scan_all_volunteers(self) -> List[Dict[str, Any]]:
        """Scan all volunteers from the table"""
        volunteers = []
        try:
            response = self.volunteers_table.scan(
                ProjectionExpression='email'
            )
            volunteers.extend(response.get('Items', []))
            
            # Handle pagination
            while 'LastEvaluatedKey' in response:
                response = self.volunteers_table.scan(
                    ProjectionExpression='email',
                    ExclusiveStartKey=response['LastEvaluatedKey']
                )
                volunteers.extend(response.get('Items', []))
        
        except ClientError as e:
            self.recovery_log.append(f"Error scanning volunteers: {str(e)}")
        
        return volunteers
    
    def _get_volunteer_safely(self, email: str) -> Optional[Dict[str, Any]]:
        """Safely get volunteer data"""
        try:
            response = self.volunteers_table.get_item(Key={'email': email})
            return response.get('Item')
        except ClientError:
            return None
    
    def _get_volunteer_rsvps(self, email: str) -> List[Dict[str, Any]]:
        """Get all RSVPs for a volunteer"""
        try:
            response = self.rsvps_table.query(
                IndexName='email-created_at-index',
                KeyConditionExpression='email = :email',
                ExpressionAttributeValues={':email': email}
            )
            return response.get('Items', [])
        except ClientError:
            return []
    
    def _calculate_correct_metrics(self, rsvp_history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate correct volunteer metrics from RSVP history"""
        metrics = {
            'total_rsvps': len(rsvp_history),
            'total_cancellations': len([r for r in rsvp_history if r.get('status') == 'cancelled']),
            'total_no_shows': len([r for r in rsvp_history if r.get('status') == 'no_show']),
            'total_attended': len([r for r in rsvp_history if r.get('status') == 'attended'])
        }
        
        # Calculate first and last event dates
        event_dates = [r.get('created_at') for r in rsvp_history if r.get('created_at')]
        if event_dates:
            event_dates.sort()
            metrics['first_event_date'] = event_dates[0]
            metrics['last_event_date'] = event_dates[-1]
        else:
            metrics['first_event_date'] = None
            metrics['last_event_date'] = None
        
        return metrics