import frappe


def get_context(context):
    roles = frappe.get_roles(frappe.session.user) if frappe.session.user else []
    support_roles = {"L1 - Tech Support", "L2 - Tech Support","L3 - Tech Support", "Tech Support"}
    if "Administrator" in roles:
        context.support_home_href = "/app"
        return

    context.support_home_href = (
        "/app/support-dashboard-te-1"
        if any(role in support_roles for role in roles)
        else "/app"
    )
