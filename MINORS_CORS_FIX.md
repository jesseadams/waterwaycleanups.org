# Fixing CORS Errors for Minors Management System

## Problem

You're seeing CORS errors like:
```
Access to fetch at 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging/auth-send-code' 
from origin 'http://localhost:1313' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root Cause

The API Gateway needs OPTIONS methods configured for each endpoint to handle CORS preflight requests. The Lambda functions have the correct CORS headers, but API Gateway must be configured to:
1. Accept OPTIONS requests
2. Return proper CORS headers for preflight requests
3. Pass through CORS headers from Lambda responses

## Solution

### Step 1: Deploy the Terraform Configuration

The `terraform/minors_management.tf` file includes all necessary CORS configuration. Deploy it:

```bash
cd terraform

# Initialize Terraform (if not already done)
terraform init

# Review the changes
terraform plan

# Apply the changes
terraform apply
```

This will create:
- DynamoDB table for minors
- 4 Lambda functions (add, list, update, delete)
- API Gateway resources with OPTIONS methods
- Proper CORS configuration for all endpoints

### Step 2: Verify API Gateway Deployment

After applying Terraform, a new deployment is needed:

```bash
# The terraform apply should trigger a new deployment automatically
# But if CORS issues persist, manually create a new deployment:

aws apigateway create-deployment \
  --rest-api-id YOUR_API_ID \
  --stage-name staging \
  --description "Deploy minors management with CORS"
```

To find your API ID:
```bash
aws apigateway get-rest-apis --query 'items[?name==`volunteer_waiver_api`].id' --output text
```

### Step 3: Test CORS

Test that OPTIONS requests work:

```bash
# Test minors-add endpoint
curl -X OPTIONS \
  https://YOUR_API_URL/staging/minors-add \
  -H "Origin: http://localhost:1313" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

You should see these headers in the response:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: OPTIONS,POST
Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
```

### Step 4: Update Frontend API Base URL

If testing locally, make sure your frontend is pointing to the correct API:

```javascript
// In your test file or React component
const API_BASE = 'https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/staging';
```

## Alternative: Quick Fix for Existing Endpoints

If you're seeing CORS errors on existing endpoints (like `auth-send-code`), you can manually add OPTIONS methods via AWS Console:

1. Go to API Gateway console
2. Select your API (`volunteer_waiver_api`)
3. Navigate to the resource (e.g., `/auth-send-code`)
4. Click "Actions" → "Enable CORS"
5. Click "Enable CORS and replace existing CORS headers"
6. Deploy the API to your stage

## Troubleshooting

### Issue: Still seeing CORS errors after deployment

**Solution 1: Clear browser cache**
```bash
# Hard refresh in browser
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

**Solution 2: Check API Gateway stage**
```bash
# Verify the stage has the latest deployment
aws apigateway get-stage \
  --rest-api-id YOUR_API_ID \
  --stage-name staging
```

**Solution 3: Check Lambda function CORS headers**
```bash
# Test Lambda directly
aws lambda invoke \
  --function-name minors_add \
  --payload '{"httpMethod":"OPTIONS"}' \
  response.json

cat response.json
```

### Issue: OPTIONS returns 403 Forbidden

This means the OPTIONS method isn't configured. Run:
```bash
cd terraform
terraform apply
```

### Issue: POST works but OPTIONS fails

The OPTIONS method integration might not be set up correctly. Check:
```bash
aws apigateway get-integration \
  --rest-api-id YOUR_API_ID \
  --resource-id YOUR_RESOURCE_ID \
  --http-method OPTIONS
```

## Testing Checklist

- [ ] OPTIONS request returns 200
- [ ] OPTIONS response includes `Access-Control-Allow-Origin: *`
- [ ] OPTIONS response includes `Access-Control-Allow-Methods`
- [ ] OPTIONS response includes `Access-Control-Allow-Headers`
- [ ] POST request returns proper CORS headers
- [ ] Browser console shows no CORS errors
- [ ] Can successfully add a minor from frontend

## Production Considerations

### Restrict CORS Origins

For production, change from `*` to specific origins:

```terraform
response_parameters = {
  "method.response.header.Access-Control-Allow-Origin"  = "'https://waterwaycleanups.org'"
  # ... other headers
}
```

### Add to Gateway Responses

Ensure error responses also include CORS headers (already in `terraform/cors.tf`):

```terraform
resource "aws_api_gateway_gateway_response" "cors_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
  }
}
```

## Summary

The CORS errors occur because API Gateway needs explicit OPTIONS method configuration for each endpoint. The Terraform configuration in `terraform/minors_management.tf` includes all necessary CORS setup. Simply run `terraform apply` to deploy the complete solution with proper CORS support.
