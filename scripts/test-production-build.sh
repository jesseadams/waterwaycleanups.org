#!/bin/bash

# This script simulates the GitHub Actions workflow locally and tests the production build

echo "Cleaning up previous builds..."
npm run clean

echo "Building assets with production settings..."
export NODE_ENV=production
npm run build:assets

echo "Minifying non-tailwind CSS files..."
npm run minify:css

echo "Building Hugo items..."
export HUGO_ENV=production
hugo --minify

echo "✅ Production build completed."
echo "Check the public/ directory for the final build output."
echo "To test locally run: cd public && python3 -m http.server 1313" 