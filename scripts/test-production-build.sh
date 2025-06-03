#!/bin/bash

# This script simulates the GitHub Actions workflow locally and tests the production build

echo "Cleaning up previous builds..."
npm run clean

echo "Building assets with production settings..."
export NODE_ENV=production
npm run build:assets

echo "Building Hugo items..."
hugo --minify

echo "✅ Production build completed."
echo "Check the public/ directory for the final build output."
echo "To test locally run: cd public && python3 -m http.server 1313" 