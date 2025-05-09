#!/usr/bin/env python
# -*- coding: utf-8 -*-

import boto3
import sys
import argparse
from datetime import datetime

# Set up argument parsing
parser = argparse.ArgumentParser(description='Create an SES template with a date parameter')
parser.add_argument('--date', type=str, help='Date for the template name (YYYY-MM-DD format)', required=True)
args = parser.parse_args()

template_name = "waterway-cleanups-"

# Validate and use the date
try:
    template_name += args.date
except ValueError:
    print("Error: Date must be in YYYY-MM-DD format")
    sys.exit(1)

# Configuration
subject_line = "Join Us in Keeping Our Waterways Clean!"
html_file_path = args.date + "/template.html"
text_file_path = args.date + "/template.txt"

# Read HTML and text content
with open(html_file_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

with open(text_file_path, 'r', encoding='utf-8') as f:
    text_content = f.read()

# Initialize Boto3 SES client
ses = boto3.client('ses', region_name='us-east-1')  # adjust region as needed

# Create or update template
template_data = {
    'Template': {
        'TemplateName': template_name,
        'SubjectPart': subject_line,
        'TextPart': text_content,
        'HtmlPart': html_content
    }
}

print(f"Creating/updating SES template '{template_name}'...")

try:
    ses.create_template(**template_data)
    print(f"Template '{template_name}' created successfully.")
except ses.exceptions.AlreadyExistsException:
    ses.update_template(**template_data)
    print(f"Template '{template_name}' already existed. It was updated.")
except Exception as e:
    print("Error:", e)
