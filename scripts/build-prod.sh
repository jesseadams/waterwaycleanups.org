#!/bin/bash
# Build script for production environment

export HUGO_API_BASE_URL="https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod"
export HUGO_API_BASE_URL_VOLUNTEER="https://ppiqomgl8a.execute-api.us-east-1.amazonaws.com/prod"
export HUGO_EVENTS_API_URL="https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/prod"

echo "Building for PRODUCTION environment..."
echo "API URLs:"
echo "  - Base: $HUGO_API_BASE_URL"
echo "  - Events: $HUGO_EVENTS_API_URL"

npm run build
