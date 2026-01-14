# Database Events Module
# Creates DynamoDB tables for the database-driven events system

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Load table schemas from JSON files
locals {
  events_schema     = jsondecode(file("${path.module}/../../../schemas/events-table.json"))
  volunteers_schema = jsondecode(file("${path.module}/../../../schemas/volunteers-table.json"))
  rsvps_schema      = jsondecode(file("${path.module}/../../../schemas/rsvps-table.json"))
}

# ===== EVENTS TABLE =====

resource "aws_dynamodb_table" "events" {
  name         = "${local.events_schema.table_name}${var.resource_suffix}"
  billing_mode = local.events_schema.billing_mode
  hash_key     = local.events_schema.hash_key

  # Create attributes dynamically from schema
  dynamic "attribute" {
    for_each = local.events_schema.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  # Global Secondary Index for querying events by status and start time
  global_secondary_index {
    name            = "status-start_time-index"
    hash_key        = "status"
    range_key       = "start_time"
    projection_type = "ALL"
  }

  # Global Secondary Index for querying all events by start time
  global_secondary_index {
    name            = "start_time-index"
    hash_key        = "start_time"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  tags = merge(var.common_tags, {
    Name   = "events${var.resource_suffix}"
    Schema = "events-table.json"
  })
}

# ===== VOLUNTEERS TABLE =====

resource "aws_dynamodb_table" "volunteers" {
  name         = "${local.volunteers_schema.table_name}${var.resource_suffix}"
  billing_mode = local.volunteers_schema.billing_mode
  hash_key     = local.volunteers_schema.hash_key

  # Create attributes dynamically from schema
  dynamic "attribute" {
    for_each = local.volunteers_schema.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  tags = merge(var.common_tags, {
    Name   = "volunteers${var.resource_suffix}"
    Schema = "volunteers-table.json"
  })
}

# ===== RSVPS TABLE (NORMALIZED) =====

resource "aws_dynamodb_table" "rsvps" {
  name         = "${local.rsvps_schema.table_name}${var.resource_suffix}"
  billing_mode = local.rsvps_schema.billing_mode
  hash_key     = local.rsvps_schema.hash_key
  range_key    = local.rsvps_schema.range_key

  # Create attributes dynamically from schema
  dynamic "attribute" {
    for_each = local.rsvps_schema.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  # Global Secondary Index for querying RSVPs by volunteer email
  global_secondary_index {
    name            = "email-created_at-index"
    hash_key        = "email"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  # Global Secondary Index for querying RSVPs by status
  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  tags = merge(var.common_tags, {
    Name   = "rsvps${var.resource_suffix}"
    Schema = "rsvps-table.json"
  })
}

# ===== SSM PARAMETERS FOR TABLE NAMES =====

resource "aws_ssm_parameter" "events_table_name" {
  name        = "/waterwaycleanups${var.resource_suffix}/events_table_name"
  description = "Name of the Events DynamoDB table"
  type        = "String"
  value       = aws_dynamodb_table.events.name

  tags = var.common_tags
}

resource "aws_ssm_parameter" "volunteers_table_name" {
  name        = "/waterwaycleanups${var.resource_suffix}/volunteers_table_name"
  description = "Name of the Volunteers DynamoDB table"
  type        = "String"
  value       = aws_dynamodb_table.volunteers.name

  tags = var.common_tags
}

resource "aws_ssm_parameter" "rsvps_table_name" {
  name        = "/waterwaycleanups${var.resource_suffix}/rsvps_table_name"
  description = "Name of the RSVPs DynamoDB table"
  type        = "String"
  value       = aws_dynamodb_table.rsvps.name

  tags = var.common_tags
}