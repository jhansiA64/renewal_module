
import frappe
from frappe import _
from frappe.model.document import Document

#issue plan summary
# @frappe.whitelist()
# def get_issue_dashboard_data(customer=None):
#     data = [
#         {"plan": "Gold", "tickets": 6, "used": 2, "available": 4}
#     ]
#     html = frappe.render_template("renewal_module/www/issue_list_dashboard.html", {
#         "data": data
#     })
#     return {"html": html}

@frappe.whitelist()
def get_issue_dashboard_data(customer=None, item=None, issue_name=None):
    if not customer or not item or not issue_name:
        return {"html": ""}

    active_renewal = frappe.get_value("Active Renewals", {
        "parent": issue_name,
        "item": item
    }, ["renewal_id"], as_dict=True)

    if not active_renewal or not active_renewal.renewal_id:
        return {"html": ""}

    renewal = frappe.db.get_value("Renewal List", active_renewal.renewal_id,
        ["name", "sla_type", "tickets"], as_dict=True)

    if not renewal or not renewal.sla_type:
        return {"html": ""}

    match = frappe.db.exists("Renewal Item", {
        "parent": renewal["name"],
        "item_name": item
    })

    if not match:
        return {"html": ""}

    used_tickets = frappe.db.count("Active Renewals", {
        "renewal_id": renewal["name"],
        "item": item
    })

    total_tickets = int(renewal.get("tickets") or 0)
    available_tickets = total_tickets - used_tickets

    data = [{
        "plan": renewal["sla_type"],
        "tickets": total_tickets,
        "used": used_tickets,
        "available": available_tickets
    }]

    html = frappe.render_template("renewal_module/www/issue_list_dashboard.html", {
        "data": data
    })

    return {"html": html}


@frappe.whitelist()
def check_ticket_availability(customer=None, item=None, issue_name=None):
    try:
        if not customer or not item or not issue_name:
            return {"status": "error", "message": "Missing customer, item, or issue name."}

        active_renewal = frappe.get_value("Active Renewals", {
            # "parent": issue_name,
            "item": item
        }, ["renewal_id"], as_dict=True)

        if not active_renewal or not active_renewal.renewal_id:
            return {"status": "error", "message": "No SLA renewal found for this item."}

        renewal = frappe.db.get_value("Renewal List", active_renewal.renewal_id,
            ["name", "sla_type", "tickets"], as_dict=True)

        if not renewal or not renewal.sla_type:
            return {"status": "error", "message": "No SLA type configured."}

        match = frappe.db.exists("Renewal Item", {
            "parent": renewal.name,
            "item_name": item
        })

        if not match:
            return {"status": "error", "message": "Item not part of SLA plan."}

        used_tickets = frappe.db.count("Active Renewals", {
            "renewal_id": renewal.name,
            "item": item
        })

        total_tickets = int(renewal.get("tickets") or 0)
        available_tickets = total_tickets - used_tickets

        if available_tickets <= 0:
            return {"status": "fail", "message": "Your tickets are complete. Please buy more."}

        return {"status": "ok", "message": "Tickets available."}

    except Exception:
        frappe.log_error(frappe.get_traceback(), "Ticket Availability Check Error")
        return {"status": "error", "message": "Server error while checking SLA tickets."}













import frappe

def custom_homepage(bootinfo):
    roles = frappe.get_roles()
    # Change role name to your technical team role
    if "Technical Support" in roles:
        bootinfo["home_page"] = "/app/support-dashboard"


