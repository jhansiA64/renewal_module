import frappe
from frappe import _

def get_context(context):
    # Fetch the d_name parameter from the request
    d_name = frappe.form_dict.get('d_name')

    if not d_name:
        context.items = []
        context.message = _("No Sales Invoice Name provided.")
        return context

    # Fetch the parent record from the relevant Doctype (e.g., Renewal)
    invoice_doc = frappe.get_doc('Sales Invoice', d_name) if frappe.db.exists('Sales Invoice', d_name) else None

    if not invoice_doc:
        context.items = []
        context.message = _("No order found for the provided name.")
        return context

    # Fetch Renewal Items filtered by parent = d_name
    invoice_items = frappe.get_all(
        'Sales Invoice Item',
        filters={'parent': d_name},
        fields=['*']
    )
    for item in invoice_items:
        if "rate" in item:
            item["rate"] = frappe.utils.fmt_money(item["rate"], currency="INR")
        if "amount" in item:
            item["amount"] = frappe.utils.fmt_money(item["amount"], currency="INR")  

    invoice_doc.rounded_total = frappe.utils.fmt_money(invoice_doc.rounded_total,currency="INR") 
    # Add data to the context for rendering in the template
    context.items = invoice_items
    context.d_name = invoice_doc  # Pass the entire document to the template

