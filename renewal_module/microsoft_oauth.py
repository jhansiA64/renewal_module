import urllib
import frappe


CLIENT_ID = "6c7d4616-8bd2-4da0-a30e-728986b59ef7"
CLIENT_SECRET = "8cfa5e28-9e8e-43a0-a0fc-95914a5dfa49"
TENANT_ID = "598917d1-d535-41ad-901d-a09e7eb1251e"
REDIRECT_URI = "http://192.168.23.185:8000/microsoft_oauth/callback"

AUTH_URL = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize"
TOKEN_URL = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
SCOPES = "offline_access Calendars.ReadWrite User.Read"

@frappe.whitelist(allow_guest=True)
def login():
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",  # This tells Microsoft to return an authorization code
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,  # Permissions to access calendar
    }
    auth_url = f"{AUTH_URL}?{urllib.parse.urlencode(params)}"
    
    # Redirect the user to Microsoft's OAuth page
    frappe.local.response.update({
        'type': 'redirect',
        'location': auth_url
    })




import requests

@frappe.whitelist(allow_guest=True)
def callback():
    code = frappe.local.form_dict.get("code")
    if not code:
        return "Error: No authorization code provided."

    # Exchange the authorization code for an access token
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    response = requests.post(TOKEN_URL, data=data)
    if response.status_code != 200:
        return f"Error: {response.json()}"
    
    token_data = response.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")

    # Save tokens for later use (e.g., in session or a database)
    frappe.session.user_data["microsoft_access_token"] = access_token
    frappe.session.user_data["microsoft_refresh_token"] = refresh_token

    return "Microsoft OAuth successful. You are now connected."



def refresh_access_token():
    refresh_token = frappe.session.user_data.get("microsoft_refresh_token")
    if not refresh_token:
        return "Error: No refresh token found."

    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }

    response = requests.post(TOKEN_URL, data=data)
    if response.status_code != 200:
        return f"Error: {response.json()}"

    token_data = response.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")

    # Save the new tokens
    frappe.session.user_data["microsoft_access_token"] = access_token
    frappe.session.user_data["microsoft_refresh_token"] = refresh_token

    return "Access token refreshed successfully."



import requests

def create_calendar_event(event_data):
    access_token = frappe.session.user_data.get("microsoft_access_token")
    if not access_token:
        return "Error: Access token is missing or expired."

    url = "https://graph.microsoft.com/v1.0/me/events"  # API endpoint to create an event
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",  # JSON request body
    }

    payload = {
        "subject": event_data.get("subject"),  # Event title
        "start": {
            "dateTime": event_data.get("start_time"),  # Event start time
            "timeZone": "UTC",  # Timezone (use UTC or user preferred time zone)
        },
        "end": {
            "dateTime": event_data.get("end_time"),  # Event end time
            "timeZone": "UTC",  # Timezone (use UTC or user preferred time zone)
        },
        "location": {
            "displayName": event_data.get("location"),  # Location name (optional)
        },
    }

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 201:
        return "Event created successfully."
    else:
        return f"Error creating event: {response.json()}"



def fetch_calendar_events():
    access_token = frappe.session.user_data.get("microsoft_access_token")
    if not access_token:
        return "Error: Access token is missing or expired."

    url = "https://graph.microsoft.com/v1.0/me/events"  # API endpoint to get events
    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()  # List of events
    else:
        return f"Error fetching events: {response.json()}"




def store_event_in_erp(event_data):
    calendar_event = frappe.get_doc({
        "doctype": "Calendar Event",  # Replace with your custom DocType
        "event_name": event_data.get("subject"),
        "start_time": event_data.get("start_time"),
        "end_time": event_data.get("end_time"),
        "location": event_data.get("location"),
    })
    calendar_event.insert()
    frappe.db.commit()



import frappe

def sync_erpnext_events_to_microsoft():
    # Get the events from ERPNext that need to be synced to Microsoft Calendar
    events = frappe.get_all("Event", filters={"sync_to_microsoft": 1}, fields=["name", "subject", "start_datetime", "end_datetime", "location"])

    for event in events:
        # Prepare the event data to send to Microsoft Calendar
        event_data = {
            "subject": event.subject,
            "start_time": event.start_datetime.strftime("%Y-%m-%dT%H:%M:%S"),  # Ensure proper format
            "end_time": event.end_datetime.strftime("%Y-%m-%dT%H:%M:%S"),
            "location": event.location,
        }
        
        # Call the function to create the event in Microsoft Calendar
        response = create_calendar_event(event_data)
        
        # Handle any responses or errors if needed
        if "Error" in response:
            frappe.log_error(f"Error syncing event {event.name} to Microsoft: {response}")
        else:
            # Mark the event as synced in ERPNext (Optional)
            frappe.db.set_value("Event", event.name, "sync_status", "Synced")


def sync_microsoft_events_to_erpnext():
    access_token = frappe.session.user_data.get("microsoft_access_token")
    if not access_token:
        frappe.log_error("No access token found for Microsoft Calendar sync.", "Microsoft Sync")
        return

    # Fetch events from Microsoft Calendar
    events = fetch_calendar_events()  # This calls the fetch function defined earlier
    if isinstance(events, dict):
        for event in events.get("value", []):
            # Map Microsoft Calendar event to ERPNext Event fields
            event_data = {
                "subject": event.get("subject"),
                "start_datetime": event["start"]["dateTime"],
                "end_datetime": event["end"]["dateTime"],
                "location": event.get("location", {}).get("displayName"),
                "sync_to_microsoft": 1,  # Flag to keep track of sync
            }

            # Check if event already exists in ERPNext (e.g., by Microsoft event ID)
            existing_event = frappe.get_all("Event", filters={"subject": event_data["subject"], "start_datetime": event_data["start_datetime"]})
            if not existing_event:
                # Create new event in ERPNext if it doesn't exist
                new_event = frappe.get_doc({
                    "doctype": "Event",
                    "subject": event_data["subject"],
                    "start_datetime": event_data["start_datetime"],
                    "end_datetime": event_data["end_datetime"],
                    "location": event_data["location"],
                    "sync_to_microsoft": event_data["sync_to_microsoft"],
                })
                new_event.insert()
            else:
                # Optionally update existing events (if you want to sync changes)
                frappe.db.set_value("Event", existing_event[0].name, event_data)



import frappe
from frappe import _

@frappe.whitelist(allow_guest=True)
def trigger_sync():
    try:
        # Trigger the sync of ERPNext events to Microsoft Calendar
        sync_erpnext_events_to_microsoft()

        # Trigger the sync of Microsoft Calendar events to ERPNext
        sync_microsoft_events_to_erpnext()

        return "Sync completed successfully!"
    
    except Exception as e:
        frappe.log_error(f"Error in trigger_sync: {str(e)}", "Microsoft Calendar Sync")
        return f"Error occurred: {str(e)}"
