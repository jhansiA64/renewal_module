# Copyright (c) 2025, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe
from datetime import timedelta
from frappe.utils import now_datetime

class CustomCalendar(Document):
	pass




def send_calendar_notifications():
    now = now_datetime()
    in_10_min = now + timedelta(minutes=10)

    # Fetch events starting in next 10 minutes and not notified yet
    events = frappe.get_all("Custom Calendar",
        filters={
            "notification_sent": 0,
            "start_date": ["between", [now, in_10_min]]
        },
        fields=["name", "subject", "start_date", "owner"]
    )

    for event in events:
        event_doc = frappe.get_doc("Custom Calendar", event.name)

        # Collect recipient emails
        recipient_emails = set()

        # Add participant emails
        for p in event_doc.participants:
            if p.email:
                recipient_emails.add(p.email)

        # Add owner email
        owner_email = frappe.db.get_value("User", event.owner, "email")
        if owner_email:
            recipient_emails.add(owner_email)

        # Send email
        if recipient_emails:
            frappe.sendmail(
                recipients=list(recipient_emails),
                subject=f"⏰ Reminder: {event.subject} at {event.start_date}",
                message=f"You have an upcoming calendar event: *{event.title}* starting at *{event.start_date}*.",
            )

        # Mark as notified
        frappe.db.set_value("Custom Calendar", event.name, "notification_sent", 1)
