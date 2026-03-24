
### list view methods
from frappe import _
from datetime import datetime
from frappe.utils import flt, now_datetime, getdate, get_datetime
from renewal_module.test_timespan import add_to_date, get_timespan_date_range
from renewal_module.permissions import issue_permission_query
import frappe
import json


@frappe.whitelist()
def get_list_data(start=0, page_length=20, status=None, priority=None, working_agent=None, search=None, filters=None):
    import frappe, json
    start = int(start or 0)
    page_length = int(page_length or 20)

    conditions = ["1=1"]
    values = {}

    # Apply permission-based filter
    current_user = frappe.session.user
    permission_filter = issue_permission_query(current_user)
    
    # Add permission filter (now returns just a string)
    if permission_filter and permission_filter != "1=1":
        conditions.append(permission_filter)
    elif permission_filter == "1=0":
        conditions.append(permission_filter)

    parent_doctype = "Issue"

    # --- Helper: Detect child table for a field ---
    def get_child_table_for_field(parent_doctype, fieldname):
        meta = frappe.get_meta(parent_doctype)
        for df in meta.fields:
            if df.fieldtype == "Table":
                child_meta = frappe.get_meta(df.options)
                if fieldname in [f.fieldname for f in child_meta.fields]:
                    return df.options  # child doctype name
        return None

    # --- Simple filters ---
    if status:
        status_list = status
        if isinstance(status_list, str):
            try:
                parsed = json.loads(status_list)
                if isinstance(parsed, (list, tuple)):
                    status_list = parsed
                else:
                    status_list = [status_list]
            except Exception:
                status_list = [s.strip() for s in status_list.split(",") if s.strip()]

        if isinstance(status_list, (list, tuple)):
            status_list = [s for s in status_list if s]

        if isinstance(status_list, (list, tuple)) and len(status_list) > 1:
            placeholders = []
            for idx, st in enumerate(status_list):
                key = f"status_{idx}"
                placeholders.append(f"%({key})s")
                values[key] = st
            conditions.append(f"status IN ({', '.join(placeholders)})")
        elif isinstance(status_list, (list, tuple)) and len(status_list) == 1:
            conditions.append("status = %(status)s")
            values["status"] = status_list[0]
        elif isinstance(status_list, str) and status_list:
            conditions.append("status = %(status)s")
            values["status"] = status_list
    if priority:
        conditions.append("priority = %(priority)s")
        values["priority"] = priority
    
    if working_agent:
        # Accept comma-separated string, JSON array, or list/tuple from the client
        agent_list = working_agent
        if isinstance(agent_list, str):
            try:
                parsed = json.loads(agent_list)
                if isinstance(parsed, (list, tuple)):
                    agent_list = parsed
                else:
                    agent_list = [agent_list]
            except Exception:
                agent_list = [a.strip() for a in agent_list.split(",") if a.strip()]

        if isinstance(agent_list, (list, tuple)):
            agent_list = [a for a in agent_list if a]

        if isinstance(agent_list, (list, tuple)) and agent_list:
            placeholders = []
            for idx, ag in enumerate(agent_list):
                key = f"working_agent_{idx}"
                placeholders.append(f"%({key})s")
                values[key] = ag
            conditions.append(f"working_agent IN ({', '.join(placeholders)})")
        elif isinstance(agent_list, str) and agent_list:
            conditions.append("working_agent = %(working_agent)s")
            values["working_agent"] = agent_list

    if search:
        like = f"%{search}%"
        conditions.append("""(
            name LIKE %(like)s OR
            subject LIKE %(like)s OR
            customer LIKE %(like)s OR
            working_agent LIKE %(like)s OR
            priority LIKE %(like)s OR
            status LIKE %(like)s
        )""")
        values["like"] = like

    # --- Advanced filters ---
    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else filters
        except Exception:
            filters_obj = []

        for f in (filters_obj or []):
            try:
                if isinstance(f, dict):
                    field = f.get("fieldname") or f.get("field") or ""
                    operator = (f.get("operator") or "=").lower()
                    val = f.get("value")
                elif isinstance(f, (list, tuple)):
                    if len(f) == 4:
                        _, field, operator, val = f
                    else:
                        field, operator, val = f[0], f[1], f[2]
                else:
                    continue
            except Exception:
                continue

            if "." in field:
                field = field.split(".")[-1]

            key = f"f_{field}_{len(values)}"
            operator = (operator or "=").lower()

            # --- Detect child table dynamically ---
            child_table = get_child_table_for_field(parent_doctype, field)

            # --- Function to build condition (parent or child) ---
            def field_condition(cond_str, **kwargs):
                if child_table:
                    conditions.append(f"`tab{parent_doctype}`.`name` IN (SELECT parent FROM `tab{child_table}` WHERE {cond_str})")
                else:
                    conditions.append(cond_str)
                for k, v in kwargs.items():
                    values[k] = v

                    

            # --- Operators ---
            if operator in ("=", "=="):
                field_condition(f"`{field}` = %({key})s", **{key: val})
            elif operator in ("!=", "<>", "not equals"):
                field_condition(f"`{field}` != %({key})s", **{key: val})
            elif operator in ("like", "contains"):
                field_condition(f"`{field}` LIKE %({key})s", **{key: f"%{val}%"})
            elif operator in ("not like", "does not contain"):
                field_condition(f"`{field}` NOT LIKE %({key})s", **{key: f"%{val}%"})
            #elif operator in (">", "<", ">=", "<="):
                #field_condition(f"`{field}` {operator} %({key})s", **{key: val})
            elif operator in (">", "<", ">=", "<=", "after", "before", "on or after", "on or before"):
                sql_op = {">": ">","<": "<",">=": ">=","<=": "<=","after": ">","before": "<","on or after": ">=","on or before": "<=",}[operator]
                field_condition(f"`{field}` {sql_op} %({key})s", **{key: val})

            elif operator == "in":
                if isinstance(val, str):
                    val = [v.strip() for v in val.split(",") if v.strip()]
                if isinstance(val, (list, tuple)) and val:
                    placeholders = []
                    for i, v in enumerate(val):
                        kk = f"{key}_{i}"
                        placeholders.append(f"%({kk})s")
                        values[kk] = v
                    field_condition(f"`{field}` IN ({', '.join(placeholders)})")
            elif operator in ("not in", "nin"):
                if isinstance(val, str):
                    val = [v.strip() for v in val.split(",") if v.strip()]
                if isinstance(val, (list, tuple)) and val:
                    placeholders = []
                    for i, v in enumerate(val):
                        kk = f"{key}_{i}"
                        placeholders.append(f"%({kk})s")
                        values[kk] = v
                    field_condition(f"`{field}` NOT IN ({', '.join(placeholders)})")
            elif operator == "between":
                if isinstance(val, str) and "," in val:
                    val = [v.strip() for v in val.split(",")]
                if isinstance(val, (list, tuple)) and len(val) == 2:
                    start_key = f"{key}_start"
                    end_key = f"{key}_end"
                    field_condition(f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                                    **{start_key: val[0], end_key: val[1]})
            elif operator == "timespan":
                start_date, end_date = get_timespan_date_range(val) or (None, None)
                if start_date and end_date:
                    start_date = get_datetime(f"{start_date} 00:00:00")
                    end_date = get_datetime(f"{end_date} 23:59:59")
                    start_key = f"{key}_start"
                    end_key = f"{key}_end"
                    field_condition(f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                                    **{start_key: start_date, end_key: end_date})
           

            elif operator == "is":
                val_lower = str(val).lower()
                if child_table:
                    if val_lower in ("set", "not null"):
                        # parent appears if any child row has a value
                        conditions.append(
                            f"`tab{parent_doctype}`.`name` IN ("
                            f"SELECT parent FROM `tab{child_table}` "
                            f"WHERE `{field}` IS NOT NULL AND `{field}` != ''"
                            f")"
                        )
                    elif val_lower in ("not set", "null"):
                        # parent appears if: (1) no child rows at all OR (2) all children have empty/null field
                        conditions.append(
                            f"(`tab{parent_doctype}`.`name` NOT IN ("
                            f"SELECT parent FROM `tab{child_table}` "
                            f"WHERE `{field}` IS NOT NULL AND `{field}` != ''"
                            f"))"
                        )
                else:
                    if val_lower in ("set", "not null"):
                        conditions.append(f"`{field}` IS NOT NULL AND `{field}` != ''")
                    elif val_lower in ("not set", "null"):
                        conditions.append(f"(`{field}` IS NULL OR `{field}` = '')")



            elif operator == "fiscal year":
                if val:
                    fy = frappe.db.get_value("Fiscal Year", val, ["year_start_date", "year_end_date"], as_dict=True)
                    if fy:
                        start_key = f"{key}_start"
                        end_key = f"{key}_end"
                        field_condition(f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                                        **{start_key: fy.year_start_date, end_key: fy.year_end_date})

    # --- Build WHERE clause ---
    where_clause = " AND ".join(conditions)
    

    # --- Total count ---
    total = frappe.db.sql(f"SELECT COUNT(*) FROM `tabIssue` WHERE {where_clause}", values)[0][0]

    # --- Status counts ---
    status_rows = frappe.db.sql(
        f"""
        SELECT status, COUNT(*) AS count
        FROM `tabIssue`
        WHERE {where_clause}
        GROUP BY status
        """,
        values,
        as_dict=True
    )
    status_counts = {}
    for row in status_rows:
        status = row.get("status") or ""
        status_counts[status] = int(row.get("count") or 0)

    # --- Fetch data ---
    issues = frappe.db.sql(
        f"""
        SELECT name, subject, priority, status, customer,custom_query_type,
               working_agent, creation, resolution_by, modified, _comments, _assign
        FROM `tabIssue`
        WHERE {where_clause}
        ORDER BY modified DESC
        LIMIT {start}, {page_length}
        """,
        values,
        as_dict=True
    )

    for r in issues:
        raw = r.get("_comments") or "[]"

        try:
            # _comments is stored as JSON string list like: [{"comment": "...", ...}]
            parsed = json.loads(raw)

            if isinstance(parsed, list):
                r["comment_count"] = len(parsed)
            else:
                r["comment_count"] = 0

        except Exception:
            # if invalid JSON
            r["comment_count"] = 0

    return {
        "data": issues,
        "total": total,
        "status_counts": status_counts
    }

    # --- Add agent image / initials ---
    for ticket in issues:
        agent = ticket.get("working_agent")
        ticket["assigned_to_image"] = None
        ticket["assigned_to_initials"] = None
        if agent:
            user = frappe.db.get_value("User", agent, ["first_name", "last_name", "user_image"], as_dict=True)
            if user:
                if user.user_image:
                    ticket["assigned_to_image"] = user.user_image
                else:
                    initials = (user.first_name[0] if user.first_name else "") + (user.last_name[0] if user.last_name else "")
                    ticket["assigned_to_initials"] = initials or agent[0].upper()
        else:
            ticket["assigned_to_initials"] = "?"

    return {"data": issues, "total": total}


@frappe.whitelist()
def get_assignable_users(issue_name):
    """Return list of users who can be assigned to the issue."""
    # For simplicity, return all enabled system users with 'Tech Support' role
    users = frappe.db.sql("""
        SELECT _assign
        FROM `tabIssue` where name = %s
    """, issue_name, as_dict=True)

    return [
        {"user": users}
    ]

import frappe
import json

@frappe.whitelist()
def get_users_basic_info(users):
    """
    Fetch minimal User info safely (image + name)
    Works even if caller has no User permission
    """
    if isinstance(users, str):
        users = json.loads(users)

    if not users:
        return []

    return frappe.get_all(
        "User",
        filters={"name": ["in", users]},
        fields=["name", "full_name", "user_image"],
        ignore_permissions=True
    )

@frappe.whitelist()
def get_ticket_permissions():
    """
    Returns boolean dictionary indicating if the current user has 
    'write' and 'delete' permissions for 'Issue' doctype.
    """
    return {
        "write": frappe.has_permission("Issue", "write"),
        "delete": frappe.has_permission("Issue", "delete"),
        "export": frappe.has_permission("Issue", "export"),
        "print": frappe.has_permission("Issue", "print")
    }

# @frappe.whitelist()
# def get_customer_filters():
#     # 1. Fetch Account Managers (System Users that are enabled)
#     working_agent = frappe.get_all(
#         "User",
#         filters={"enabled": 1},
#         fields=["name", "full_name"],
#         order_by="full_name asc"
#     )

#     return {
#         "working_agent": [
#             {"value": u.name, "label": u.full_name or u.name}
#             for u in working_agent
#         ]
#     }


@frappe.whitelist()
def get_customer_filters():
    # Allowed roles
    allowed_roles = ["L1 - Tech Support",
        "Tech Support",
        "L2 - Tech Support",
        "L3 - Tech Support"
    ]

    # Fetch users who are enabled and have at least one of the allowed roles
    working_agent = frappe.db.sql(
        """
        SELECT DISTINCT u.name, u.full_name
        FROM `tabUser` u
        JOIN `tabHas Role` r ON r.parent = u.name
        WHERE u.enabled = 1
          AND r.role IN (%s)
        ORDER BY u.full_name ASC
        """ % (", ".join(["%s"] * len(allowed_roles))),
        tuple(allowed_roles),
        as_dict=True
    )

    return {
        "working_agent": [
            {"value": u.name, "label": u.full_name or u.name}
            for u in working_agent
        ]
    }


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


### details View methods

import frappe
from frappe import _

@frappe.whitelist()
def get_active_subscription_for_issue(issue_name):
    if not issue_name:
        return {"error": "missing_issue_name"}

    try:
        # Check if Issue exists
        frappe.get_doc("Issue", issue_name)
    except frappe.DoesNotExistError:
        return {"error": "issue_not_found"}

    # ✅ Fetch directly from the child table (Active Renewals)
    renewal_rows = frappe.get_all(
        "Active Renewals",
        filters={"parent": issue_name},
        fields=[
            "item",
            "item_name",
            "start_date",
            "end_date",
            "quantity",
            "amount",
            "renewal_id"
        ],
        order_by="start_date asc"
    )

    if not renewal_rows:
        return {"renewal_details": []}

    return {"renewal_details": renewal_rows}

import frappe
@frappe.whitelist()
def get_issue_activity(issue_name):
    """Return chronological activity timeline for an issue."""
    if not issue_name:
        return []
    
    activity = []

    # --- 1. Comments (All Types) ---
    comments = frappe.get_all(
        "Comment",
        filters={"reference_doctype": "Issue", "reference_name": issue_name},
        fields=["content", "creation", "owner", "comment_type", "comment_email"],
        order_by="creation desc"
    )

    # Map comment types to readable titles and colors
    comment_type_map = {
        "Comment": ("Commented", "warning"),
        "Like": ("Liked", "info"),
        "Info": ("Info Added", "secondary"),
        "Label": ("Label Added", "secondary"),
        "Workflow": ("Workflow Updated", "purple"),
        "Created": ("Document Created", "danger"),
        "Submitted": ("Submitted", "success"),
        "Cancelled": ("Cancelled", "danger"),
        "Updated": ("Updated", "info"),
        "Deleted": ("Deleted", "danger"),
        "Assigned": ("Assigned", "info"),
        "Assignment Completed": ("Assignment Completed", "success"),
        "Attachment": ("File Attached", "info"),
        "Attachment Removed": ("File Removed", "dark"),
        "Shared": ("Shared", "primary"),
        "Unshared": ("Unshared", "dark"),
        "Bot": ("Bot Activity", "secondary"),
        "Relinked": ("Relinked", "warning"),
        "Edit": ("Edited", "info")
    }

    for c in comments:
        user_fullname = frappe.utils.get_fullname(c.owner)
        
        comment_label, comment_color = comment_type_map.get(c.comment_type, ("Activity", "info"))

        # Default description
        desc = frappe.utils.strip_html_tags(c.content or "")

        # Optional: adjust messages for specific types
        # if c.comment_type == "Assigned":
        #     desc = f"{c.content}"
        # elif c.comment_type == "Attachment":
        #     desc = f"Attachment added by {user_fullname}"
        # elif c.comment_type == "Attachment Removed":
        #     desc = f"Attachment removed by {user_fullname}"
        # elif c.comment_type == "Deleted":
        #     desc = f"Deleted by {user_fullname}"

        activity.append({
            "type": c.comment_type,
            "title": f"{c.comment_email or user_fullname} {comment_label}",
            "description": desc,
            "timestamp": frappe.utils.format_datetime(c.creation, "medium"),
            "by": user_fullname,
            "color": comment_color,
            "is_html": True
        })


    # --- 2. Communications (Emails) ---
    communications = frappe.get_all(
        "Communication",
        filters={"reference_doctype": "Issue", "reference_name": issue_name},
        fields=["subject", "content", "sender_full_name", "creation", "communication_type","sender","recipients"],
        order_by="creation desc"
    )
    for c in communications:
        activity.append({
            "type": "Communication",
            "title": f"Notification sent to {c.recipients}" or "Communication Added",
            "description": c.content or "",
            "timestamp": frappe.utils.format_datetime(c.creation, "medium"),
            "by": c.sender_full_name or "System",
            "color": "info",
            "is_html": True
        })

    # --- 3. Status Changes (from Version) ---
    versions = frappe.get_all(
        "Version",
        filters={"ref_doctype": "Issue", "docname": issue_name},
        fields=["data", "creation", "owner"],
        order_by="creation desc"
    )
    for v in versions:
        data = frappe.parse_json(v.data)
        if data and "changed" in data:
            for change in data["changed"]:
                if change[0] == "status":
                    old_status, new_status = change[1], change[2]
                    user_fullname = frappe.utils.get_fullname(v.owner)
                    activity.append({
                        "type": "Status Change",
                        "title": f'Status Changed to "{new_status}"',
                        "description": f'Status updated from {old_status or "None"} to {new_status}.',
                        "timestamp": frappe.utils.format_datetime(v.creation, "medium"),
                        "by": user_fullname,
                        "color": "info",
                        "is_html": False
                    })

    # --- 4. Ticket Created Event ---
    issue = frappe.db.get_value(
        "Issue", issue_name, ["creation", "raised_by"], as_dict=True
    )
    if issue:
        user_fullname = frappe.utils.get_fullname(issue.raised_by)
        activity.append({
            "type": "Created",
            "title": "Ticket Created",
            "description": "Ticket submitted by user.",
            "timestamp": frappe.utils.format_datetime(issue.creation, "medium"),
            "by": user_fullname,
            "color": "danger",
            "is_html": False
        })

    # --- Sort All Activities by Date ---
    activity.sort(key=lambda x: frappe.utils.get_datetime(x["timestamp"]), reverse=True)
    return activity

import frappe
from frappe.utils import format_datetime

@frappe.whitelist()
def get_first_responder(issue_name):
    # Step 1: Fetch all outgoing company email IDs (to skip)
    email_accounts = frappe.db.get_all(
        "Email Account",
        fields=["email_id"],
        filters={"enable_outgoing": 1}
    )
    skip_emails = [e["email_id"].strip().lower() for e in email_accounts if e.get("email_id")]

    # Step 2: Build SQL query safely
    query = """
        SELECT c.sender, c.sender_full_name, c.owner, c.creation
        FROM `tabCommunication` c
        WHERE c.reference_doctype = 'Issue'
          AND c.reference_name = %s
          AND c.sent_or_received = 'Sent'
          AND EXISTS (
                SELECT 1 FROM `tabUser` u
                WHERE u.name = c.owner
                AND u.enabled = 1
                AND u.user_type = 'System User'
            )
    """

    values = [issue_name]

    # Step 3: Exclude known company “from” addresses exactly
    if skip_emails:
        placeholders = ', '.join(['%s'] * len(skip_emails))
        query += f" AND LOWER(c.sender) NOT IN ({placeholders})"
        values.extend(skip_emails)

    query += " ORDER BY c.creation ASC LIMIT 1"

    # Step 4: Execute query
    comm = frappe.db.sql(query, tuple(values), as_dict=True)
    if not comm:
        return {"first_responded_by": ""}

    comm = comm[0]

    # Step 5: Resolve responder name
    responder = comm.sender_full_name or comm.sender or ""
    if not responder and comm.owner:
        user = frappe.db.get_value("User", comm.owner, ["full_name", "email"], as_dict=True)
        responder = user.full_name or user.email or comm.owner

    # Step 6: Return data
    return {
        "first_responded_by": responder
    }


import frappe

@frappe.whitelist()
def get_users_with_role(role):
    users = frappe.db.get_all(
        "Has Role",
        filters={"role": role, "parenttype": "User"},
        fields=["parent"]
    )
    user_ids = [u.parent for u in users]
    return frappe.db.get_all("User", filters={"name": ["in", user_ids]}, fields=["name", "full_name"])



@frappe.whitelist()
def get_users_with_role_query(doctype, txt, searchfield, start, page_len, filters):
    return frappe.db.sql("""
        SELECT name, full_name
        FROM `tabUser`
        WHERE name LIKE %(txt)s
        AND name IN (
            SELECT parent FROM `tabHas Role` WHERE role = 'Tech Support'
        )
        AND enabled = 1
        ORDER BY full_name ASC
        LIMIT %(start)s, %(page_len)s
    """, {
        "txt": f"%{txt}%",
        "start": start,
        "page_len": page_len
    })


import frappe
from frappe.utils import now_datetime

@frappe.whitelist()
def get_issue_notes(issue_name):
    """Return Issue child table custom_note (list)"""
    if not frappe.db.exists("Issue", issue_name):
        return {"notes": []}
    issue = frappe.get_doc("Issue", issue_name)
    # Convert to simple dict list
    notes = []
    for n in (issue.custom_note or []):
        notes.append({
            "idx": n.idx,
            "note": n.note,
            "timestamp": n.timestamp,
            "owner": n.owner,
            "created_by": n.created_by or n.owner,
            "custom_role": n.custom_role or ""
        })
    return {"notes": notes}


import frappe
from frappe.utils import now_datetime

@frappe.whitelist()
def add_issue_note(issue_name, note_text):
    """Add a note row to Issue.custom_note and return updated list"""
    if not frappe.db.exists("Issue", issue_name):
        frappe.throw("Issue not found")

    issue = frappe.get_doc("Issue", issue_name)
    user = frappe.session.user

    # 🟢 Fetch user full name and role profile
    user_doc = frappe.get_doc("User", user)
    full_name = user_doc.full_name or user
    role_profile = user_doc.role_profile_name or ""

    # Add the note with role profile instead of role
    issue.append("custom_note", {
        "note": note_text,
        "timestamp": now_datetime(),
        "owner": user,
        "created_by": full_name,
        "custom_role": role_profile,  # ✅ Use Role Profile name here
    })

    issue.save(ignore_permissions=True)
    frappe.db.commit()

    return get_issue_notes(issue_name)



@frappe.whitelist()
def update_issue_note(issue_name, idx, note_text):
    """Edit a note by idx"""
    if not frappe.db.exists("Issue", issue_name):
        frappe.throw("Issue not found")

    issue = frappe.get_doc("Issue", issue_name)
    found = False

    for n in issue.custom_note:
        if n.idx == int(idx):
            n.note = note_text
            found = True
            break

    if not found:
        frappe.throw("Note not found")

    issue.save(ignore_permissions=True)
    frappe.db.commit()

    return get_issue_notes(issue_name)

@frappe.whitelist()
def get_enabled_users():
	"""
	Get list of enabled users with their details.
	This method bypasses direct User doctype access by using the database query.
	Returns users who are enabled and have valid email addresses.
	"""
	try:
		# Query the database directly to get users, bypassing permission checks
		users = frappe.db.get_list(
			"User",
			filters={"enabled": 1},
			fields=["name", "email", "full_name"],
			order_by="full_name asc",
            ignore_permissions=True
		)
		
		# Format the response
		return [
			{
				"name": u.get("full_name") or u.get("name"),
				"email": u.get("email") or u.get("name"),
				"user_id": u.get("name")
			}
			for u in users
		]
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "get_enabled_users error")
		return []

@frappe.whitelist()
def delete_issue_note(issue_name, idx):
    """Delete a note by idx"""
    if not frappe.db.exists("Issue", issue_name):
        frappe.throw("Issue not found")

    issue = frappe.get_doc("Issue", issue_name)
    issue.custom_note = [n for n in issue.custom_note if n.idx != int(idx)]

    issue.save(ignore_permissions=True)
    frappe.db.commit()

    return get_issue_notes(issue_name)

@frappe.whitelist()
def change_status(doctype, name, new_status):
    try:
        # Fetch the document
        doc = frappe.get_doc(doctype, name)
        # Update status
        doc.status = new_status
        doc.save(ignore_permissions=True)
        frappe.db.commit()

        # Return JSON-safe response
        return {"success": True, "message": f"Status changed to {new_status}"}
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Change Status Error")
        frappe.throw(f"Failed to update status: {str(e)}")


@frappe.whitelist()
def get_cc_emails(issue):
    """Return CC email list for Issue based on working agent, sales person, and assignees."""

    def normalize_email(value):
        if not value:
            return None
        value = str(value).strip()
        return value or None

    def get_user_email(user_id):
        user_id = normalize_email(user_id)
        if not user_id:
            return None
        if "@" in user_id:
            return user_id
        email = frappe.db.get_value("User", user_id, "email")
        return normalize_email(email) or user_id

    def get_employee_record(employee_id):
        if not employee_id:
            return None
        return frappe.db.get_value(
            "Employee",
            employee_id,
            ["user_id", "company_email", "personal_email", "reports_to"],
            as_dict=True,
        )

    def get_employee_by_user(user_id):
        if not user_id:
            return None
        return frappe.db.get_value(
            "Employee",
            {"user_id": user_id},
            ["name", "user_id", "company_email", "personal_email", "reports_to"],
            as_dict=True,
        )

    def get_employee_email(employee_id):
        record = get_employee_record(employee_id)
        if not record:
            return None
        user_email = get_user_email(record.get("user_id"))
        return user_email or normalize_email(record.get("company_email")) or normalize_email(record.get("personal_email"))

    def get_employee_chain_emails(employee_id, max_depth=3):
        emails = []
        current = employee_id
        depth = 0
        while current and depth < max_depth:
            reports_to = frappe.db.get_value("Employee", current, "reports_to")
            if not reports_to:
                break
            manager_email = get_employee_email(reports_to)
            if manager_email:
                emails.append(manager_email)
            current = reports_to
            depth += 1
        return emails

    def get_user_chain_emails(user_id):
        user_id = normalize_email(user_id)
        if not user_id:
            return []
        emp = get_employee_by_user(user_id)
        if not emp:
            return []
        return get_employee_chain_emails(emp.get("name"))

    def get_sales_person_emails(sales_person):
        sales_person = normalize_email(sales_person)
        if not sales_person:
            return []
        if "@" in sales_person:
            return [email for email in [get_user_email(sales_person)] if email]
        employee_id = frappe.db.get_value("Sales Person", sales_person, "employee")
        if not employee_id:
            return []
        emails = []
        employee_email = get_employee_email(employee_id)
        if employee_email:
            emails.append(employee_email)
        emails.extend(get_employee_chain_emails(employee_id))
        return emails

    issue_doc = frappe.get_doc("Issue", issue)
    cc_emails = []

    if issue_doc.working_agent:
        cc_emails.append(get_user_email(issue_doc.working_agent))
        cc_emails.extend(get_user_chain_emails(issue_doc.working_agent))

    if getattr(issue_doc, "employee", None):
        cc_emails.append(get_employee_email(issue_doc.employee))
        cc_emails.extend(get_employee_chain_emails(issue_doc.employee))

    sales_person = issue_doc.sales_person or getattr(issue_doc, "custom_sales_person", None)
    cc_emails.extend(get_sales_person_emails(sales_person))

    assignees = frappe.db.get_all(
        "ToDo",
        filters={"reference_type": "Issue", "reference_name": issue},
        pluck="allocated_to",
    )
    for user_id in assignees:
        cc_emails.append(get_user_email(user_id))
        cc_emails.extend(get_user_chain_emails(user_id))

    # De-duplicate, preserve order
    seen = set()
    cleaned = []
    for email in cc_emails:
        email = normalize_email(email)
        if not email:
            continue
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(email)

    return cleaned

import frappe

@frappe.whitelist()
def get_issue_timer(issue_id):
    """Return the current working timer value for a given issue"""
    issue = frappe.get_doc("Issue", issue_id)

    # You can adjust these fields depending on your logic
    working_seconds = issue.get("working_seconds") or 0
    formatted_time = format_seconds_to_time(working_seconds)

    return {
        "formatted_time": formatted_time,
        "working_seconds": working_seconds
    }


def format_seconds_to_time(seconds):
    """Helper: format seconds into HH:MM:SS"""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


@frappe.whitelist()
def get_contact_emails(customer=None):
    """
    Fetch:
    1. Contact emails linked to a customer (if provided)
    2. All active system user emails in the company
    """

    emails = set()

    # 🟢 1. Get Contact emails linked to Customer
    if customer:
        linked_contacts = frappe.db.sql("""
            SELECT c.email_id
            FROM `tabContact` c
            JOIN `tabDynamic Link` dl ON dl.parent = c.name
            WHERE dl.link_doctype = 'Customer'
              AND dl.link_name = %s
              AND c.email_id IS NOT NULL
        """, (customer,), as_dict=True)
        emails.update([c.email_id for c in linked_contacts if c.email_id])

    else:
        # If no customer passed, get all contacts with email
        all_contacts = frappe.get_all("Contact", fields=["email_id"], filters={"email_id": ["!=", ""]})
        emails.update([c.email_id for c in all_contacts if c.email_id])

    # 🟢 2. Get Active System Users (excluding Guest / Administrator)
    system_users = frappe.get_all(
        "User",
        filters={
            "enabled": 1,
            "name": ["not in", ["Administrator", "Guest"]],
            "user_type":"System User",
            "email": ["!=", ""]
        },
        fields=["email"]
    )
    emails.update([u.email for u in system_users if u.email])

    # Convert to sorted list
    return sorted(list(emails))

@frappe.whitelist()
def get_closed_by_for_issue(issue_name):
	"""Return full name of the user who closed the given Issue."""
	if not issue_name:
		return {}

	closed_by = None

	# Try to get from Communication
	comm = frappe.db.get_value(
		"Communication",
		{
			"reference_doctype": "Issue",
			"reference_name": issue_name,
			"content": ["like", "%<p>Status: <b>Closed</b></p>%"]
		},
		["owner"],
		order_by="creation desc"
	)

	if comm:
		user_fullname = frappe.db.get_value("User", comm, "full_name")
		closed_by = user_fullname or comm

	# If still not found, fallback to Comment (System Log)
	if not closed_by:
		comment_owner = frappe.db.get_value(
			"Comment",
			{
				"reference_doctype": "Issue",
				"reference_name": issue_name,
				"content": ["like", "%Status changed to Closed%"]
			},
			["owner"],
			order_by="creation desc"
		)
		if comment_owner:
			user_fullname = frappe.db.get_value("User", comment_owner, "full_name")
			closed_by = user_fullname or comment_owner

	return {"closed_by": closed_by or ""}


def _normalize_comment_mentions(content: str) -> str:
    """Ensure mention markup matches Frappe's expected data-id attribute.

    Without data-id, Frappe's notify_mentions raises a KeyError when parsing mentions.
    """
    if not content:
        return content

    try:
        from bs4 import BeautifulSoup
    except Exception:
        return content

    try:
        soup = BeautifulSoup(content, "html.parser")
    except Exception:
        return content

    for node in soup.find_all(class_="mention"):
        email = (
            node.get("data-id")
            or node.get("data-mention-email")
            or node.get("data-email")
        )

        if not email:
            href = node.get("href", "")
            if href.startswith("mailto:"):
                email = href.split("mailto:", 1)[1].split("?", 1)[0]

        label = node.get("data-mention-name") or node.get_text(strip=True)

        if email:
            node["data-id"] = email
            node["data-mention-email"] = email
            if not node.get("href"):
                node["href"] = f"mailto:{email}"
        else:
            # If we cannot resolve an email, drop the mention class to avoid notify_mentions crash
            node.attrs.pop("class", None)

        node.attrs.pop("contenteditable", None)
        if label:
            node["data-label"] = label

    return str(soup)


# @frappe.whitelist()
# def add_custom_comment(docname, content):
#     if not docname or not content:
#         frappe.throw("Missing required fields")

#     # Normalize mention markup so frappe.desk.notifications.notify_mentions can parse it safely
#     content = _normalize_comment_mentions(content)

#     doc = frappe.get_doc("Issue", docname)
#     doc.add_comment("Comment", content)
#     frappe.db.commit()

#     # Parse mentions (from our client-side mentions or mailto links) and notify mentioned users by email
#     try:
#         import re
#         from frappe.utils import get_url_to_form

#         mentioned_emails = set()
#         # data-id and data-mention-email attributes (inserted by client or normalized above)
#         mentioned_emails.update(re.findall(r'data-id="([^"]+)"', content or ""))
#         mentioned_emails.update(re.findall(r'data-mention-email="([^"]+)"', content or ""))
#         # mailto: links
#         mentioned_emails.update(re.findall(r'href="mailto:([^"]+)"', content or ""))

#         # normalize
#         mentioned_emails = {e.strip().lower() for e in mentioned_emails if e and "@" in e}

#         current_user = frappe.session.user

#         if mentioned_emails:
#             subject = f"You were mentioned in Issue {doc.name}"
#             issue_link = get_url_to_form("Issue", doc.name)
#             from_fullname = frappe.db.get_value("User", current_user, "full_name") or current_user
#             message = (
#                 f"<p><strong>{frappe.utils.escape_html(from_fullname)}</strong> mentioned you in "
#                 f"<a href=\"{issue_link}\">{frappe.utils.escape_html(doc.name)}</a></p>"
#                 f"<hr/>"
#                 f"<div>{content}</div>"
#             )

#             for email in mentioned_emails:
#                 try:
#                     frappe.sendmail(
#                         recipients=[email],
#                         subject=subject,
#                         message=message,
#                         reference_doctype="Issue",
#                         reference_name=doc.name,
#                     )
#                 except Exception as ex:
#                     frappe.log_error(message=frappe.get_traceback(), title="Mention email failed in add_custom_comment")
#     except Exception:
#         # keep silent on mention-notify failures to not break comment posting
#         frappe.log_error(message=frappe.get_traceback(), title="Mention notify: unexpected error")

#     return {"message": "Comment added successfully"}

@frappe.whitelist()
def add_custom_comment(docname, content):
    if not docname or not content:
        frappe.throw("Missing required fields")

    # Normalize mention markup so notify_mentions works safely
    content = _normalize_comment_mentions(content)

    doc = frappe.get_doc("Issue", docname)
    doc.add_comment("Comment", content)

    frappe.db.commit()

    return {"message": "Comment added successfully"}



@frappe.whitelist()
def send_issue_email(recipients=None, cc=None, bcc=None, subject=None, content=None, issue=None, attachments=None, send_me_a_copy=0):
    """Send email from Issue page ensuring file attachments are correctly linked to the Communication."""
    if not issue or not subject or not content or not recipients:
        frappe.throw("Missing required fields")

    from frappe.core.doctype.communication.email import add_attachments

    # normalize attachments: accept list/dict/str; resolve file_url -> File name
    resolved_attachments = []
    try:
        import json
        if isinstance(attachments, str):
            try:
                attachments = json.loads(attachments)
            except Exception:
                # allow comma-separated urls
                if "," in attachments:
                    attachments = [a.strip() for a in attachments.split(",") if a.strip()]
                else:
                    attachments = [attachments]

        if attachments:
            if isinstance(attachments, dict):
                attachments = [attachments]

            if isinstance(attachments, list):
                for att in attachments:
                    file_url = None
                    if isinstance(att, dict):
                        file_url = att.get("file_url") or att.get("file_name") or att.get("name")
                    elif isinstance(att, str):
                        file_url = att

                    if not file_url:
                        continue

                    file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
                    if file_name:
                        resolved_attachments.append(file_name)
    except Exception:
        frappe.log_error(message=frappe.get_traceback(), title="send_issue_email attachment resolution failed")

    # If user wants a copy, add current user's email to recipients (avoid duplicates)
    try:
        if send_me_a_copy:
            current_user = frappe.session.user
            current_email = frappe.db.get_value("User", current_user, "email") or current_user

            def _to_list(value):
                if not value:
                    return []
                if isinstance(value, (list, tuple)):
                    return [v for v in value if v]
                return [v.strip() for v in str(value).split(",") if v.strip()]

            rec_list = _to_list(recipients)
            rec_set = {r.strip().lower() for r in rec_list if r}
            if current_email and current_email.strip().lower() not in rec_set:
                rec_list.append(current_email)

            recipients = ", ".join(rec_list)
    except Exception:
        frappe.log_error(message=frappe.get_traceback(), title="send_issue_email send_me_a_copy failed")

    comm = frappe.get_doc({
        "doctype": "Communication",
        "subject": subject,
        "content": content,
        "sender": frappe.session.user,
        "recipients": recipients,
        "cc": cc or None,
        "bcc": bcc or None,
        "communication_medium": "Email",
        "sent_or_received": "Sent",
        "reference_doctype": "Issue",
        "reference_name": issue,
        "has_attachment": 1 if resolved_attachments else 0,
        "communication_type": "Communication",
    })
    comm.insert(ignore_permissions=True)

    if resolved_attachments:
        add_attachments(comm.name, resolved_attachments)

    comm.send_email(send_me_a_copy=False)

    return {"message": "Email sent"}




@frappe.whitelist()
def get_customer_sales_person(customer):
    """Return the first Sales Person from Customer > Sales Team child table"""
    if not customer:
        return ""

    sales_team = frappe.get_all(
        "Sales Team",
        filters={"parent": customer, "parenttype": "Customer"},
        fields=["sales_person"],
        order_by="idx asc",
        limit_page_length=1
    )

    if sales_team:
        return sales_team[0].get("sales_person", "")

    return ""

@frappe.whitelist()
def get_permitted_call_list(issue_name=None):
    """Return Call List docs that the current user can read or are shared with the user."""
    if not issue_name:
        return []

    current_user = frappe.session.user

    # Fetch all Call List docs under this issue
    docs = frappe.get_all(
        "Call List",
        filters={"issue_id": issue_name},
        fields=[
            "name", "name1", "subject", "status", "owner",
            "start_date", "start_timing", "end_date", "end_timing",
            "description"
        ],
        order_by="creation desc"
    )

    permitted = []

    # Pre-fetch all shared docs for efficiency
    shared_docs = frappe.share.get_shared("Call List", user=current_user) or []

    for d in docs:
        docname = d.name

        # 1. User has read permission on Call List
        has_perm = frappe.has_permission("Call List", "read", docname)

        # 2. Doc is shared with user
        is_shared = docname in shared_docs

        # 3. Doc is shared with everyone
        is_everyone = frappe.db.exists(
            "DocShare",
            {
                "share_doctype": "Call List",
                "share_name": docname,
                "everyone": 1,
                "read": 1
            }
        )

        # Decision: Allow if ANY of the three is true
        if has_perm or is_shared or is_everyone:
            permitted.append(d)

    return permitted


@frappe.whitelist()
def get_permitted_appointments(issue_name=None):
    """Return Appointment docs linked to the issue via custom_issue_id that the user can read."""
    if not issue_name:
        return []

    current_user = frappe.session.user

    docs = frappe.get_all(
        "Appointment",
        filters={"custom_issue_id": issue_name},
        fields=[
            "name",
            "party",
            "customer_name",
            "customer_phone_number",
            "customer_email",
            "custom_start_date",
            "custom_start_time",
            "custom_end_date",
            "custom_end_time",
            "scheduled_time",
            "status",
            "owner",
        ],
        order_by="custom_start_date desc"
    )

    permitted = []

    shared_docs = frappe.share.get_shared("Appointment", user=current_user) or []

    for d in docs:
        docname = d.name

        has_perm = frappe.has_permission("Appointment", "read", docname)

        is_shared = docname in shared_docs

        is_everyone = frappe.db.exists(
            "DocShare",
            {
                "share_doctype": "Appointment",
                "share_name": docname,
                "everyone": 1,
                "read": 1
            }
        )

        if has_perm or is_shared or is_everyone:
            permitted.append(d)

    if not permitted:
        return permitted

    field = frappe.get_meta("Appointment").get_field("custom_participants")
    child_doctype = field.options if field else None
    if not child_doctype or not frappe.db.exists("DocType", child_doctype):
        for d in permitted:
            d.custom_participants = []
        return permitted

    docnames = [d.name for d in permitted]
    participant_rows = frappe.get_all(
        child_doctype,
        filters={
            "parent": ["in", docnames],
            "parenttype": "Appointment",
            "parentfield": "custom_participants",
        },
        fields=["parent", "user"],
    )

    participants_by_parent = {}
    for row in participant_rows:
        participants_by_parent.setdefault(row.parent, []).append(row.user)

    for d in permitted:
        d.custom_participants = participants_by_parent.get(d.name, [])

    return permitted

@frappe.whitelist()
def is_task_shared_with_user(task_name, user):
    """Returns True if the task is shared with the user or shared with everyone."""
    
    # Direct shared documents
    shared_docs = frappe.share.get_shared("Task", user=user) or []
    if task_name in shared_docs:
        return True

    # Everyone share
    everyone_shared = frappe.db.exists(
        "DocShare",
        {
            "share_doctype": "Task",
            "share_name": task_name,
            "everyone": 1,
            "read": 1
        }
    )
    if everyone_shared:
        return True

    return False


import frappe

@frappe.whitelist()
def can_user_create_task():
    """Return True/False based on ACTUAL permission"""
    return frappe.permissions.has_permission("Task", ptype="create", user=frappe.session.user)


@frappe.whitelist()
def get_tasks_with_children(issue_name):
    if not issue_name:
        return []

    # Fetch all tasks under this issue
    tasks = frappe.db.get_all(
        "Task",
        filters={"issue": issue_name},
        fields=[
            "name",
            "subject",
            "status",
            "priority",
            "description",
            "exp_end_date",
            "creation",
            "completed_on",
            "modified"
        ],
        order_by="creation desc"
    )
    if not tasks:
        return []

    task_names = [t["name"] for t in tasks]

    # Fetch Task Users child table
    children = frappe.db.get_all(
        "Task Users",
        filters={"parent": ["in", task_names]},
        fields=["parent", "user", "idx"],
        order_by="parent, idx"
    )

    # Build child map
    child_map = {}
    for c in children:
        child_map.setdefault(c.parent, []).append({
            "user": c.user,
            "idx": c.idx
        })

    current_user = frappe.session.user

    permitted = []

    for task in tasks:
        name = task["name"]
        # --- Permission Logic ---
        # 1. Normal role permission
        has_perm = frappe.has_permission("Task", "read", name)
        # 2. Shared via DocShare
        is_shared = is_task_shared_with_user(name, current_user)
        # 3. Added in Task Users child table
        is_child_user = any(u["user"] == current_user for u in child_map.get(name, []))
        # FINAL PERMISSION DECISION
        if not (has_perm or is_shared or is_child_user):
            # user CANNOT see this task
            continue
        # Add child users to the task data
        task["custom_users"] = child_map.get(name, [])
        permitted.append(task)

    return permitted