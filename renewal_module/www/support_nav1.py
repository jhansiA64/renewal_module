import frappe


def get_context(context):
    raw_roles = frappe.get_roles(frappe.session.user) if frappe.session.user else []
    roles = {str(role or "").strip().lower() for role in raw_roles}
    support_roles = {"l1 - tech support", "l2 - tech support", "l3 - tech support", "tech support"}
    sales_roles = {"sales user", "sales manager"}

    # Highest priority: if admin/system manager exists, ignore all other roles.
    if "administrator" in roles or "system manager" in roles:
        context.support_home_href = "/app"
        return

    if any(role in support_roles for role in roles):
        context.support_home_href = "/app/support-dashboard-te-1"
    elif any(role in sales_roles for role in roles):
        context.support_home_href = "/app/home-crm"
    else:
        context.support_home_href = "/app"
