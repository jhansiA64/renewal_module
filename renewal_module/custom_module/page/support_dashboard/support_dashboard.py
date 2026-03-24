import frappe
@frappe.whitelist()
def get_ticket_counts():

    statuses = [
        "Open", "Created", "Resolved", "Pending",
        "Closed", "On Hold", "OEM Escalated",
        "Client Input Pending", "Overdue"
    ]

    user = frappe.session.user
    roles = frappe.get_roles(user)

    # Admin / System Manager → see everything
    if "System Manager" in roles or user == "Administrator":
        counts = {}
        for status in statuses:
            counts[status] = frappe.db.count("Issue", {"status": status})
        counts["total"] = frappe.db.count("Issue")
        counts["is_tech_support"] = False
        counts["current_user"] = user
        return counts


    tech_support_roles = [
        "L1 - Tech Support",
        "Tech Support",
        "L2 - Tech Support",
        "L3 - Tech Support"
    ]

    is_tech_support = any(role in roles for role in tech_support_roles)

    counts = {}

    # -------------------------
    # TOTAL
    # -------------------------
    if is_tech_support:
        total = frappe.db.count(
            "Issue",
            filters={"working_agent": user}
        )
    else:
        total = frappe.db.count("Issue")

    # -------------------------
    # STATUS COUNTS
    # -------------------------
    for status in statuses:

        # 🟡 CREATED → Unassigned tickets
        if status == "Created" and is_tech_support:
            counts[status] = frappe.db.count(
                "Issue",
                filters={
                    "status": "Created",
                    "working_agent": ["is", "not set"]
                }
            )

        # 🟢 ALL OTHER → Assigned to tech
        elif is_tech_support:
            counts[status] = frappe.db.count(
                "Issue",
                filters={
                    "status": status,
                    "working_agent": user
                }
            )

        # 🔵 NON-TECH USERS
        else:
            counts[status] = frappe.db.count(
                "Issue",
                filters={"status": status}
            )

    counts["total"] = total
    counts["is_tech_support"] = is_tech_support
    counts["current_user"] = user

    return counts


from frappe.utils import nowdate
from frappe.utils import today

@frappe.whitelist()
def get_todays_sla_issues():
    user = frappe.session.user
    roles = frappe.get_roles(user)
    today = nowdate()
    if "System Manager" in roles or user == "Administrator":
        filters = [
            ["resolution_by", ">=", f"{today} 00:00:00"],
            ["resolution_by", "<=", f"{today} 23:59:59"],
            ["status", "!=", "Closed"]
        ]
        issues = frappe.get_all(
            "Issue",
            filters=filters,
            fields=["*"]
        )
        total_count = frappe.db.count("Issue", filters=filters) or 0
    else:
        filters = [
            ["resolution_by", ">=", f"{today} 00:00:00"],
            ["resolution_by", "<=", f"{today} 23:59:59"],
            ["status", "!=", "Closed"],
            ["working_agent", "=", user]
        ]
        issues = frappe.get_all(
            "Issue",
            filters=filters,
            fields=["*"]
        )
        total_count = frappe.db.count("Issue", filters=filters) or 0

    return {"data":issues,"total_count":total_count}

@frappe.whitelist()
def todays_due_tasks(offset=0, limit=5):
    from frappe.utils import nowdate

    today = nowdate()
    user = frappe.session.user

    # Base filters: Open tasks due today
    filters = {
        "status": "Open",
        # "exp_end_date": today
    }

    # Fetch all matching tasks
    tasks = frappe.get_all(
        "Task",
        filters=filters,
        fields=["name", "subject", "status","exp_start_date", "exp_end_date","priority","description"],
        order_by="creation asc",
        page_length=0
    )
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(tasks)))

    final_tasks = []

    for t in tasks:
        doc = frappe.get_doc("Task", t.name)

        # Admin sees everything
        if user == "Administrator":
            final_tasks.append(doc)
            continue

        # Handle missing field safely
        users = getattr(doc, "custom_users", None)

        if not users:
            continue
        assigned = []

        # Case 1 — list of strings
        if isinstance(users, list) and users and isinstance(users[0], str):
            assigned = [u.lower() for u in users]

        # Case 2 — child table list of objects
        elif isinstance(users, list) and hasattr(users[0], "user"):
            assigned = [u.user.lower() for u in users]

        if user in assigned:
            final_tasks.append(doc)

    total_count = len(final_tasks)

    final_tasks = final_tasks[int(offset): int(offset)+int(limit)] 
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(final_tasks)))
    # Convert docs to response dict
    result = [
        {
            "name": d.name,
            "subject": d.subject,
            "status": d.status,
            "start_date": d.exp_start_date,
            "due_date": d.exp_end_date,
            "priority": d.priority,
            "description": d.description,
            "custom_users": d.custom_users
        }
        for d in final_tasks
    ]

    return {"data": result, "total_count": total_count}


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
        LEFT JOIN `tabMultiselect Users` mu
            ON mu.parent = a.name
            AND mu.parentfield = 'custom_participants'
        WHERE
            a.custom_start_date = %(today)s
            AND a.status != 'Completed'
            AND mu.user = %(user)s
        ORDER BY a.custom_start_time ASC
        {limit_clause}
    """

    data = frappe.db.sql(query, {
        "today": today,
        "user": user,
    }, as_dict=True)

    # Count total
    count_query = """
        SELECT COUNT(*)
        FROM `tabAppointment` a
        LEFT JOIN `tabMultiselect Users` mu
            ON mu.parent = a.name
            AND mu.parentfield = 'custom_participants'
        WHERE
            a.custom_start_date = %(today)s
            AND a.status != 'Completed'
            AND mu.user = %(user)s
    """

    total_count = frappe.db.sql(count_query, {
        "today": today,
        "user": user
    })[0][0]

    return {
        "data": data,
        "total_count": total_count
    }


@frappe.whitelist()
def overdue_tickets(offset=0, limit=5):
    from frappe.utils import now_datetime
    today = nowdate()
    # use full datetime, not date
    current_dt = now_datetime()
    user = frappe.session.user
    roles= frappe.get_roles(user)

    # Admin / System Manager → see all overdue tickets
    if "System Manager" in roles or user == "Administrator":
        filters = {
            "status": "Open",
            "resolution_by": ("<", current_dt)
        }

        issues = frappe.get_all(
            "Issue",
            filters=filters,
            fields=["*"],
            order_by="resolution_by asc",
            start=offset,
            page_length=limit
        )

        total_count = frappe.db.count("Issue", filters=filters) or 0
    else:
        # For regular users, match working_agent OR owner OR _assign
        offset = int(offset)
        limit = int(limit)
        limit_clause = f"LIMIT {offset}, {limit}"

        query = f"""
            SELECT *
            FROM `tabIssue`
            WHERE
                status = 'Open'
                AND resolution_by < %(current_dt)s
                AND (
                    working_agent = %(user)s
                )
            ORDER BY resolution_by ASC
            {limit_clause}
        """

        issues = frappe.db.sql(query, {
            "current_dt": current_dt,
            "user": user
        }, as_dict=True)

        count_query = """
            SELECT COUNT(*)
            FROM `tabIssue`
            WHERE
                status = 'Open'
                AND resolution_by < %(current_dt)s
                AND (
                    working_agent = %(user)s
                )
        """

        total_count = frappe.db.sql(count_query, {
            "current_dt": current_dt,
            "user": user
        })[0][0] or 0
    

    return {
        "data": issues,
        "total_count": total_count
    }


@frappe.whitelist()
def get_todays_oem_issues(offset=0, limit=5):
    
    return {"data": [], "total_count": 0}
