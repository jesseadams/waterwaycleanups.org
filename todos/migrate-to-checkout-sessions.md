# Migrate from redirectToCheckout() to Checkout Sessions

## Overview
Stripe has deprecated the `stripe.redirectToCheckout()` method used in the current implementation. This document outlines the migration path to Stripe's modern Checkout Sessions API, which requires a minimal backend component while maintaining identical user experience.

## Problem Statement

### Current Implementation
The app currently uses `stripe.redirectToCheckout()` in `merch-page/services/stripe.ts:46`, which:
- ❌ Is deprecated by Stripe (unable to be enabled in their dashboard as of 10/2025)
- ✅ Works entirely client-side (no backend needed)

### Why Payment Links Won't Work
Stripe recommends Payment Links as a "client-only" alternative, but Payment Links are **not suitable** for this use case because:
- Payment Links are static URLs for specific products
- They don't support dynamic shopping carts with multiple items
- Users would need separate checkouts for each item (severe UX degradation)
- No way to handle product variants dynamically

### Recommended Solution: Checkout Sessions
Migrate to Checkout Sessions API, which:
- ✅ Maintains identical user experience (cart + multi-item checkout)
- ✅ Stripe's recommended modern integration method
- ✅ Server-side price validation (more secure)
- ✅ Better analytics, customization, and webhook support
- ⚠️ Requires minimal backend (one API endpoint)

## Current Flow vs. New Flow

### Current Flow
```
User adds items to cart
  ↓
User clicks "Proceed to Checkout"
  ↓
Frontend calls stripe.redirectToCheckout() with line items
  ↓
Redirect to Stripe-hosted checkout page
  ↓
User completes payment
  ↓
Redirect back to success URL
```

### New Flow
```
User adds items to cart
  ↓
User clicks "Proceed to Checkout"
  ↓
Frontend sends cart data to backend API
  ↓
Backend creates Checkout Session via Stripe API
  ↓
Backend returns session URL to frontend
  ↓
Frontend redirects to session URL
  ↓
User completes payment on Stripe-hosted page (SAME UX)
  ↓
Redirect back to success URL
```

**Key Point:** User experience is identical - they still see the same Stripe-hosted checkout page. The only difference is HOW the session is created.

## Implementation Plan

### 1. Backend API Endpoint

**Files to Create:**
- **Lambda Function:** `terraform/lambda_create_checkout_session.py`
- **Terraform Configuration:** Add to existing `terraform/main.tf` or create `terraform/stripe_checkout.tf`

#### Endpoint Specification
```
POST /api/create-checkout-session
```

**Request Body:**
```typescript
interface CreateCheckoutRequest {
  lineItems: Array<{
    price: string;      // Stripe Price ID (e.g., "price_1ABC...")
    quantity: number;
  }>;
}
```

**Response:**
```typescript
interface CreateCheckoutResponse {
  sessionId: string;    // Stripe Checkout Session ID
  url: string;          // URL to redirect user to
}
```

**Error Response:**
```typescript
interface ErrorResponse {
  error: string;
}
```

#### Python Lambda Implementation (with AWS Lambda Powertools)

**File:** `terraform/lambda_create_checkout_session.py`

This implementation uses [AWS Lambda Powertools for Python](https://docs.aws.amazon.com/powertools/python/latest/) for production-ready patterns including structured logging, API Gateway event handling, and secure secret management.

```python
import os
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.utilities.parameters import get_secret
from aws_lambda_powertools.logging import correlation_paths
import stripe

# Initialize Powertools
logger = Logger()
tracer = Tracer()
app = APIGatewayRestResolver(cors=True)  # Handles CORS automatically

# Stripe initialization state
_stripe_initialized = False

def init_stripe():
    """Initialize Stripe with secret from AWS Secrets Manager"""
    global _stripe_initialized
    if not _stripe_initialized:
        # Retrieves and caches secret from Secrets Manager
        stripe_secret = get_secret("stripe_secret_key")
        stripe.api_key = stripe_secret
        stripe.api_version = '2024-11-20.acacia'  # Pin API version
        _stripe_initialized = True
        logger.info("Stripe initialized successfully")

@app.post("/create-checkout-session")
@tracer.capture_method
def create_checkout_session():
    """Create a Stripe Checkout Session"""
    init_stripe()

    # Access request data - Powertools handles parsing
    body = app.current_event.json_body
    line_items = body.get('lineItems', [])

    # Validate input
    if not line_items or not isinstance(line_items, list) or len(line_items) == 0:
        logger.warning("Invalid line items received", extra={"line_items": line_items})
        return {
            'error': 'Invalid line items',
            'success': False
        }, 400

    # Validate each line item
    for item in line_items:
        price_id = item.get('price', '')
        quantity = item.get('quantity', 0)

        if not price_id or not price_id.startswith('price_'):
            logger.error("Invalid price ID", extra={"price_id": price_id})
            return {
                'error': 'Invalid price ID',
                'success': False
            }, 400

        if not isinstance(quantity, int) or quantity < 1 or quantity > 100:
            logger.error("Invalid quantity", extra={"quantity": quantity})
            return {
                'error': 'Invalid quantity',
                'success': False
            }, 400

    try:
        # Create Checkout Session with X-Ray tracing
        site_url = os.environ.get('SITE_URL', 'https://waterwaycleanups.org')

        session = stripe.checkout.Session.create(
            mode='payment',
            line_items=line_items,
            success_url=f'{site_url}/merchandise/?session_id={{CHECKOUT_SESSION_ID}}',
            cancel_url=f'{site_url}/merchandise/',
            metadata={
                'source': 'merchandise_page'
            }
            # Optional: Enable Stripe Tax
            # automatic_tax={'enabled': True},
        )

        logger.info(
            "Checkout session created successfully",
            extra={
                "session_id": session.id,
                "amount_total": session.amount_total,
                "currency": session.currency,
                "num_items": len(line_items)
            }
        )

        return {
            'sessionId': session.id,
            'url': session.url,
            'success': True
        }

    except stripe.error.StripeError as e:
        logger.exception("Stripe API error occurred", extra={"error_type": type(e).__name__})
        return {
            'error': 'Failed to create checkout session',
            'success': False
        }, 500
    except Exception as e:
        logger.exception("Unexpected error occurred")
        return {
            'error': 'Internal server error',
            'success': False
        }, 500

@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
def handler(event, context):
    """
    Lambda handler with Powertools decorators for logging and tracing
    """
    return app.resolve(event, context)
```

**Benefits of AWS Lambda Powertools:**
- ✅ **Automatic CORS handling** - No manual header management
- ✅ **Structured logging** - JSON logs with context for CloudWatch
- ✅ **AWS X-Ray tracing** - Track Stripe API calls end-to-end
- ✅ **Secrets Manager integration** - More secure than environment variables
- ✅ **Request parsing** - Cleaner code with `app.current_event.json_body`
- ✅ **Production-ready patterns** - Battle-tested by AWS

#### Terraform Configuration

**File:** Create `terraform/stripe_checkout.tf` or add to existing `terraform/main.tf`

```hcl
# Stripe Checkout - Create dedicated IAM role for Lambda
# Following the pattern used in volunteer_waiver.tf and event_rsvp.tf

# IAM Role for Stripe Checkout Lambda
resource "aws_iam_role" "stripe_checkout_lambda_role" {
  name = "stripe_checkout_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Principal = {
          Service = "lambda.amazonaws.com"
        },
        Effect = "Allow",
        Sid    = ""
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
    Service     = "stripe-checkout"
  }
}

# Create IAM policy for Stripe Checkout Lambda
resource "aws_iam_policy" "stripe_checkout_lambda_policy" {
  name        = "stripe_checkout_lambda_policy"
  description = "IAM policy for Stripe Checkout Lambda with Secrets Manager and X-Ray"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "arn:aws:logs:*:*:*",
        Effect   = "Allow"
      },
      {
        Action = [
          "secretsmanager:GetSecretValue"
        ],
        Resource = aws_secretsmanager_secret.stripe_secret_key.arn,
        Effect   = "Allow"
      },
      {
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ],
        Resource = "*",
        Effect   = "Allow"
      }
    ]
  })
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "stripe_checkout_lambda_attachment" {
  role       = aws_iam_role.stripe_checkout_lambda_role.name
  policy_arn = aws_iam_policy.stripe_checkout_lambda_policy.arn
}

# Store Stripe secret in AWS Secrets Manager (more secure than env vars)
resource "aws_secretsmanager_secret" "stripe_secret_key" {
  name        = "stripe_secret_key"
  description = "Stripe API secret key for checkout sessions"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
    Service     = "stripe-checkout"
  }
}

resource "aws_secretsmanager_secret_version" "stripe_secret_key" {
  secret_id     = aws_secretsmanager_secret.stripe_secret_key.id
  secret_string = var.stripe_secret_key
}

# Create Lambda layer with Stripe and AWS Lambda Powertools
resource "aws_lambda_layer_version" "stripe_and_powertools" {
  filename            = "${path.module}/lambda_layers/stripe_powertools_layer.zip"
  layer_name          = "stripe_and_powertools"
  compatible_runtimes = ["python3.9", "python3.10", "python3.11"]

  source_code_hash = filebase64sha256("${path.module}/lambda_layers/stripe_powertools_layer.zip")

  description = "Stripe and AWS Lambda Powertools for checkout"
}

# Package Lambda function
data "archive_file" "stripe_checkout_lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_create_checkout_session.py"
  output_path = "${path.module}/lambda_create_checkout_session.zip"
}

# Create Lambda function
resource "aws_lambda_function" "stripe_checkout" {
  function_name    = "stripe_create_checkout_session"
  filename         = data.archive_file.stripe_checkout_lambda_zip.output_path
  source_code_hash = data.archive_file.stripe_checkout_lambda_zip.output_base64sha256
  handler          = "lambda_create_checkout_session.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.stripe_checkout_lambda_role.arn
  timeout          = 30
  memory_size      = 256

  layers = [aws_lambda_layer_version.stripe_and_powertools.arn]

  # Enable X-Ray tracing for observability
  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      # Stripe secret is retrieved from Secrets Manager, not env var
      SITE_URL                = var.site_url
      # Powertools configuration
      POWERTOOLS_SERVICE_NAME = "stripe-checkout"
      POWERTOOLS_METRICS_NAMESPACE = "waterwaycleanups"
      LOG_LEVEL               = "INFO"
    }
  }

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
    Service     = "stripe-checkout"
  }
}

# Create API Gateway resource
resource "aws_api_gateway_resource" "create_checkout_session" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id  # Use your existing API Gateway
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "create-checkout-session"
}

# POST method for create-checkout-session
resource "aws_api_gateway_method" "create_checkout_session_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.create_checkout_session.id
  http_method   = "POST"
  authorization = "NONE"
}

# Lambda integration
resource "aws_api_gateway_integration" "create_checkout_session_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.create_checkout_session.id
  http_method = aws_api_gateway_method.create_checkout_session_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.stripe_checkout.invoke_arn
}

# OPTIONS method for CORS support
resource "aws_api_gateway_method" "create_checkout_session_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.create_checkout_session.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "create_checkout_session_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.create_checkout_session.id
  http_method = aws_api_gateway_method.create_checkout_session_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "create_checkout_session_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.create_checkout_session.id
  http_method = aws_api_gateway_method.create_checkout_session_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "create_checkout_session_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.create_checkout_session.id
  http_method = aws_api_gateway_method.create_checkout_session_options.http_method
  status_code = aws_api_gateway_method_response.create_checkout_session_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "create_checkout_session_lambda_permission" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stripe_checkout.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/${aws_api_gateway_method.create_checkout_session_post.http_method}${aws_api_gateway_resource.create_checkout_session.path}"
}

# Output the API URL
output "stripe_checkout_url" {
  description = "URL for creating Stripe checkout sessions"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.create_checkout_session.path_part}"
}

# Create SSM Parameter for frontend to use
resource "aws_ssm_parameter" "stripe_checkout_url" {
  name        = "/waterwaycleanups/stripe_checkout_api_url"
  description = "URL for creating Stripe checkout sessions"
  type        = "String"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.create_checkout_session.path_part}"

  tags = {
    Environment = var.environment
    Project     = "waterwaycleanups"
  }
}
```

#### Required Terraform Variables

Add to `terraform/variables.tf`:

```hcl
variable "stripe_secret_key" {
  description = "Stripe secret API key (set via environment variable or terraform.tfvars)"
  type        = string
  sensitive   = true
}

variable "site_url" {
  description = "Base URL for the website"
  type        = string
  default     = "https://waterwaycleanups.org"
}
```

#### Environment Variables

**For local development/testing:**
```bash
export TF_VAR_stripe_secret_key="sk_test_..."
export TF_VAR_site_url="https://waterwaycleanups.org"
```

**For production (via terraform.tfvars - DO NOT COMMIT):**
```hcl
stripe_secret_key = "sk_live_..."
site_url          = "https://waterwaycleanups.org"
```

**Security Note:**
- The `STRIPE_SECRET_KEY` must NEVER be committed to Git
- Ensure `.gitignore` includes `*.tfvars` and `terraform.tfvars`
- ✅ **Implementation uses AWS Secrets Manager** (not environment variables)
- Secret is retrieved securely at runtime by Powertools Parameters utility
- Terraform stores the secret value in Secrets Manager during deployment

### 2. Frontend Changes

**File to Update:** `merch-page/services/stripe.ts`

#### Current Implementation (lines 23-57)
```typescript
export const redirectToCheckout = async (lineItems: StripeLineItem[]) => {
  const stripe = await stripePromise;
  // ... validation code ...

  const { error } = await stripe.redirectToCheckout({
    lineItems,
    mode: 'payment',
    successUrl: `${window.location.origin}/merchandise/?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${window.location.origin}/merchandise/`,
  });

  // ... error handling ...
};
```

#### New Implementation
```typescript
export const redirectToCheckout = async (lineItems: StripeLineItem[]) => {
  // Validate that all line items have stripe price IDs
  const invalidItems = lineItems.filter(item => !item.price || !item.price.startsWith('price_'));
  if (invalidItems.length > 0) {
    console.error("Some items don't have valid Stripe price IDs:", invalidItems);
    alert("Error: Some items in your cart are not properly configured for checkout. Please try again or contact support.");
    return;
  }

  try {
    // Get API URL from window (set by Hugo in HTML template)
    // This will be configured in layouts/merchandise/list.html
    const apiUrl = (window as any).STRIPE_CHECKOUT_API_URL;

    if (!apiUrl) {
      throw new Error('Checkout API URL is not configured');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lineItems }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    const { url } = await response.json();

    // Redirect to Stripe Checkout
    window.location.href = url;

  } catch (error) {
    console.error("Checkout error:", error);
    alert(`An error occurred during checkout: ${(error as Error).message}. Please try again.`);
  }
};
```

**Changes Made:**
1. Removed Stripe.js loading (no longer needed on frontend)
2. Added API call to backend endpoint
3. Simplified error handling
4. Maintained existing validation logic
5. User experience remains identical

#### Optional: Remove Stripe.js from Frontend

Since the frontend no longer needs `@stripe/stripe-js` for checkout, you can optionally remove it:

**Update `merch-page/services/stripe.ts`:**
```typescript
// Remove these lines:
// import { loadStripe } from '@stripe/stripe-js';
// const stripePromise = loadStripe(stripePublishableKey);

interface StripeLineItem {
  price: string;
  quantity: number;
}

export const redirectToCheckout = async (lineItems: StripeLineItem[]) => {
  // ... implementation above ...
};
```

**Update `layouts/merchandise/list.html`:**
```html
<!-- Remove or keep Stripe.js import (may be needed for future features) -->
<script type="importmap">
{
  "imports": {
    "react/": "https://aistudiocdn.com/react@^19.1.1/",
    "react": "https://aistudiocdn.com/react@^19.1.1",
    "react-dom/": "https://aistudiocdn.com/react-dom@^19.1.1/",
    "react-dom": "https://aistudiocdn.com/react-dom@^19.1.1",
    "sonner": "https://esm.sh/sonner@2.0.7?external=react,react-dom"
    // Removed: "@stripe/stripe-js": "https://aistudiocdn.com/@stripe/stripe-js@^7.9.0"
  }
}
</script>
```

**Note:** You can keep `window.STRIPE_PUBLISHABLE_KEY` in the HTML template in case you need it for future features (like embedded forms or payment elements).

#### Configure API URL in Hugo

**Update `config.yaml`:** Add the checkout API URL parameter (will be filled after terraform deployment)

```yaml
params:
  stripe_publishable_key: "pk_live_..."
  stripe_checkout_api_url: ""  # Add this - fill after terraform apply
```

**Update `layouts/merchandise/list.html`:** Expose the API URL to JavaScript

```html
<script>
  // Stripe configuration from Hugo
  window.STRIPE_PUBLISHABLE_KEY = '{{ site.Params.stripe_publishable_key | safeJS }}';
  window.STRIPE_CHECKOUT_API_URL = '{{ site.Params.stripe_checkout_api_url | safeJS }}';
</script>
```

### 3. Deployment Steps

#### Prerequisites

1. **Install Dependencies for Lambda Layer:**

   The Lambda function requires Stripe and AWS Lambda Powertools. Create a Lambda layer with both:

   **Create Lambda Layer (Recommended)**
   ```bash
   cd terraform
   mkdir -p lambda_layers/stripe_powertools/python

   # Install both Stripe and Powertools
   pip install stripe aws-lambda-powertools -t lambda_layers/stripe_powertools/python

   # Create the layer zip
   cd lambda_layers/stripe_powertools
   zip -r ../stripe_powertools_layer.zip .
   cd ../..

   # Verify the layer was created
   ls -lh lambda_layers/stripe_powertools_layer.zip
   ```

   The terraform configuration includes the Lambda layer resource and attaches it to the function.

   **Alternative: Package with Function (Not Recommended)**
   ```bash
   cd terraform
   mkdir -p stripe_checkout_package
   pip install stripe aws-lambda-powertools -t stripe_checkout_package
   cp lambda_create_checkout_session.py stripe_checkout_package/
   cd stripe_checkout_package
   zip -r ../lambda_create_checkout_session.zip .
   ```

#### Deployment Process

1. **Create Lambda layer with Stripe and Powertools (MUST DO FIRST):**
   ```bash
   cd terraform
   mkdir -p lambda_layers/stripe_powertools/python
   pip install stripe aws-lambda-powertools -t lambda_layers/stripe_powertools/python
   cd lambda_layers/stripe_powertools && zip -r ../stripe_powertools_layer.zip . && cd ../..
   ls -lh lambda_layers/stripe_powertools_layer.zip  # Verify it exists (~15-20 MB)
   ```

2. **Create the Lambda function file:**
   ```bash
   # Create the file at terraform/lambda_create_checkout_session.py
   # (Code provided in section 1 above)
   ```

3. **Create or update Terraform configuration:**
   ```bash
   # Create terraform/stripe_checkout.tf
   # (Configuration provided in section 1 above)
   ```

4. **Add variables to terraform/variables.tf:**
   ```bash
   # (Variables provided in section 1 above)
   ```

5. **Set environment variables:**
   ```bash
   export TF_VAR_stripe_secret_key="sk_test_..."  # Use test key for testing
   export TF_VAR_site_url="https://waterwaycleanups.org"
   ```

6. **Deploy with Terraform:**
   ```bash
   cd terraform
   terraform init  # Only if first time or new provider
   terraform plan  # Review changes
   terraform apply
   ```

7. **Get the API Gateway URL:**
   ```bash
   terraform output stripe_checkout_url
   ```

   Example output: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/create-checkout-session`

8. **Update config.yaml with API URL:**

   Add the output URL to `config.yaml`:
   ```yaml
   params:
     stripe_publishable_key: "pk_live_..."
     stripe_checkout_api_url: "https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/create-checkout-session"
   ```

9. **Update frontend code:**

   Update `merch-page/services/stripe.ts` and `layouts/merchandise/list.html` as shown in section 2 above.

10. **Rebuild and deploy frontend:**
    ```bash
    npm run build:merch
    # Deploy static files to your hosting
    ```

#### Update API Gateway Deployment

**IMPORTANT:** Update the existing API Gateway deployment in `terraform/event_rsvp.tf` (NOT main.tf) to include the new checkout session endpoint.

Find the `aws_api_gateway_deployment.volunteer_waiver_deployment` resource (around line 449 in event_rsvp.tf) and add the checkout session integrations:

```hcl
resource "aws_api_gateway_deployment" "volunteer_waiver_deployment" {
  depends_on = [
    # Waiver endpoints
    aws_api_gateway_integration.check_waiver_integration,
    aws_api_gateway_integration.submit_waiver_integration,
    aws_api_gateway_integration.check_waiver_options_integration,
    aws_api_gateway_integration.submit_waiver_options_integration,
    # RSVP endpoints
    aws_api_gateway_integration.check_rsvp_integration,
    aws_api_gateway_integration.submit_rsvp_integration,
    aws_api_gateway_integration.check_rsvp_options_integration,
    aws_api_gateway_integration.submit_rsvp_options_integration,
    aws_api_gateway_integration.list_rsvps_integration,
    aws_api_gateway_integration.list_rsvps_options_integration,
    # ADD THESE TWO LINES:
    aws_api_gateway_integration.create_checkout_session_integration,
    aws_api_gateway_integration.create_checkout_session_options_integration,
  ]

  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_integration.check_waiver_integration,
      aws_api_gateway_integration.submit_waiver_integration,
      aws_api_gateway_integration.check_waiver_options_integration,
      aws_api_gateway_integration.submit_waiver_options_integration,
      aws_api_gateway_integration.check_rsvp_integration,
      aws_api_gateway_integration.submit_rsvp_integration,
      aws_api_gateway_integration.check_rsvp_options_integration,
      aws_api_gateway_integration.submit_rsvp_options_integration,
      aws_api_gateway_integration.list_rsvps_integration,
      aws_api_gateway_integration.list_rsvps_options_integration,
      # ADD THESE TWO LINES:
      aws_api_gateway_integration.create_checkout_session_integration,
      aws_api_gateway_integration.create_checkout_session_options_integration,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}
```

## Testing Plan

### Phase 1: Development Testing

1. **Backend Endpoint Test**
   - [ ] Test endpoint with valid line items
   - [ ] Test with invalid price IDs
   - [ ] Test with missing/invalid quantities
   - [ ] Test with empty line items array
   - [ ] Verify error responses have correct status codes
   - [ ] Verify CORS headers allow frontend access

2. **Frontend Integration Test**
   - [ ] Test checkout with single item
   - [ ] Test checkout with multiple items
   - [ ] Test checkout with different quantities
   - [ ] Verify error messages display correctly
   - [ ] Test with slow network (verify loading state)

3. **Stripe Test Mode**
   - [ ] Use Stripe test keys
   - [ ] Complete test checkout with test card: `4242 4242 4242 4242`
   - [ ] Verify redirect to success page
   - [ ] Verify session_id in URL
   - [ ] Check Stripe Dashboard for test session

### Phase 2: Pre-Production Testing

4. **Security Validation**
   - [ ] Verify secret key is not exposed in browser
   - [ ] Verify prices are validated server-side
   - [ ] Test with manipulated frontend data (should fail gracefully)
   - [ ] Review server logs for sensitive data leaks

5. **Error Scenarios**
   - [ ] Test with backend unavailable (503 error)
   - [ ] Test with invalid Stripe keys (401 error)
   - [ ] Test with network timeout
   - [ ] Test with incomplete checkout (user cancels)

### Phase 3: Production Testing

6. **Live Checkout Test**
   - [ ] Switch to live Stripe keys
   - [ ] Test end-to-end checkout with real payment
   - [ ] Verify order appears in Stripe Dashboard
   - [ ] Test refund process
   - [ ] Verify success page displays correctly

7. **Cross-Browser/Device Testing**
   - [ ] Chrome (desktop & mobile)
   - [ ] Firefox
   - [ ] Safari (desktop & mobile)
   - [ ] Edge

8. **Observability Testing (with AWS Lambda Powertools & X-Ray)**
   - [ ] Verify structured logs in CloudWatch Logs
   - [ ] Check X-Ray traces for Stripe API calls
   - [ ] Verify correlation IDs link requests to traces
   - [ ] Test CloudWatch Insights queries for checkout metrics
   - [ ] Verify errors are properly logged with stack traces

## Observability & Monitoring

With AWS Lambda Powertools and X-Ray integration, you get comprehensive observability:

### CloudWatch Logs
Structured JSON logs with automatic context:
```json
{
  "level": "INFO",
  "location": "create_checkout_session:190",
  "message": "Checkout session created successfully",
  "timestamp": "2025-10-23T12:00:00.000Z",
  "service": "stripe-checkout",
  "session_id": "cs_test_abc123",
  "amount_total": 3000,
  "currency": "usd",
  "num_items": 2,
  "cold_start": false,
  "function_name": "stripe_create_checkout_session",
  "function_memory_size": 256,
  "function_arn": "arn:aws:lambda:...",
  "function_request_id": "abc-123-def-456"
}
```

### X-Ray Tracing
- End-to-end request tracing from API Gateway → Lambda → Stripe API
- Automatic service map visualization
- Performance bottleneck identification
- Error rate tracking per subsegment

### CloudWatch Insights Queries

**Find failed checkout attempts:**
```
fields @timestamp, @message, session_id, error_type
| filter @message like /Stripe API error/
| sort @timestamp desc
| limit 20
```

**Checkout success rate:**
```
stats count(*) as total,
      count(success = true) as successful,
      avg(amount_total) as avg_amount
by bin(5m)
```

**Monitor Lambda performance:**
```
filter @type = "REPORT"
| stats avg(@duration), max(@duration), avg(@billedDuration)
by bin(5m)
```

### Monitoring Dashboards

Consider creating CloudWatch Dashboard with:
- Checkout success/failure rate
- Average checkout amount
- Lambda duration and error rate
- X-Ray service map
- Stripe API latency

## Migration Checklist

### Pre-Migration

- [ ] Review current implementation and document any customizations
- [ ] Set up backend development environment
- [ ] Install required dependencies (`stripe` package)
- [ ] Configure environment variables locally
- [ ] Create test Stripe account if not already available

### Development

- [ ] Create backend API endpoint
- [ ] Test backend endpoint in isolation
- [ ] Update frontend service file
- [ ] Remove deprecated code references
- [ ] Update build scripts if necessary
- [ ] Test complete flow locally

### Deployment

- [ ] Deploy backend function to chosen platform
- [ ] Set environment variables in production
- [ ] Verify CORS configuration
- [ ] Update frontend to use production API endpoint
- [ ] Build and deploy frontend changes

### Post-Deployment

- [ ] Monitor server logs for errors
- [ ] Test with small real transaction
- [ ] Monitor Stripe Dashboard for issues
- [ ] Document new architecture for team
- [ ] Update README/documentation

## Rollback Plan

If issues arise after deployment:

1. **Quick Rollback:**
   - Revert `merch-page/services/stripe.ts` to previous version
   - Redeploy frontend
   - Backend endpoint can remain (won't be called)

2. **Database/State:**
   - No database changes in this migration
   - No state changes required for rollback

3. **Testing After Rollback:**
   - Verify old implementation still works
   - Check Stripe Dashboard for any stuck sessions

## Estimated Effort

- **Lambda layer setup:** 1 hour
- **Backend endpoint development:** 2-3 hours
- **Frontend integration:** 1-2 hours
- **Testing (all phases):** 3-4 hours
- **Deployment and configuration:** 2-3 hours
- **Documentation updates:** 1 hour
- **Total:** 10-14 hours

## Cost Implications

**Serverless Functions:**
- Netlify: 125,000 function invocations/month free
- Vercel: 100,000 invocations/month free
- AWS Lambda: 1 million invocations/month free

**Estimated Usage:**
- Each checkout = 1 function invocation
- Even with 10,000 checkouts/month, well within free tiers
- **Expected additional cost: $0/month**

## Dependencies

### New Dependencies
- `stripe` npm package (backend only)
- Serverless function runtime (platform-specific)

### Environment Variables
- `STRIPE_SECRET_KEY` (production: `sk_live_...`, test: `sk_test_...`)
- `SITE_URL` (e.g., `https://waterwaycleanups.org`)

### Platform Requirements
- One of: Netlify, Vercel, AWS, or traditional backend
- SSL/HTTPS (required by Stripe)
- CORS configuration for API endpoint

## Security Considerations

### Critical Security Points

1. **Never expose secret key:**
   - Secret key (`sk_...`) must only exist on backend
   - Use environment variables, never hardcode
   - Don't commit to Git (add to `.gitignore`)

2. **Input validation:**
   - Validate price IDs format (`price_...`)
   - Validate quantity ranges (1-100)
   - Validate array length (prevent DoS)

3. **Rate limiting:**
   - Consider adding rate limiting to prevent abuse
   - Most serverless platforms provide this built-in

4. **CORS configuration:**
   - Only allow requests from your domain
   - Update `Access-Control-Allow-Origin` from `*` to specific domain in production:
     ```javascript
     'Access-Control-Allow-Origin': 'https://waterwaycleanups.org'
     ```

5. **Error messages:**
   - Don't expose internal error details to frontend
   - Log detailed errors server-side only

### Additional Security Enhancements (Optional)

- **Webhook signature verification:** Verify Stripe webhook signatures
- **Session expiration:** Sessions expire automatically after 24 hours
- **HTTPS enforcement:** Ensure all traffic uses HTTPS
- **Request signing:** Add HMAC signature to frontend requests

## Performance Considerations

### Expected Performance

- **Cold start latency:** 200-500ms (serverless platforms)
- **Warm function latency:** 50-100ms
- **Stripe API latency:** 200-400ms
- **Total checkout flow:** ~500-1000ms (acceptable)

### Optimization Strategies

1. **Keep functions warm:**
   - Most platforms keep functions warm with regular traffic
   - Consider ping service for low-traffic sites

2. **Minimal dependencies:**
   - Only include Stripe SDK
   - No unnecessary packages

3. **Connection pooling:**
   - Reuse Stripe client instance across requests

## Future Enhancements

Once migration is complete, consider these improvements:

### Short-term (1-3 months)
- Add Stripe Tax integration for automatic tax calculation
- Implement webhook for order confirmation emails
- Store order details in database for order history

### Medium-term (3-6 months)
- Add customer accounts and saved payment methods
- Implement subscription products
- Add discount codes/promotions support

### Long-term (6+ months)
- Implement inventory management system
- Add order fulfillment workflow
- Create admin dashboard for order management

## Related Files

### Files to Modify
- `merch-page/services/stripe.ts` - Update checkout function
- `layouts/merchandise/list.html` - Optional: remove Stripe.js import

### Files to Create
- `netlify/functions/create-checkout-session.js` (or equivalent for your platform)
- `netlify.toml` - Function configuration (if using Netlify)
- `.env.example` - Document required environment variables

### Files to Review
- `config.yaml` - Stripe publishable key configuration
- `package.json` - Add Stripe dependency (backend)
- `.gitignore` - Ensure `.env` is excluded

### Documentation to Update
- `README.md` - Add backend setup instructions
- `docs/merch-page.md` - Update architecture documentation
- `todos/checkout-success-phase-2.md` - Ensure compatibility

## Additional Resources

### Stripe Documentation
- [Checkout Sessions Overview](https://stripe.com/docs/payments/checkout)
- [Create a Session API](https://stripe.com/docs/api/checkout/sessions/create)
- [Stripe.js Reference (still useful for future features)](https://stripe.com/docs/js)
- [Webhooks Guide](https://stripe.com/docs/webhooks)

### Serverless Platform Docs
- [Netlify Functions](https://docs.netlify.com/functions/overview/)
- [Vercel Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions)
- [AWS Lambda](https://docs.aws.amazon.com/lambda/)

### Testing Resources
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Stripe CLI for webhook testing](https://stripe.com/docs/stripe-cli)

## Questions & Decisions

### Decisions to Make Before Starting

1. **Which serverless platform?**
   - Current deployment: Netlify/Vercel/Other?
   - Recommendation: Use same platform as static site hosting

2. **Keep Stripe.js on frontend?**
   - Remove for minimal bundle size
   - Keep for potential future features (embedded checkout, payment elements)
   - Recommendation: Keep for flexibility

3. **Implement webhooks now or later?**
   - Not required for basic functionality
   - Needed for order processing, inventory, emails
   - Recommendation: Implement after core migration is stable

4. **Error handling strategy?**
   - Show generic error vs. specific error messages
   - Retry logic for failed requests
   - Recommendation: Generic errors to user, detailed logs server-side

### Open Questions

- Is the site currently using Netlify, Vercel, or another platform?
- Do you want to implement webhooks as part of this migration?
- Should we add monitoring/alerting for failed checkouts?
- Do you need multi-currency support?

## Notes

- This migration maintains 100% identical user experience
- No changes to product data or Stripe configuration required
- Can be developed and tested without affecting production
- Rollback is straightforward if issues arise
- Sets foundation for future e-commerce enhancements
