#!/bin/bash

# Find all HTML files
find . -type f -name "*.html" -not -path "./node_modules/*" -not -path "./public/*" | while read -r file; do
  # Look for lines with potentially problematic syntax
  problematic_lines=$(grep -n "{{.*<.*}}" "$file" || true)
  if [ -n "$problematic_lines" ]; then
    echo "Potential issue in $file:"
    echo "$problematic_lines"
    echo ""
  fi
done 