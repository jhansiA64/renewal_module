# import frappe
# from frappe import _

# def get_context(context):
#     # Fetch the d_name parameter from the request
#     d_name = frappe.form_dict.get('d_name')

#     if not d_name:
#         context.items = []
#         context.message = _("No Sales Order Name provided.")
#         return context

#     # Fetch the parent record from the relevant Doctype (e.g., Renewal)
#     order_doc = frappe.get_doc('Sales Order', d_name) if frappe.db.exists('Sales Order', d_name) else None

#     if not order_doc:
#         context.items = []
#         context.message = _("No order found for the provided name.")
#         return context

#     # Fetch Renewal Items filtered by parent = d_name
#     order_items = frappe.get_all(
#         'Sales Order Item',
#         filters={'parent': d_name},
#         fields=['*']
#     )

#     for item in order_items:
#         if "rate" in item:
#             item["rate"] = frappe.utils.fmt_money(item["rate"], currency="INR")
#         if "amount" in item:
#             item["amount"] = frappe.utils.fmt_money(item["amount"], currency="INR")  
#     order_doc.rounded_total = frappe.utils.fmt_money(order_doc.rounded_total,currency="INR") 

#     # Add data to the context for rendering in the template
#     context.items = order_items
#     context.d_name = order_doc  # Pass the entire document to the template

import frappe
from frappe import _
no_cache=1
def get_context(context):
    # Fetch the d_name parameter from the request
    d_name = frappe.form_dict.get('d_name')

    if not d_name:
        context.items = []
        context.message = _("No Sales Order Name provided.")
        return context

    # Fetch the parent record from the relevant Doctype (e.g., sales order)
    order_doc = frappe.get_doc('Sales Order', d_name) if frappe.db.exists('Sales Order', d_name) else None

    if not order_doc:
        context.items = []
        context.message = _("No order found for the provided name.")
        return context

    # Fetch sales order Items filtered by parent = d_name
    order_items = frappe.get_all(
        'Sales Order Item',
        filters={'parent': d_name},
        fields=['item_name','item_code','qty','amount','rate']
    )
    for item in order_items:
        if "rate" in item:
            item["rate"] = frappe.utils.fmt_money(item["rate"], currency="INR")
        if "amount" in item:
            item["amount"] = frappe.utils.fmt_money(item["amount"], currency="INR")  
    order_doc.rounded_total = frappe.utils.fmt_money(order_doc.rounded_total,currency="INR")         
    # Add data to the context for rendering in the template
    context.items = order_items
    context.d_name = order_doc  # Pass the entire document to the template