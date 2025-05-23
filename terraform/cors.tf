# Enable CORS for the API Gateway Stage
resource "aws_api_gateway_method_settings" "cors_settings" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_api.id
  stage_name  = aws_api_gateway_stage.prod.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled    = false
    logging_level      = "OFF"
    caching_enabled    = false
    throttling_burst_limit = 5000
    throttling_rate_limit  = 10000
  }

  depends_on = [aws_api_gateway_deployment.volunteer_api_deployment]
}

# Add Default 5XX Gateway Response for CORS
resource "aws_api_gateway_gateway_response" "cors_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_api.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}
