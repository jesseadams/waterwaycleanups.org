# Variables for Database Events Module

variable "resource_suffix" {
  description = "Suffix to append to resource names (e.g., -staging, -prod)"
  type        = string
  default     = ""
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for DynamoDB tables"
  type        = bool
  default     = true
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "waterwaycleanups"
    ManagedBy   = "terraform"
    Component   = "database-events"
  }
}