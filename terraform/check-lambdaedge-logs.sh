#!/bin/bash

# Script to check Lambda@Edge logs across multiple AWS regions
# Usage: ./check-lambdaedge-logs.sh [function-name] [hours-ago]
#   function-name: Name of the Lambda@Edge function (default: spa-router)
#   hours-ago: How many hours of logs to retrieve (default: 24)

set -e

# Default values
FUNCTION_NAME=${1:-"spa-router"}
HOURS_AGO=${2:-24}

# Calculate start time in milliseconds
START_TIME=$(date -d "$HOURS_AGO hours ago" +%s)000

# Regions where CloudFront might execute Lambda@Edge functions
REGIONS=(
  "us-east-1"
  "us-east-2"
  "us-west-1"
  "us-west-2"
  "ca-central-1"
  "eu-west-1"
  "eu-west-2"
  "eu-central-1"
  "ap-northeast-1"
  "ap-northeast-2"
  "ap-southeast-1"
  "ap-southeast-2"
  "ap-south-1"
  "sa-east-1"
)

echo "=== Checking Lambda@Edge logs for '$FUNCTION_NAME' across AWS regions ==="
echo "Looking for logs from the past $HOURS_AGO hours"
echo "----------------------------------------"

# Function to check if log group exists
check_log_group() {
  local region=$1
  local log_group_name=$2
  
  if aws logs describe-log-groups --log-group-name-prefix "$log_group_name" --region "$region" --query "logGroups[?logGroupName=='$log_group_name'].logGroupName" --output text | grep -q "$log_group_name"; then
    return 0  # Log group exists
  else
    return 1  # Log group does not exist
  fi
}

# Variable to track if we found any logs
FOUND_LOGS=0

# Loop through regions and check for logs
for region in "${REGIONS[@]}"; do
  echo "Checking region: $region"
  
  # The log group naming pattern for Lambda@Edge: /aws/lambda/us-east-1.function-name
  # Where us-east-1 is the region where the function was originally created
  LOG_GROUP="/aws/lambda/us-east-1.$FUNCTION_NAME"
  
  if check_log_group "$region" "$LOG_GROUP"; then
    echo "  ✓ Log group found: $LOG_GROUP"
    
    # Get the log streams
    echo "  Retrieving log events from the past $HOURS_AGO hours..."
    LOG_EVENTS=$(aws logs filter-log-events \
      --log-group-name "$LOG_GROUP" \
      --start-time "$START_TIME" \
      --region "$region" \
      --query "events[*].{message:message,timestamp:timestamp}" \
      --output json)
    
    # Count log events
    EVENT_COUNT=$(echo "$LOG_EVENTS" | jq 'length')
    
    if [[ $EVENT_COUNT -gt 0 ]]; then
      echo "  Found $EVENT_COUNT log events!"
      echo "  Latest 3 log events:"
      
      # Display the latest 3 log events
      echo "$LOG_EVENTS" | jq -r 'sort_by(.timestamp) | reverse | .[0:3] | .[] | "    " + (.message | gsub("\n"; "\n    "))' | sed 's/\\t/    /g'
      
      FOUND_LOGS=1
      echo ""
    else
      echo "  No log events found in the specified time range."
    fi
  else
    echo "  ✗ No log group found: $LOG_GROUP"
  fi
done

echo "----------------------------------------"

if [[ $FOUND_LOGS -eq 0 ]]; then
  echo "No Lambda@Edge logs found in any region for '$FUNCTION_NAME'."
  echo "Possible reasons:"
  echo "1. The function has not been executed yet"
  echo "2. It's been more than $HOURS_AGO hours since execution"
  echo "3. There are issues with the Lambda@Edge configuration"
  echo "4. CloudFront is not invoking the function"
  echo ""
  echo "Verify your CloudFront configuration and Lambda@Edge setup."
else
  echo "Successfully found Lambda@Edge logs."
  echo "To view complete logs, go to the CloudWatch console in the regions listed above."
fi

exit 0
