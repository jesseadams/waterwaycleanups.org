# Finding and Troubleshooting Lambda@Edge Logs

Lambda@Edge functions write their logs to CloudWatch Logs, but the log groups are created in the AWS region closest to where the function was executed (i.e., closest to the viewer's location). This can make logs difficult to find if you're not looking in the right place.

## Where to Find Lambda@Edge Logs

Lambda@Edge logs are created in **ALL AWS regions** where your CloudFront distribution serves content and the function executes. The logs are **NOT** only in the region where you created the function.

### Log Group Naming

For the `spa-router` Lambda@Edge function, log groups will be named:

```
/aws/lambda/us-east-1.spa-router
```

Where `us-east-1` is the region where you originally deployed the Lambda function, and the log group is created in each region where CloudFront executes the function.

## Step-by-Step Guide to Find Logs

1. Sign in to the AWS Management Console
2. Navigate to CloudWatch service
3. In the CloudWatch sidebar, click on "Logs" and then "Log groups"
4. **Important:** Change your AWS region to each of the CloudFront edge locations below to check for logs:
   - us-east-1 (N. Virginia)
   - us-east-2 (Ohio)
   - us-west-1 (N. California)
   - us-west-2 (Oregon)
   - eu-west-1 (Ireland)
   - etc.

5. In each region, search for log groups named: `/aws/lambda/us-east-1.spa-router`

## Common Log Issues with Lambda@Edge

1. **No Logs at All**: 
   - Check that your Lambda@Edge function has the proper IAM permissions for CloudWatch Logs
   - Verify that CloudFront is actually invoking the Lambda function
   - Remember that logs can take several minutes to appear after function execution

2. **Function Version Issues**:
   - Lambda@Edge requires a specific version to be associated with CloudFront
   - Ensure you're using `${aws_lambda_function.spa_router.arn}:${aws_lambda_function.spa_router.version}` in the CloudFront configuration

3. **Logs in Unexpected Regions**:
   - If you're testing from your location in the US but don't see logs in US regions, try checking other regions
   - Use a tool like VPN to test from different geographical locations

## CloudWatch Logs CLI Command

To quickly check for logs across multiple regions, you can use the AWS CLI:

```bash
# Replace YYYY-MM-DD with the date you want to search
for region in us-east-1 us-east-2 us-west-1 us-west-2 eu-west-1 eu-west-2 ap-northeast-1 ap-southeast-1 ap-southeast-2; do
  echo "Checking region: $region"
  aws logs filter-log-events --log-group-name "/aws/lambda/us-east-1.spa-router" --start-time "$(date -d 'YYYY-MM-DD' +%s)000" --region $region
done
```

## Lambda@Edge Execution Role

The Lambda@Edge function has been configured with enhanced permissions to ensure proper logging:

1. A dedicated CloudWatch Logs policy that allows:
   - Creating log groups
   - Creating log streams
   - Putting log events

2. The AWSLambdaBasicExecutionRole policy that provides:
   - Basic Lambda execution permissions
   - Required permissions for edge functions

## Triggering Logs for Testing

To verify that logging is working:

1. Visit different URLs on your site:
   - Main site: `https://waterwaycleanups.org/`
   - Admin site: `https://waterwaycleanups.org/sesv2-admin/`
   - A non-existent path: `https://waterwaycleanups.org/test-path/`

2. Check the CloudWatch Logs in various regions after your tests

3. Look for the detailed log messages added to the Lambda function, which include:
   - Full request details including URI, headers, and client IP
   - Processing steps and decisions made by the function
   - Final request state before forwarding to origin
