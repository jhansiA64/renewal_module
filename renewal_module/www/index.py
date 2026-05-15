import frappe
from frappe.apps import get_default_path
no_cache = 1

def get_context(context):
    user = frappe.session.user
    if not user or user == "Guest":
        return

    roles = frappe.get_roles(user)

    # Customer portal users → their portal home page
    if "Customer" in roles and "System Manager" not in roles and user != "Administrator":
        frappe.local.flags.redirect_location = "/me"
        raise frappe.Redirect

    # Everyone else (System Manager, Administrator, staff) → default Desk app route
    frappe.local.flags.redirect_location = get_default_path() or "/desk"
    raise frappe.Redirect