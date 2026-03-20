# import frappe

# @frappe.whitelist()
# def global_search(txt, limit=5):
#     # frappe.msgprint("Hi")
#     results = []
#     doctypes = frappe.get_all("DocType", filters={
#         "istable": 0,
#         "issingle": 0,
#         "name": ["like", f"%{txt}%"]
#     }, fields=["name"],limit_page_length=limit)
#     for dt in doctypes:
#         results.append({"doctype": dt.name})
#         # try:
#         #     items = frappe.get_all(dt.name, filters=[["name", "like", f"%{txt}%"]], fields=["name"], limit_page_length=limit)
#         #     for item in items:
#         #         results.append({"doctype": dt.name})
#         # except Exception:
#         #     continue
#     return results

import frappe

@frappe.whitelist()
def apply_assignment_rule(doctype, name):
    """Apply assignment rule for a document manually."""
    doc = frappe.get_doc(doctype, name)

    # Try new assignment rule engine (safe across versions)
    try:
        from frappe.automation.doctype.assignment_rule.assignment_rule import apply as apply_rule
        apply_rule(doc)
        return {"status": "success"}
    except ImportError:
        frappe.throw("Assignment rule engine not found in this Frappe version")

    return {"status": "failed"}

import frappe

# @frappe.whitelist()
# def get_user_notifications(offset=0, limit=10):
#     user = frappe.session.user
#     notifications = frappe.get_all(
#         "Notification Log",
#         filters={"for_user": user},
#         fields=["name", "subject", "email_content", "creation", "read"],
#         order_by="creation desc",
#         limit_start=int(offset),
#         limit_page_length=int(limit)
#     )
#     return notifications



import frappe

# @frappe.whitelist()
# def mark_all_as_read():
#     user = frappe.session.user
#     frappe.db.sql("""
#         UPDATE `tabNotification Log`
#         SET `read` = 1
#         WHERE for_user = %s AND coalesce(`read`, 0) = 0
#     """, (frappe.session.user,))
#     frappe.db.commit()

#     return True

# @frappe.whitelist()
# def mark_notification_as_read(notification_name):
#     if notification_name:
#         frappe.db.set_value("Notification Log", notification_name, "read", 1)
#         frappe.db.commit()
#     return {"status": "success"}


# @frappe.whitelist()
# def get_ticket_counts():
#     """Return ticket counts by status from Issue doctype."""
#     statuses = ["Open", "Resolved", "Pending", "Closed","On Hold"]
#     counts = {}
#     total = frappe.db.count("Issue")
    
#     for status in statuses:
#         counts[status] = frappe.db.count("Issue", {"status": status})
        
#     counts["total"] = total
#     return counts

@frappe.whitelist()
def get_ticket_counts():
    statuses = ["Open", "Resolved", "Pending", "Closed", "On Hold"]
    counts = {}

    user = frappe.session.user
    roles = frappe.get_roles(user)

    tech_support_roles = [
        "L1 - Tech Support",
        "Tech Support",
        "L2 - Tech Support",
        "L3 - Tech Support"
    ]

    filters = {}
    is_tech_support = any(role in roles for role in tech_support_roles)

    # Apply filter only if tech support
    if is_tech_support:
        filters["working_agent"] = user

    total = frappe.db.count("Issue", filters)

    for status in statuses:
        status_filters = filters.copy()
        status_filters["status"] = status
        counts[status] = frappe.db.count("Issue", status_filters)

    counts["total"] = total
    counts["is_tech_support"] = is_tech_support
    counts["current_user"] = user

    return counts

import frappe
from frappe.utils import nowdate

@frappe.whitelist()
def overdue_tickets(offset=0, limit=5):
    from frappe.utils import now_datetime
    #today = nowdate()
    current_dt = now_datetime()

    # Base filters for overdue tickets
    filters = {
        "status": "Open",
        #"sla_resolution_by": ("<", today)
        "sla_resolution_by": ("<", current_dt)
    }

    user = frappe.session.user
    roles = frappe.get_roles(user)

    tech_support_roles = [
        "L1 - Tech Support",
        "Tech Support",
        "L2 - Tech Support",
        "L3 - Tech Support"
    ]

    # Check if user is tech support
    is_tech_support = any(role in roles for role in tech_support_roles)

    # Apply working_agent filter only for tech support users
    if is_tech_support:
        filters["working_agent"] = user

    # Fetch overdue issues
    issues = frappe.get_all(
        "Issue",
        filters=filters,
        fields=["*"],
        order_by="sla_resolution_by asc",
        start=offset,
        page_length=limit
    )

    # Count total overdue tickets with same conditions
    total_count = frappe.db.count("Issue", filters=filters) or 0
    

    return {
        "data": issues,
        "total_count": total_count,
        "is_tech_support": is_tech_support,
        "current_user": user
    }

import frappe
from frappe.utils import nowdate
from frappe.utils import today

@frappe.whitelist()
def get_todays_sla_issues():
    user = frappe.session.user
    today = nowdate()

    filters = [
        ["sla_resolution_by", ">=", f"{today} 00:00:00"],
        ["sla_resolution_by", "<=", f"{today} 23:59:59"],
        ["status", "!=", "Closed"],
        ["working_agent","=",user]
    ]

    # Admin can see all issues, others only their own
    if user != "Administrator":
        filters.append(["owner", "=", user])

    issues = frappe.get_all(
        "Issue",
        filters=filters,
        fields=["*"]
    )

    total_count = frappe.db.count("Issue", filters=filters) or 0
    

    return {"data":issues,"total_count":total_count}

import frappe
from frappe.utils import nowdate
@frappe.whitelist()
def todays_due_tasks(offset=0, limit=5):
    """
    Fetch tasks that are supposed to be completed today.
    Admin sees all tasks; other users see only their tasks.
    """
    today = nowdate()
    user = frappe.session.user
 
    filters = {
        "status": "Open",  # Only open tasks
        "date": today  ,     # Due today
        "allocated_to": user
    }
 
    # Restrict to user if not admin
    if frappe.session.user != "Administrator":
        filters["owner"] = frappe.session.user
 
    tasks = frappe.get_all(
        "ToDo",
        filters=filters,
        fields=["*"],
        order_by="creation asc",
        start=offset,
        page_length=limit
    )
    total_count = frappe.db.count("ToDo", filters=filters) or 0
    return {"data":tasks,"total_count":total_count}

@frappe.whitelist()
def today_calls(offset=0, limit=5):
    today = nowdate()
    user = frappe.session.user
 
    filters = {
        "start_date": today
    }
 
    # Show only user’s appointments unless admin
    # if frappe.session.user != "Administrator":
    #     filters["assigned_to"] = frappe.session.user
 
    call_list = frappe.get_all(
        "Call List", 
        filters=filters,
        fields=["*"],
        order_by="start_timing asc",
        start=offset,
        page_length=limit
    )

    total_count = frappe.db.count("Call List", filters=filters) or 0
    return {
        "data": call_list,
        "total_count": total_count
    }
 
 
# import frappe
# from frappe.utils import nowdate
# @frappe.whitelist()
# def today_appointments(offset=0, limit=5):
#     today = nowdate()
#     user = frappe.session.user
 
#     filters = {
#         "custom_start_date": today,
#         "status": ["!=", "Completed"] , # Optional: only show pending
#         "custom_participants": ["contains", user]

#     }
 
#     # Show only user’s appointments unless admin
#     # if frappe.session.user != "Administrator":
#     #     filters["assigned_to"] = frappe.session.user
 
#     appointments = frappe.get_all(
#         "Appointment", 
#         filters=filters,
#         fields=["*"],
#         order_by="custom_start_time asc",
#         start=offset,
#         page_length=limit
#     )

#     total_count = frappe.db.count("Appointment", filters=filters) or 0
#     return {
#         "data": appointments,
#         "total_count": total_count
#     }


import frappe
from frappe.utils import nowdate

@frappe.whitelist()
def today_appointments(offset=0, limit=5):
    today = nowdate()
    user = frappe.session.user

    # Ensure integers for SQL LIMIT
    offset = int(offset)
    limit = int(limit)

    limit_clause = f"LIMIT {offset}, {limit}"

    query = f"""
        SELECT a.*
        FROM `tabAppointment` a
        WHERE
            a.custom_start_date = %(today)s
            AND a.status != 'Completed'
            AND (
                a.owner = %(user)s
                OR a._assign LIKE %(assign_like)s
                OR EXISTS (
                    SELECT 1 FROM `tabMultiselect Users` mu
                    WHERE mu.parenttype = 'Appointment'
                    AND mu.parent = a.name
                    AND mu.parentfield = 'custom_participants'
                    AND mu.user = %(user)s
                )
                OR EXISTS (
                    SELECT 1 FROM `tabDocShare` ds
                    WHERE ds.user = %(user)s
                    AND ds.share_doctype = 'Appointment'
                    AND ds.share_name = a.name
                )
            )
        ORDER BY a.custom_start_time ASC
        {limit_clause}
    """

    data = frappe.db.sql(query, {
        "today": today,
        "user": user,
        "assign_like": f'%"{user}"%'
    }, as_dict=True)

    # Count total
    count_query = """
        SELECT COUNT(*)
        FROM `tabAppointment` a
        WHERE
            a.custom_start_date = %(today)s
            AND a.status != 'Completed'
            AND (
                a.owner = %(user)s
                OR a._assign LIKE %(assign_like)s
                OR EXISTS (
                    SELECT 1 FROM `tabMultiselect Users` mu
                    WHERE mu.parenttype = 'Appointment'
                    AND mu.parent = a.name
                    AND mu.parentfield = 'custom_participants'
                    AND mu.user = %(user)s
                )
                OR EXISTS (
                    SELECT 1 FROM `tabDocShare` ds
                    WHERE ds.user = %(user)s
                    AND ds.share_doctype = 'Appointment'
                    AND ds.share_name = a.name
                )
            )
    """

    total_count = frappe.db.sql(count_query, {
        "today": today,
        "user": user,
        "assign_like": f'%"{user}"%'
    })[0][0]

    return {
        "data": data,
        "total_count": total_count
    }



# @frappe.whitelist()
# def today_oems(start=0, limit=20):
#     try:
#         start = int(start)
#         limit = int(limit)

#         issues = frappe.get_all(
#             "Issue",
#             fields=["name", "subject", "customer", "status", "working_agent"],
#             order_by="creation desc",
#             start=start,
#             page_length=limit
#         )
#         total = frappe.db.count("Issue")

#         return {"data": issues, "total_count": total}

#     except Exception as e:
#         frappe.log_error(f"get_issues failed: {str(e)}", "Support Dashboard")
#         frappe.throw(f"Backend error: {str(e)}")


# import frappe

@frappe.whitelist()
def get_issues(start=0, limit=5):
    try:
        start = int(start)
        limit = int(limit)

        issues = frappe.get_all(
            "Issue",
            fields=["name", "subject", "customer", "status", "working_agent"],
            order_by="creation desc",
            start=start,
            page_length=limit
        )
        total = frappe.db.count("Issue")

        return {"data": issues, "total_count": total}

    except Exception as e:
        frappe.log_error(f"get_issues failed: {str(e)}", "Support Dashboard")
        frappe.throw(f"Backend error: {str(e)}")

