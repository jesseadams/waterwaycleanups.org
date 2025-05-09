import csv
import boto3
import sys
import json

# === CONFIGURATION ===
contact_list_name = "WaterwayCleanups"
csv_file_path = "volunteers.csv"  # Must have headers like: email,firstName
region = "us-east-1"  # Use the region where SES v2 is enabled
topics = ["volunteer", "donor"]  # Topics for the contact list

# Initialize SESv2 client
sesv2 = boto3.client("sesv2", region_name=region)

# Step 1: Create the contact list (if it doesn't already exist)
def create_contact_list(name):
    try:
        sesv2.create_contact_list(
            ContactListName=name,
            Topics=[
                {
                    "TopicName": "volunteer",
                    "DisplayName": "Volunteer Notifications",
                    "Description": "Get updates about volunteer opportunities, cleanup events, and Waterway Cleanups news.",
                    "DefaultSubscriptionStatus": "OPT_OUT"
                },
                {
                    "TopicName": "donor",
                    "DisplayName": "Donor Notifications",
                    "Description": "Support our mission with your donations. Get updates about donation drives, fundraising events, and Waterway Cleanups news.",
                    "DefaultSubscriptionStatus": "OPT_OUT"
                }
            ]
        )
        print(f"Contact list '{name}' created.")
    except sesv2.exceptions.BadRequestException as error:
        if "A maximum of 1 Lists allowed per account." in str(error):
            print(f"Contact list '{name}' already exists.")
        else:
            print(f"Error creating contact list '{name}': {error}")
            sys.exit(1)

# Step 2: Add contacts from CSV
def upload_contacts(csv_path, list_name):
    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            email = row["email"]
            attributes = {k: v for k, v in row.items() if k not in ["email"] + [f"is_{t}" for t in topics]}

            topic_preferences = []
            for topic in topics:
                field = f"is_{topic}"
                print(f"Topic field: {field}")
                if row.get(field, "").strip().lower() == "true":
                    topic_preferences.append({
                        "TopicName": topic,
                        "SubscriptionStatus": "OPT_IN"
                    })
            try:
                print(attributes)
                sesv2.create_contact(
                    ContactListName=list_name,
                    EmailAddress=email,
                    AttributesData=json.dumps(attributes),
                    TopicPreferences=topic_preferences
                )
                print(f"Added: {email}")
            except sesv2.exceptions.AlreadyExistsException:
                print(f"Skipped (already exists): {email}")
            except Exception as e:
                print(f"Error adding {email}: {e}")


# === RUN SCRIPT ===
if __name__ == "__main__":
    create_contact_list(contact_list_name)
    upload_contacts(csv_file_path, contact_list_name)
