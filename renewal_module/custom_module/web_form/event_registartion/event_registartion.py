import frappe

def get_context(context):
	# do your magic here
	event_name= frappe.form_dict.get('event_name')

	if event_name:
		try:
			event_doc=frappe.get_doc('Event',event_name)
			context.title= event_doc.subject
			
		except frappe.DoesNotExistError:
			frappe.log_error(f"Event document with name {event_name} does not exist","Event page error")
			context.title = "Event Details"
		except Exception as e:
			frappe.log_error(f"Error retrieving event documet: {str(e)}","Event page error")
			context.title ="Event Details"	

	else:
		frappe.log_error("no event_name provided") 	
		context.title ="Event Details"
