import frappe
from frappe import _

@frappe.whitelist()
def address_data(doctype,docname):
    # frappe.msgprint(docname)
    addresses = frappe.get_all('Address', filters={'link_doctype': doctype, 'link_name': docname}, fields=['name', 'address_title', 'address_line1', 'address_line2', 'city', 'state', 'country', 'pincode', 'phone', 'email_id'])
   
    # Fetch contact details
    contacts = frappe.get_all('Contact', filters={'link_doctype': doctype, 'link_name': docname}, fields=['name', 'first_name','salutation', 'last_name','middle_name', 'phone', 'email_id'])
    
    return {
        "addresses": addresses,
        "contacts": contacts
    }