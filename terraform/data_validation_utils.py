"""
Enhanced data validation utilities for the database-driven events system
Provides comprehensive validation for Events, Volunteers, and RSVPs tables
"""
import re
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Any, Optional, Tuple

class ValidationError(Exception):
    """Custom exception for validation errors"""
    def __init__(self, message: str, field: str = None, code: str = None):
        self.message = message
        self.field = field
        self.code = code
        super().__init__(message)

class DataConsistencyError(Exception):
    """Custom exception for data consistency errors"""
    def __init__(self, message: str, affected_records: List[str] = None):
        self.message = message
        self.affected_records = affected_records or []
        super().__init__(message)

class EventValidator:
    """Validator for Event data"""
    
    REQUIRED_FIELDS = ['title', 'description', 'start_time', 'end_time', 'location']
    VALID_STATUSES = ['active', 'cancelled', 'completed', 'archived']
    
    @staticmethod
    def validate_event_data(data: Dict[str, Any], is_update: bool = False) -> List[ValidationError]:
        """
        Comprehensive validation for event data
        
        Args:
            data: Event data to validate
            is_update: Whether this is an update operation (allows partial data)
            
        Returns:
            List of validation errors
        """
        errors = []
        
        # Required fields validation (only for creation)
        if not is_update:
            for field in EventValidator.REQUIRED_FIELDS:
                if field not in data or not data[field]:
                    errors.append(ValidationError(f"{field} is required", field, "REQUIRED_FIELD"))
        
        # Title validation
        if 'title' in data:
            title = data['title']
            if not isinstance(title, str):
                errors.append(ValidationError("Title must be a string", "title", "INVALID_TYPE"))
            elif len(title.strip()) < 3:
                errors.append(ValidationError("Title must be at least 3 characters", "title", "MIN_LENGTH"))
            elif len(title) > 200:
                errors.append(ValidationError("Title must be less than 200 characters", "title", "MAX_LENGTH"))
        
        # Description validation
        if 'description' in data:
            description = data['description']
            if not isinstance(description, str):
                errors.append(ValidationError("Description must be a string", "description", "INVALID_TYPE"))
            elif len(description.strip()) < 10:
                errors.append(ValidationError("Description must be at least 10 characters", "description", "MIN_LENGTH"))
            elif len(description) > 2000:
                errors.append(ValidationError("Description must be less than 2000 characters", "description", "MAX_LENGTH"))
        
        # DateTime validation
        for time_field in ['start_time', 'end_time']:
            if time_field in data:
                try:
                    parsed_time = EventValidator._validate_iso_datetime(data[time_field])
                    if time_field == 'start_time':
                        # Start time should not be in the past (with 1 hour buffer)
                        now = datetime.now(timezone.utc)
                        if parsed_time < now.replace(hour=now.hour-1):
                            errors.append(ValidationError("Start time cannot be in the past", time_field, "PAST_DATE"))
                except ValidationError as e:
                    errors.append(e)
        
        # Start/End time relationship validation
        if 'start_time' in data and 'end_time' in data:
            try:
                start = EventValidator._validate_iso_datetime(data['start_time'])
                end = EventValidator._validate_iso_datetime(data['end_time'])
                if end <= start:
                    errors.append(ValidationError("End time must be after start time", "end_time", "INVALID_RANGE"))
                
                # Event duration validation (max 12 hours)
                duration = end - start
                if duration.total_seconds() > 12 * 3600:
                    errors.append(ValidationError("Event duration cannot exceed 12 hours", "end_time", "MAX_DURATION"))
            except ValidationError:
                pass  # Individual datetime errors already captured above
        
        # Location validation
        if 'location' in data:
            location_errors = EventValidator._validate_location(data['location'])
            errors.extend(location_errors)
        
        # Attendance cap validation
        if 'attendance_cap' in data:
            cap = data['attendance_cap']
            if not isinstance(cap, (int, Decimal)):
                errors.append(ValidationError("Attendance cap must be a number", "attendance_cap", "INVALID_TYPE"))
            elif int(cap) < 1:
                errors.append(ValidationError("Attendance cap must be at least 1", "attendance_cap", "MIN_VALUE"))
            elif int(cap) > 1000:
                errors.append(ValidationError("Attendance cap cannot exceed 1000", "attendance_cap", "MAX_VALUE"))
        
        # Status validation
        if 'status' in data:
            status = data['status']
            if status not in EventValidator.VALID_STATUSES:
                errors.append(ValidationError(
                    f"Status must be one of: {', '.join(EventValidator.VALID_STATUSES)}", 
                    "status", "INVALID_VALUE"
                ))
        
        # Hugo config validation
        if 'hugo_config' in data:
            hugo_errors = EventValidator._validate_hugo_config(data['hugo_config'])
            errors.extend(hugo_errors)
        
        return errors
    
    @staticmethod
    def _validate_iso_datetime(datetime_str: str) -> datetime:
        """Validate ISO 8601 datetime format"""
        if not isinstance(datetime_str, str):
            raise ValidationError("Datetime must be a string", code="INVALID_TYPE")
        
        try:
            # Handle both Z and +00:00 timezone formats
            normalized = datetime_str.replace('Z', '+00:00')
            return datetime.fromisoformat(normalized)
        except ValueError as e:
            raise ValidationError(f"Invalid datetime format: {str(e)}", code="INVALID_FORMAT")
    
    @staticmethod
    def _validate_location(location: Any) -> List[ValidationError]:
        """Validate location structure"""
        errors = []
        
        if not isinstance(location, dict):
            errors.append(ValidationError("Location must be an object", "location", "INVALID_TYPE"))
            return errors
        
        # Required location fields
        if 'name' not in location or not location['name']:
            errors.append(ValidationError("Location name is required", "location.name", "REQUIRED_FIELD"))
        elif len(location['name'].strip()) < 3:
            errors.append(ValidationError("Location name must be at least 3 characters", "location.name", "MIN_LENGTH"))
        
        if 'address' not in location or not location['address']:
            errors.append(ValidationError("Location address is required", "location.address", "REQUIRED_FIELD"))
        elif len(location['address'].strip()) < 10:
            errors.append(ValidationError("Location address must be at least 10 characters", "location.address", "MIN_LENGTH"))
        
        # Optional coordinates validation
        if 'coordinates' in location:
            coords = location['coordinates']
            if coords is not None:
                if not isinstance(coords, dict):
                    errors.append(ValidationError("Coordinates must be an object", "location.coordinates", "INVALID_TYPE"))
                else:
                    if 'lat' not in coords or 'lng' not in coords:
                        errors.append(ValidationError("Coordinates must have lat and lng", "location.coordinates", "MISSING_FIELDS"))
                    else:
                        try:
                            lat = float(coords['lat'])
                            lng = float(coords['lng'])
                            if not (-90 <= lat <= 90):
                                errors.append(ValidationError("Latitude must be between -90 and 90", "location.coordinates.lat", "INVALID_RANGE"))
                            if not (-180 <= lng <= 180):
                                errors.append(ValidationError("Longitude must be between -180 and 180", "location.coordinates.lng", "INVALID_RANGE"))
                        except (ValueError, TypeError):
                            errors.append(ValidationError("Coordinates must be numeric", "location.coordinates", "INVALID_TYPE"))
        
        return errors
    
    @staticmethod
    def _validate_hugo_config(hugo_config: Any) -> List[ValidationError]:
        """Validate Hugo configuration structure"""
        errors = []
        
        if not isinstance(hugo_config, dict):
            errors.append(ValidationError("Hugo config must be an object", "hugo_config", "INVALID_TYPE"))
            return errors
        
        # Tags validation
        if 'tags' in hugo_config:
            tags = hugo_config['tags']
            if not isinstance(tags, list):
                errors.append(ValidationError("Tags must be an array", "hugo_config.tags", "INVALID_TYPE"))
            else:
                for i, tag in enumerate(tags):
                    if not isinstance(tag, str):
                        errors.append(ValidationError(f"Tag {i} must be a string", f"hugo_config.tags[{i}]", "INVALID_TYPE"))
                    elif len(tag.strip()) == 0:
                        errors.append(ValidationError(f"Tag {i} cannot be empty", f"hugo_config.tags[{i}]", "EMPTY_VALUE"))
        
        # Preheader validation
        if 'preheader_is_light' in hugo_config:
            if not isinstance(hugo_config['preheader_is_light'], bool):
                errors.append(ValidationError("preheader_is_light must be a boolean", "hugo_config.preheader_is_light", "INVALID_TYPE"))
        
        return errors

class VolunteerValidator:
    """Validator for Volunteer data"""
    
    REQUIRED_FIELDS = ['first_name', 'last_name', 'email']
    
    @staticmethod
    def validate_volunteer_data(data: Dict[str, Any], is_update: bool = False) -> List[ValidationError]:
        """
        Comprehensive validation for volunteer data
        
        Args:
            data: Volunteer data to validate
            is_update: Whether this is an update operation
            
        Returns:
            List of validation errors
        """
        errors = []
        
        # Required fields validation (only for creation)
        if not is_update:
            for field in VolunteerValidator.REQUIRED_FIELDS:
                if field not in data or not data[field]:
                    errors.append(ValidationError(f"{field} is required", field, "REQUIRED_FIELD"))
        
        # Name validation
        for name_field in ['first_name', 'last_name']:
            if name_field in data:
                name = data[name_field]
                if not isinstance(name, str):
                    errors.append(ValidationError(f"{name_field} must be a string", name_field, "INVALID_TYPE"))
                elif len(name.strip()) < 1:
                    errors.append(ValidationError(f"{name_field} cannot be empty", name_field, "EMPTY_VALUE"))
                elif len(name) > 50:
                    errors.append(ValidationError(f"{name_field} must be less than 50 characters", name_field, "MAX_LENGTH"))
                elif not re.match(r'^[a-zA-Z\s\-\'\.]+$', name):
                    errors.append(ValidationError(f"{name_field} contains invalid characters", name_field, "INVALID_FORMAT"))
        
        # Email validation
        if 'email' in data:
            email_errors = VolunteerValidator._validate_email(data['email'])
            errors.extend(email_errors)
        
        # Phone validation
        if 'phone' in data and data['phone']:
            phone_errors = VolunteerValidator._validate_phone(data['phone'])
            errors.extend(phone_errors)
        
        # Communication preferences validation
        if 'communication_preferences' in data:
            comm_errors = VolunteerValidator._validate_communication_preferences(data['communication_preferences'])
            errors.extend(comm_errors)
        
        # Optional text fields validation
        text_fields = ['emergency_contact', 'dietary_restrictions', 'volunteer_experience', 'how_did_you_hear']
        for field in text_fields:
            if field in data and data[field]:
                if not isinstance(data[field], str):
                    errors.append(ValidationError(f"{field} must be a string", field, "INVALID_TYPE"))
                elif len(data[field]) > 500:
                    errors.append(ValidationError(f"{field} must be less than 500 characters", field, "MAX_LENGTH"))
        
        return errors
    
    @staticmethod
    def _validate_email(email: str) -> List[ValidationError]:
        """Validate email format"""
        errors = []
        
        if not isinstance(email, str):
            errors.append(ValidationError("Email must be a string", "email", "INVALID_TYPE"))
            return errors
        
        email = email.strip().lower()
        
        if len(email) == 0:
            errors.append(ValidationError("Email cannot be empty", "email", "EMPTY_VALUE"))
            return errors
        
        # Basic email regex
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            errors.append(ValidationError("Invalid email format", "email", "INVALID_FORMAT"))
        
        if len(email) > 254:  # RFC 5321 limit
            errors.append(ValidationError("Email address too long", "email", "MAX_LENGTH"))
        
        return errors
    
    @staticmethod
    def _validate_phone(phone: str) -> List[ValidationError]:
        """Validate phone number"""
        errors = []
        
        if not isinstance(phone, str):
            errors.append(ValidationError("Phone must be a string", "phone", "INVALID_TYPE"))
            return errors
        
        # Remove common formatting characters
        clean_phone = re.sub(r'[^\d]', '', phone)
        
        if len(clean_phone) < 10:
            errors.append(ValidationError("Phone number must have at least 10 digits", "phone", "MIN_LENGTH"))
        elif len(clean_phone) > 15:
            errors.append(ValidationError("Phone number must have at most 15 digits", "phone", "MAX_LENGTH"))
        
        return errors
    
    @staticmethod
    def _validate_communication_preferences(prefs: Any) -> List[ValidationError]:
        """Validate communication preferences structure"""
        errors = []
        
        if not isinstance(prefs, dict):
            errors.append(ValidationError("Communication preferences must be an object", "communication_preferences", "INVALID_TYPE"))
            return errors
        
        for pref_key in ['email_notifications', 'sms_notifications']:
            if pref_key in prefs:
                if not isinstance(prefs[pref_key], bool):
                    errors.append(ValidationError(f"{pref_key} must be a boolean", f"communication_preferences.{pref_key}", "INVALID_TYPE"))
        
        return errors

class RSVPValidator:
    """Validator for RSVP data"""
    
    VALID_STATUSES = ['active', 'cancelled', 'no_show', 'attended']
    
    @staticmethod
    def validate_rsvp_data(data: Dict[str, Any], is_update: bool = False) -> List[ValidationError]:
        """
        Comprehensive validation for RSVP data
        
        Args:
            data: RSVP data to validate
            is_update: Whether this is an update operation
            
        Returns:
            List of validation errors
        """
        errors = []
        
        # Required fields for creation
        if not is_update:
            if 'event_id' not in data or not data['event_id']:
                errors.append(ValidationError("event_id is required", "event_id", "REQUIRED_FIELD"))
            if 'email' not in data or not data['email']:
                errors.append(ValidationError("email is required", "email", "REQUIRED_FIELD"))
        
        # Event ID validation
        if 'event_id' in data:
            event_id = data['event_id']
            if not isinstance(event_id, str):
                errors.append(ValidationError("event_id must be a string", "event_id", "INVALID_TYPE"))
            elif len(event_id.strip()) == 0:
                errors.append(ValidationError("event_id cannot be empty", "event_id", "EMPTY_VALUE"))
        
        # Email validation
        if 'email' in data:
            email_errors = VolunteerValidator._validate_email(data['email'])
            # Adjust field names for RSVP context
            for error in email_errors:
                error.field = "email"
            errors.extend(email_errors)
        
        # Status validation
        if 'status' in data:
            status = data['status']
            if status not in RSVPValidator.VALID_STATUSES:
                errors.append(ValidationError(
                    f"Status must be one of: {', '.join(RSVPValidator.VALID_STATUSES)}", 
                    "status", "INVALID_VALUE"
                ))
        
        # Additional comments validation
        if 'additional_comments' in data and data['additional_comments']:
            comments = data['additional_comments']
            if not isinstance(comments, str):
                errors.append(ValidationError("additional_comments must be a string", "additional_comments", "INVALID_TYPE"))
            elif len(comments) > 1000:
                errors.append(ValidationError("additional_comments must be less than 1000 characters", "additional_comments", "MAX_LENGTH"))
        
        # Hours before event validation (for cancellations)
        if 'hours_before_event' in data and data['hours_before_event'] is not None:
            hours = data['hours_before_event']
            if not isinstance(hours, (int, float, Decimal)):
                errors.append(ValidationError("hours_before_event must be a number", "hours_before_event", "INVALID_TYPE"))
            elif float(hours) < 0:
                errors.append(ValidationError("hours_before_event cannot be negative", "hours_before_event", "INVALID_VALUE"))
        
        return errors

class DataConsistencyChecker:
    """Utility for checking data consistency across tables"""
    
    @staticmethod
    def check_event_rsvp_consistency(event_data: Dict[str, Any], rsvp_list: List[Dict[str, Any]]) -> List[DataConsistencyError]:
        """Check consistency between event and its RSVPs"""
        errors = []
        
        # Check attendance cap vs active RSVPs
        if 'attendance_cap' in event_data:
            active_rsvps = [r for r in rsvp_list if r.get('status') == 'active']
            if len(active_rsvps) > int(event_data['attendance_cap']):
                errors.append(DataConsistencyError(
                    f"Event has {len(active_rsvps)} active RSVPs but attendance cap is {event_data['attendance_cap']}",
                    [r['email'] for r in active_rsvps]
                ))
        
        # Check for duplicate RSVPs
        emails = [r['email'] for r in rsvp_list]
        duplicates = [email for email in set(emails) if emails.count(email) > 1]
        if duplicates:
            errors.append(DataConsistencyError(
                f"Duplicate RSVPs found for emails: {', '.join(duplicates)}",
                duplicates
            ))
        
        return errors
    
    @staticmethod
    def check_volunteer_metrics_consistency(volunteer_data: Dict[str, Any], rsvp_history: List[Dict[str, Any]]) -> List[DataConsistencyError]:
        """Check consistency between volunteer metrics and RSVP history"""
        errors = []
        
        metrics = volunteer_data.get('volunteer_metrics', {})
        
        # Count actual RSVPs by status
        actual_counts = {
            'total_rsvps': len(rsvp_history),
            'total_cancellations': len([r for r in rsvp_history if r.get('status') == 'cancelled']),
            'total_no_shows': len([r for r in rsvp_history if r.get('status') == 'no_show']),
            'total_attended': len([r for r in rsvp_history if r.get('status') == 'attended'])
        }
        
        # Compare with stored metrics
        for metric, actual_count in actual_counts.items():
            stored_count = int(metrics.get(metric, 0))
            if stored_count != actual_count:
                errors.append(DataConsistencyError(
                    f"Volunteer {volunteer_data['email']}: {metric} shows {stored_count} but actual count is {actual_count}",
                    [volunteer_data['email']]
                ))
        
        return errors

def format_validation_errors(errors: List[ValidationError]) -> Dict[str, Any]:
    """Format validation errors for API response"""
    return {
        'error': 'Validation failed',
        'validation_errors': [
            {
                'field': error.field,
                'message': error.message,
                'code': error.code
            }
            for error in errors
        ],
        'error_count': len(errors)
    }

def format_consistency_errors(errors: List[DataConsistencyError]) -> Dict[str, Any]:
    """Format consistency errors for API response"""
    return {
        'error': 'Data consistency check failed',
        'consistency_errors': [
            {
                'message': error.message,
                'affected_records': error.affected_records
            }
            for error in errors
        ],
        'error_count': len(errors)
    }