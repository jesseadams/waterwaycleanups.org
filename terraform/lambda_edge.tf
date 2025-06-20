# IAM Role for Lambda@Edge
resource "aws_iam_role" "lambda_edge_role" {
  name = "lambda-edge-spa-router-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = [
            "lambda.amazonaws.com",
            "edgelambda.amazonaws.com"
          ]
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_edge_basic" {
  role       = aws_iam_role.lambda_edge_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda@Edge function for SPA routing
resource "aws_lambda_function" "spa_router" {
  filename      = "${path.module}/lambda-at-edge.zip"
  function_name = "spa-router"
  role          = aws_iam_role.lambda_edge_role.arn
  handler       = "lambda-at-edge.handler"
  runtime       = "nodejs18.x"
  publish       = true  # Required for Lambda@Edge
  
  # Timeout and memory settings
  memory_size = 128
  timeout     = 5
  
  # Dependency on the zip file
  depends_on = [null_resource.lambda_edge_zip]
}

# This null resource uses local-exec to create the Lambda deployment package
resource "null_resource" "lambda_edge_zip" {
  triggers = {
    # Re-run whenever the Lambda code changes
    lambda_hash = filemd5("${path.module}/lambda-at-edge.js")
  }

  provisioner "local-exec" {
    command = <<EOF
      cd ${path.module}
      zip lambda-at-edge.zip lambda-at-edge.js
    EOF
  }
}
