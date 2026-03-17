# import frappe

# def get_context(context):
#     user_email = frappe.session.user

#     # Initialize default values
#     context.doc = []
#     context.message = "Please log in to view issues."

#     # If the user is not a guest
#     if user_email != "Guest":
#         # Administrator logic: Show all issues
#         if user_email == "Administrator":
#             context.doc = frappe.get_all(
#                 "Issue",
#                 fields=["*"],
#                 order_by="creation desc"
#                 # limit_page_length=20
#             )
#             context.message = "Showing all issues for Administrator."
#             return context

#         # Non-administrator users
#         contact_name = frappe.db.get_value("Contact", {"email_id": user_email}, "name")
#         if contact_name:
#             # Fetch linked Customer from the Dynamic Link table
#             customer = frappe.db.get_value(
#                 "Dynamic Link",
#                 {"parenttype": "Contact", "parent": contact_name, "link_doctype": "Customer"},
#                 "link_name"
#             )
#         else:
#             customer = None

#         # If a customer is linked, show their issues
#         if customer:
#             context.doc = frappe.get_all(
#                 "Issue",
#                 fields=["*"],
#                 filters={"customer": customer},
#                 order_by="creation desc"
#                 # limit_page_length=20
#             )
#             context.message = f"Showing issues for customer: {customer}."
#         else:
#             # If no customer is linked
#             context.message = "You are not authorized to view issues."
#     else:
#         # Guest user logic
#         context.message = "Please log in to view issues."

#     return context

import frappe

no_cache = 1

def get_context(context):
    user_email= frappe.session.user
    user_role=frappe.get_roles(user_email)

    if user_email=="Guest":
        context.doc=[]
        context.message="please log in user"
        return context
    
    # Support role gets access to all issues
    if "Support" in user_role or "Tech Support" in user_role or user_email =="Administrator":
        issues = frappe.db.sql("""
            SELECT i.name, i.status, i.subject, i.raised_by, i.priority, i.customer
            FROM `tabIssue` i
            ORDER BY i.creation DESC
        """, as_dict=True)

         # Count by status
        status_counts = frappe.db.sql("""
            SELECT status, COUNT(*) as count
            FROM `tabIssue`
            GROUP BY status
        """, as_dict=True)

        context.doc = issues
        context.message = f"Showing all issues for Support role: {user_email}."
        context.status_counts = {
            row["status"].lower().replace(" ", "_"): row["count"] for row in status_counts
        }
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
        issues = frappe.db.sql("""
            SELECT i.name,i.status,i.subject,i.raised_by,i.priority,i.customer
            FROM `tabIssue` i
            WHERE i.customer = %s
            ORDER BY i.creation DESC
        """, (customer,), as_dict=True)

        # Count by status for this customer's issues
        status_counts = frappe.db.sql("""
            SELECT status, COUNT(*) as count
            FROM `tabIssue`
            WHERE customer = %s
            GROUP BY status
        """, (customer,), as_dict=True)
        
        context.doc = issues
        context.message = f"user data fetched successfully: {user_email}."
        #context.status_counts = {row["status"]: row["count"] for row in status_counts}
        context.status_counts = {
            row["status"].lower().replace(" ", "_"): row["count"] for row in status_counts
        }

    else:
        context.doc = []
        context.message = "You are not authorized to view issues."
        context.status_counts = {}
    
    return context