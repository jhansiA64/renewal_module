import frappe
from frappe import _

def get_context(context):
	"""Pass context for page rendering"""
	context.no_cache = 1
	context.show_sidebar = False
	return context


@frappe.whitelist()
def get_crm_notes(parent):
    return frappe.get_all(
        "CRM Note",
        filters={"parent": parent, "parenttype": "Opportunity"},
        fields=["name", "note", "added_by", "added_on"],
        order_by="added_on desc",
    )