# import frappe

# def get_context(context):
#     user_email = frappe.session.user

#     # Administrator logic
#     if user_email == "Administrator":
#         context.doc = frappe.get_all(
#             "Sales Order",
#             fields=["*"],
#             order_by="creation desc"
#             # limit_page_length=20
#         )
#         for order in context.doc:
#             order.item_name = frappe.get_value(
#                 "Sales Order Item", 
#                 {"parent": order.name}, 
#                 "item_name"
#             )
#             order.rounded_total = frappe.utils.fmt_money(order.rounded_total,currency="INR")
#         context.message = "Showing all renewal lists as Administrator."
#         return context

#     # Guest logic
#     if user_email == "Guest":
#         context.doc = []
#         context.message = "Please log in to view renewal lists."
#         return context

#     # Logic for logged-in users
#     contact_name = frappe.db.get_value("Contact", {"email_id": user_email}, "name")
#     if contact_name:
#         customer = frappe.db.get_value(
#             "Dynamic Link",
#             {"parenttype": "Contact", "parent": contact_name, "link_doctype": "Customer"},
#             "link_name"
#         )
#     else:
#         customer = None

#     if customer:
#         context.doc = frappe.get_all(
#             "Sales Order",
#             filters={"customer_name": customer},
#             fields=["*"],
#             order_by="creation desc"
#             # limit_page_length=20
#         )
#         for order in context.doc:
#             order.item_name = frappe.get_value(
#                 "Sales Order Item", 
#                 {"parent": order.name}, 
#                 "item_name"
#             ) 
#             order.rounded_total = frappe.utils.fmt_money(order.rounded_total,currency="INR")  
#         context.message = f"Showing renewal lists for customer: {customer}."
#     else:
#         context.doc = []
#         context.message = "You are not authorized to view renewal lists."

#     return context

import frappe

no_cache = 1

def get_context(context):
    context.no_cache=1
    user_email = frappe.session.user
    frappe.logger().info(f"User Email: {user_email}")
    context.message1 = f"user email {user_email}"
    
    user_role = frappe.get_roles(user_email)
    
    # Handle Guest User
    if user_email == "Guest":
        context.doc = []
        context.message = "Please log in to view renewal lists."
        return context

    # Check if user is Administrator and has Customer role
    if user_email == "Administrator" and "Customer" in user_role:
        sales_orders = frappe.db.sql("""
            SELECT so.name, so.customer_name, so.transaction_date, so.rounded_total, so.status, 
                   soi.item_name
            FROM `tabSales Order` so
            LEFT JOIN `tabSales Order Item` soi ON soi.parent = so.name
            ORDER BY so.creation DESC
        """,as_dict=True)
        
        for order in sales_orders:
            order["rounded_total"] = frappe.utils.fmt_money(order["rounded_total"], currency="INR")

        context.doc = sales_orders
        context.message = f"Showing all sales orders of Administrator: {user_email}."
        return context

    # Get Customer Name from Contact
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
        sales_orders = frappe.db.sql("""
            SELECT so.name, so.customer_name, so.transaction_date, so.rounded_total, so.status, 
                   soi.item_name
            FROM `tabSales Order` so
            LEFT JOIN `tabSales Order Item` soi ON soi.parent = so.name
            WHERE so.customer_name = %s
            ORDER BY so.creation DESC
        """, (customer,), as_dict=True)
        
        for order in sales_orders:
            order["rounded_total"] = frappe.utils.fmt_money(order["rounded_total"], currency="INR")

        context.doc = sales_orders
        context.message = f"user data fetched successfully: {user_email}."
    else:
        context.doc = []
        context.message = "You are not authorized to view sales order lists."
    
    return context