
import frappe
from frappe import _

def get_context(context):
    d_name = frappe.form_dict.get('d_name')

    if not d_name:
        context.items = []
        context.message = _("No Issue Name provided.")
        return context

    issue_doc = frappe.get_doc('Issue', d_name) if frappe.db.exists('Issue', d_name) else None

    if not issue_doc:
        context.items = []
        context.message = _("No issue found for the provided name.")
        return context
    
    # Fetch comments related to the issue
    comments = frappe.get_all('Comment', filters={'reference_doctype': 'Issue', 'reference_name': d_name}, fields=['*'])
    
    context.d_name = issue_doc
    context.comments = comments  # Add comments to context

    file= frappe.get_all("File",filters={"attached_to_doctype":"Issue","attached_to_name":d_name},fields=['*'])
    context.file = file
    
    # Optionally, set a flag for displaying comments
    context.allow_comments = True if comments else False

    return context




