# Centralized AI model configuration
# Single source of truth for Bedrock model IDs used by Lambda functions and
# the sesv2-admin frontend. Update config/ai-models.json to change a model
# everywhere it's referenced instead of editing Terraform/Lambda/frontend code.

locals {
  ai_models_config = jsondecode(file("${path.module}/../config/ai-models.json"))

  rsvp_reminder_model_id = local.ai_models_config.bedrock_models.rsvp_reminder_generation.model_id
}
