# import frappe

# def get_context(context):
#     user_email = frappe.session.user

#     if user_email == "Administrator":
#         context.doc = frappe.get_all(
#             "Renewal List",
#             fields=["*"],
#             order_by="creation desc"
#             # limit_page_length=20
#         )
#         for renewal in context.doc:
#             renewal_item = frappe.get_value("Renewal Item", {"parent": renewal.name}, "item_name")
#             renewal.item_name = renewal_item
#             renewal.total_amount = frappe.utils.fmt_money(renewal.total_amount,currency="INR")      
#         context.message = "Showing all renewal lists as Administrator."
#     elif user_email != "Guest":
#         contact_name = frappe.db.get_value("Contact", {"email_id": user_email}, "name")

#         customer = None
#         if contact_name:
#             customer_link = frappe.db.sql(
#                 """
#                 SELECT link_name
#                 FROM `tabDynamic Link`
#                 WHERE parenttype = 'Contact' 
#                 AND parent = %s 
#                 AND link_doctype = 'Customer'
#                 """,
#                 contact_name,
#                 as_dict=True,
#             )
#             if customer_link:
#                 customer = customer_link[0]["link_name"]

#         if customer:
#             context.doc = frappe.get_all(
#                 "Renewal List",
#                 filters={"customer_name": customer},
#                 fields=["*"],
#                 order_by="creation desc"
#                 # limit_page_length=20
#             )
#             for renewal in context.doc:
#                 renewal_item = frappe.get_value("Renewal Item", {"parent": renewal.name}, "item_name")
#                 renewal.item_name = renewal_item
#                 renewal.total_amount = frappe.utils.fmt_money(renewal.total_amount,currency="INR")
#         else:
#             context.doc = []
#             context.message = "You are not authorized to view renewal lists."
#     else:
#         context.doc = []
#         context.message = "Please log in to view renewal lists."

#     return context

import frappe
no_cache =1

def get_context(context):
    user_email=frappe.session.user
    user_role=frappe.get_roles(user_email)

    if user_email == "Guest":
        context.doc=[]
        context.message="please log in to view renewal list"
        return context
    
    if user_email == "Administrator" and "Customer" in user_role:
        renewal_lists = frappe.db.sql("""
            SELECT rl.name,rl.status,rl.start_date,rl.end_date,rl.total_amount,rl.customer_name,
                rli.item_name
            FROM `tabRenewal List` rl
            LEFT JOIN `tabRenewal Item` rli ON rli.parent = rl.name
            ORDER BY rl.creation DESC
        """, as_dict=True)

        for order in renewal_lists:
            order["total_amount"] = frappe.utils.fmt_money(order["total_amount"], currency="INR")

        context.doc = renewal_lists
        context.message = f"Showing all renewal lists as Administrator: {user_email}."
        return context

    contact_name = frappe.db.get_value("Contact", {"email_id": user_email}, "name")
    
    if contact_name:
        customer = frappe.db.get_value(
            "Dynamic Link",
            {"parenttype": "Contact", "parent": contact_name, "link_doctype": "Customer"},
            "link_name"
        )
    else:
        customer = None

    if customer:
        frappe.logger().info("Fetching Sales Orders for customer")
        renewal_lists = frappe.db.sql("""
            SELECT rl.name,rl.status,rl.start_date,rl.end_date,rl.total_amount,rl.customer_name, 
                   rli.item_name
            FROM `tabRenewal List` rl
            LEFT JOIN `tabRenewal Item` rli ON rli.parent = rl.name
            WHERE rl.customer_name = %s
            ORDER BY rl.creation DESC
        """, (customer,), as_dict=True)
        
        for order in renewal_lists:
            order["total_amount"] = frappe.utils.fmt_money(order["total_amount"], currency="INR")

        context.doc = renewal_lists
        context.message = f"user data fetched successfully: {user_email}."
    else:
        context.doc = []
        context.message = "You are not authorized to view renewal lists."
    
    return context