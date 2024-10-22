# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe
import pytz
import datetime
import textwrap

class EventRegistration(Document):
	pass



def email_on_approval(doc, method):
    frappe.msgprint("approval function trigger")
    frappe.msgprint(f"current workflow state:'{doc.workflow_state}'")
	
    if doc.workflow_state == "Approved by sales user":
        send_approval_email(doc)

def send_approval_email(doc):
    frappe.msgprint("email sending start")
    event_doc = frappe.get_doc("Event", doc.event_name)
    event_subject = event_doc.subject
    
    # Assuming event_doc.starts_on is already a datetime object
    starts_on = event_doc.starts_on

    # Convert to your desired timezone, if necessary
    # Assuming the date is in UTC and you want to convert to IST (UTC+5:30)
    #ist_timezone = pytz.timezone('Asia/Kolkata')
    #starts_on_ist = starts_on.astimezone(ist_timezone)

    # Format the date
    #formatted_date = starts_on_ist.strftime('%A, %B %d, %Y %I:%M %p IST')
    formatted_date= starts_on.strftime('%A, %B %d, %Y')
    recipients = [doc.email]  # Add the recipient email addresses here
    subject = f"Event Approved: {event_subject}"

    ics_content= create_ics_event(event_subject,starts_on)

    frappe.msgprint(f"ICS content:\n{ics_content}")

    ics_file_name = f"{event_subject.replace(' ','_')}.ics"
    ics_file_path = f"/tmp/{ics_file_name}"

    with open(ics_file_path,"w") as ics_file:
        ics_file.write(ics_content)


    message = f"""
        <div style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
            <div style="max-width: 600px; margin: 10px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background-color: #007bff; color: #ffffff; padding: 10px 20px; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                    <h1 style="margin: 0; font-size: 24px;">Registration Confirmation</h1>
                </div>
                <h2 style="text-align: center; font-size: 24px; color: orangered;">{event_subject}</h2>
                <p style="text-align: center; font-size: 14px; color: darkorchid;">{formatted_date}</p>
                <p style="text-align: center;">
                    <a href="{doc.link}" style="text-decoration: none;">
                        <button style="padding: 10px 20px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            Click here to view the event
                        </button>
                    </a>
                </p>
                <div style="padding: 20px; color: #333333;">
                    <p style="margin: 0 0 10px;">Hi there,</p>
                    <p style="margin: 0 0 10px;">You have successfully registered for <b>{event_subject}</b> organized by <b>64 Network Pvt Ltd.</b></p>
                    <p style="margin: 0 0 10px;">1. To view this webinar, use your custom link:</p>
                    <p style="margin: 0 0 10px;"><a href="{doc.link}">{doc.link}</a></p>
                </div>
                <div style="padding: 10px 20px; background-color: #f4f4f4; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; text-align: center; color: #888888; font-size: 12px;">
                    <p style="margin: 0;">&copy; 2024 64 Network Pvt Ltd. All rights reserved.</p>
                </div>
            </div>
        </div>
    """



    frappe.sendmail(
        recipients=recipients,
        subject=subject,
        message=message,
        attachment=[{
            'fname':ics_file_name,
            'fcontent':ics_content,
        }]
    )
    
# def create_ics_event(subject,start):
#     """
#     create Ics File content for calender event
#     """
#     start_utc = start.astimezone(pytz.UTC)
#     end_utc = end.astimezone(pytz.UTC)

#     ics_template = f""" BEGIN:VCALENDAR
#     VERSION:2.0
#     PRODID:-//64network security pvt ltd//Event Calendar //EN
#     CALSCALE:GREGORIAN
#     METHOD:PUBLISH  
#     SUMMARY:{subject}
#     DESCRIPTION:join us for the event {SUBJECT}.
#     DSTART:{start_utc.strftime('%Y%m%dT%H%M%SZ')}
#     END:VEVENT
#     END:VCALENDAR
#     """
#     return textwrap.dedent(ics_template)


