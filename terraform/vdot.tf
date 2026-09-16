# VDOT Adopt-a-Highway Application Automation
#
# Public POST endpoint that takes an applicant's info plus one or more road
# segments selected on the /vdot map, fills out the official VDOT Adopt-A-
# Highway Permit Application PDF, and emails it as an attachment via SES to
# a reviewer address (see lambda_vdot_submit.py for recipient details).

# ===== IAM =====

resource "aws_iam_role" "vdot_submit_role" {
  name = "vdot_submit_role${local.resource_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Principal = { Service = "lambda.amazonaws.com" },
      Effect    = "Allow"
    }]
  })
}

resource "aws_iam_policy" "vdot_submit_policy" {
  name        = "vdot_submit_policy${local.resource_suffix}"
  description = "IAM policy for the VDOT Adopt-a-Highway application lambda"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action   = ["ses:SendRawEmail", "ses:SendEmail"],
        Resource = "*",
        Effect   = "Allow"
      },
      {
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource = "arn:aws:logs:*:*:*",
        Effect   = "Allow"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "vdot_submit_attachment" {
  role       = aws_iam_role.vdot_submit_role.name
  policy_arn = aws_iam_policy.vdot_submit_policy.arn
}

# ===== LAMBDA =====
#
# Bundles pypdf (used to fill the AcroForm PDF), reportlab + pillow (used to
# draw the applicant's captured signature image onto the PDF's Applicant's
# Signature line -- that field is a real /Sig AcroForm field, which can't be
# filled with text, so the signature has to be drawn onto the page directly),
# and the blank application PDF alongside the handler code, the same
# pip-into-build-dir-then-zip pattern used for rsvp_confirmation's pytz
# dependency.

resource "null_resource" "vdot_submit_package" {
  provisioner "local-exec" {
    command = <<EOF
rm -rf ${path.module}/lambda_vdot_submit_package
mkdir -p ${path.module}/lambda_vdot_submit_package
cp ${path.module}/lambda_vdot_submit.py ${path.module}/lambda_vdot_submit_package/
cp ${path.module}/vdot_coordinators.py ${path.module}/lambda_vdot_submit_package/
cp ${path.module}/vdot_aah_application.pdf ${path.module}/lambda_vdot_submit_package/
pip install pypdf typing_extensions reportlab pillow --platform manylinux2014_x86_64 --target ${path.module}/lambda_vdot_submit_package/ --python-version 3.9 --only-binary=:all: --implementation cp --no-deps >/dev/null 2>&1
cd ${path.module}/lambda_vdot_submit_package && python3 -c "import zipfile; import os; z=zipfile.ZipFile('../lambda_vdot_submit.zip', 'w'); [z.write(os.path.join(root, f), os.path.join(root, f)) for root, _, files in os.walk('.') for f in files]; z.close()"
cd ${path.module} && rm -rf lambda_vdot_submit_package
EOF
  }

  triggers = {
    code_hash         = filemd5("${path.module}/lambda_vdot_submit.py")
    coordinators_hash = filemd5("${path.module}/vdot_coordinators.py")
    pdf_hash          = filemd5("${path.module}/vdot_aah_application.pdf")
  }
}

resource "aws_lambda_function" "vdot_submit" {
  function_name = "vdot_submit${local.resource_suffix}"
  filename      = "${path.module}/lambda_vdot_submit.zip"
  # Hash the actual zip (not just the .py source) so that dependency/packaging
  # changes (e.g. pip install flags) correctly trigger a redeploy, not just
  # handler code edits. depends_on ensures the zip is (re)built by the
  # null_resource before this hash is read.
  source_code_hash = filebase64sha256("${path.module}/lambda_vdot_submit.zip")
  handler          = "lambda_vdot_submit.handler"
  runtime          = "python3.9"
  role             = aws_iam_role.vdot_submit_role.arn
  timeout          = 30
  memory_size      = 384

  environment {
    variables = {
      SENDER_EMAIL    = "info@waterwaycleanups.org"
      RECIPIENT_EMAIL = "jesse@techno-geeks.org"
      CC_EMAIL        = "jesse@waterwaycleanups.org"
    }
  }

  depends_on = [null_resource.vdot_submit_package]
}

# ===== API GATEWAY =====

resource "aws_api_gateway_resource" "vdot_submit" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  parent_id   = aws_api_gateway_rest_api.volunteer_waiver_api.root_resource_id
  path_part   = "vdot-submit"
}

resource "aws_api_gateway_method" "vdot_submit_post" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.vdot_submit.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "vdot_submit_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.vdot_submit.id
  http_method = aws_api_gateway_method.vdot_submit_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.vdot_submit.invoke_arn
}

# OPTIONS for CORS
resource "aws_api_gateway_method" "vdot_submit_options" {
  rest_api_id   = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id   = aws_api_gateway_resource.vdot_submit.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "vdot_submit_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.vdot_submit.id
  http_method = aws_api_gateway_method.vdot_submit_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "vdot_submit_options_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.vdot_submit.id
  http_method = aws_api_gateway_method.vdot_submit_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "vdot_submit_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.volunteer_waiver_api.id
  resource_id = aws_api_gateway_resource.vdot_submit.id
  http_method = aws_api_gateway_method.vdot_submit_options.http_method
  status_code = aws_api_gateway_method_response.vdot_submit_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'OPTIONS,POST'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.vdot_submit_options_integration]
}

resource "aws_lambda_permission" "vdot_submit_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.vdot_submit.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.volunteer_waiver_api.execution_arn}/*/*"
}

output "vdot_submit_url" {
  description = "URL for submitting VDOT Adopt-a-Highway applications"
  value       = "${aws_api_gateway_stage.volunteer_waiver_stage.invoke_url}/${aws_api_gateway_resource.vdot_submit.path_part}"
}
