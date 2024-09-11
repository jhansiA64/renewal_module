import frappe
from frappe.website.doctype.web_form.web_form import WebForm

def get_context(context):
	# do your magic here
	# context = super().get_context(context)
        
	# # Add breadcrumb data
	# context.breadcrumbs = [
	# 	{"label": "Home", "url": "/"},
	# 	{"label": "Forms", "url": "/forms"},
	# 	{"label": context.title}
	# ]
	
	# return context
	pass
	


# from __future__ import unicode_literals
# import frappe

# def get_context(context):
#     # Fetch the document name from the query parameters
#     event_name = frappe.form_dict.get('event_name')
    
#     if event_name:
#         try:
#             # Fetch the Event document
#             event_doc = frappe.get_doc('Event', event_name)
#             # Set the title based on the subject field of the Event document
#             context.title = event_doc.subject
#         except frappe.DoesNotExistError:
#             # Log if the document does not exist
#             frappe.log_error(f"Event document with name {event_name} does not exist", "Event Page Error")
#             context.title = "Event Details"
#         except Exception as e:
#             # Log any other exceptions
#             frappe.log_error(f"Error retrieving Event document: {str(e)}", "Event Page Error")
#             context.title = "Event Details"
#     else:
#         # Log if no document name is provided in the query parameters
#         frappe.log_error("No event_name provided in query parameters", "Event Page Error")
#         context.title = "Event Details"
