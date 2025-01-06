# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
#from frappe.model.document import Document


#class EventRegistration(Document):
#	pass


from frappe.model.document import Document
import frappe
import pytz

class EventRegistration(Document):
	pass


def email_on_approval(doc,method):
	frappe.msgprint("approval function trigger")
	frappe.msgprint(f"Current Workflow State: '{doc.workflow_state}'")

	# if doc.workflow_state == 'Approved':
	# 	frappe.msgprint("approved sales user")
	# 	send_approval_email(doc)


# def send_approval_email(doc):
# 	frappe.msgprint("sending email")
# 	event_doc = frappe.get_doc("Event", doc.event_name)
# 	event_link = event_doc.custom_event_link
# 	event_venue = event_doc.custom_venue
# 	event_subject = event_doc.subject
# 	starts_on = event_doc.starts_on
# 	ist_timezone = pytz.timezone('Asia/Kolkata')
# 	starts_on_ist = starts_on.astimezone(ist_timezone)
# 	formatted_date = starts_on_ist.strftime('%A, %B %d,%Y')
# 	formatted_date1 = starts_on_ist.strftime('%I:%M %p IST')
# 	recipients = [doc.email]
# 	subject = f"Event Approved: {event_subject}"

# 	if event_link is not None:
# 		message = f"""
# 			<div style="font-family:Arial,sans-serif;margin:0;padding:0;background-color:#f4f4f4;">
# 				<div style="width:100%;max-width:600px;margin:10px auto;background-color:#ffffff;padding:20px;border-radius:8px;box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
# 					<div style="background-color:#EA8300;padding:5px;color:#ffffff;justify-content:space-between;">
# 						<h2 style="text-align:center">64Network Security Pvt Ltd </h2>
# 						<h2 style="text-align:center">{event_subject}</h2>
# 					</div>

# 					<div style="margin:20px 0;">
# 						<h3 style="color:#333333;">Thank you for registering! </h3>
# 						<p style="color:#666666;line-height:1.5;">Save this email for details on the webcast </p>
# 						<p style="color:#666666;line-height:1.5;">creating a dynamic inbox with Embedded video in Email </p> 	
# 						<p style="color:#666666;line-height:1.5;"><strong>Live Webcast Date:</strong>{formatted_date} </p>
# 						<p style="color:#666666;line-height:1.5;"><strong>Live Webcast Time:</strong>{formatted_date1}</p>
# 						<p style="color:#666666;line-height:1.5;">use the link below to enter the webcast up to 15 minutes before the start </p>
# 						<p style="color:#666666;line-height:1.5;"><strong>Webcast Link:</strong><a href="{doc.link}" style="color:#1a73e8;text-decoration:none;">{event_link}</a></p>
# 						<p style="color:#666666;line-height:1.5;"><strong>System Test:</strong> Test your computer to make sure you meet the minimum technical requirements. Test your system</p>
# 						<br>
# 						<p style="color:#666666;line-height:1.5;">Thank you and enjoy the Webcast! </p>
# 					</div>

# 					<div style="padding:10px 20px; background-color:#f4f4f4;border-bottom-left-radius:8px;border-bottom-right-radius:8px;text-align:center;color:#888888;font-size:12px;">
# 						<p style="margin:0;">&copy;2024 64 Network Pvt Ltd. All rights reserved.</p>
# 					</div>
# 				</div>
# 			</div>
# 		"""
# 	elif event_venue is not None:
# 		message = f"""
# 			<div style="font-family:Arial,sans-serif;margin:0;padding:0;background-color:#f4f4f4;">
# 				<div style="width:100%;max-width:600px;margin:10px auto;background-color:#ffffff;padding:20px;border-radius:8px;box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
# 					<div style="background-color:#EA8300;padding:5px;color:#ffffff;justify-content:space-between;">
# 						<h2 style="text-align:center">64Network Security Pvt Ltd </h2>
# 						<h2 style="text-align:center">{event_subject}</h2>
# 					</div>

# 					<div style="margin:20px 0;">
# 						<h3 style="color:#333333;">Thank you for registering! </h3>
# 						<p style="color:#666666;line-height:1.5;">Please save this email for important event details: </p> 	
# 						<p style="color:#666666;line-height:1.5;"><strong>Event Date:</strong>{formatted_date} </p>
# 						<p style="color:#666666;line-height:1.5;"><strong>Event Time:</strong>{formatted_date1}</p>
# 						<div style="display:flex">
# 							<div style="font-weight: bold; margin-right: 5px;color:#666666;">Venue:</div>
# 							<div style="max-width:300px;color:#666666;">{event_venue}</div>
# 						</div>
# 					</div>
					
# 					<div>
# 						<p style="color:#666666;line-height:1.5;">Thank you, and we hope you enjoy the event! </p>
# 					</div>

# 					<div style="padding:10px 20px; background-color:#f4f4f4;border-bottom-left-radius:8px;border-bottom-right-radius:8px;text-align:center;color:#888888;font-size:12px;">
# 						<p style="margin:0;">&copy;2024 64 Network Pvt Ltd. All rights reserved.</p>
# 					</div>
# 				</div>
# 			</div>
# 		"""
# 	else : 
# 		message = f"Thank you are registration"	

# 	frappe.sendmail(
# 		recipients=recipients,
# 		subject=subject,
# 		message=message
# 	)


import frappe
from frappe.utils import get_time,get_datetime

def set_event_times(doc,method):
	 
	if doc.event :
		event = frappe.get_value("Event",doc.event,["starts_on","ends_on"], as_dict = True)

		if event:
			if event.starts_on:
				doc.event_start_time = get_time(event.starts_on)
				doc.event_start_date = get_datetime(event.starts_on)

			if event.ends_on:
				doc.event_end_time = get_time(event.ends_on)	
				doc.event_end_date = get_datetime(event.ends_on) 