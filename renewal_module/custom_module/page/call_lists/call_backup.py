import frappe
import json
from frappe import _
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import get_timespan_date_range
from renewal_module.user_permissions1 import calllist_has_permission, calllist_permission_query


def _get_call_list_doc(call_list_name: str, ptype: str = "read"):
    """Load a Call List doc and enforce document-level permission."""
    if not call_list_name:
        frappe.throw(_("Call List not specified."))

    doc = frappe.get_doc("Call List", call_list_name)
    if not calllist_has_permission(doc, ptype, frappe.session.user):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    return doc


def _build_sql_condition(column, operator, field_value, values, param_counter):
    """Build a SQL fragment and parameter map entry for a single filter."""
    operator = (operator or "=").lower().strip()

    def next_key():
        nonlocal param_counter
        key = f"param_{param_counter}"
        param_counter += 1
        return key

    if operator in ("=", "=="):
        key = next_key()
        values[key] = field_value
        return f"{column} = %({key})s", param_counter

    if operator in ("!=", "<>", "not equals"):
        key = next_key()
        values[key] = field_value
        return f"{column} != %({key})s", param_counter

    if operator in ("like", "contains"):
        if field_value in (None, ""):
            return None, param_counter
        key = next_key()
        values[key] = f"%{field_value}%"
        return f"{column} LIKE %({key})s", param_counter

    if operator in ("not like", "does not contain"):
        if field_value in (None, ""):
            return None, param_counter
        key = next_key()
        values[key] = f"%{field_value}%"
        return f"{column} NOT LIKE %({key})s", param_counter

    if operator in (">", "<", ">=", "<=", "after", "before", "on or after", "on or before"):
        sql_op = {
            ">": ">",
            "<": "<",
            ">=": ">=",
            "<=": "<=",
            "after": ">",
            "before": "<",
            "on or after": ">=",
            "on or before": "<=",
        }.get(operator, "=")
        key = next_key()
        values[key] = field_value
        return f"{column} {sql_op} %({key})s", param_counter

    if operator in ("in", "not in", "nin"):
        if isinstance(field_value, str):
            field_value = [v.strip() for v in field_value.split(",") if v.strip()]
        if not isinstance(field_value, (list, tuple)):
            field_value = [field_value]
        if not field_value:
            return None, param_counter

        placeholders = []
        for value in field_value:
            key = next_key()
            placeholders.append(f"%({key})s")
            values[key] = value

        sql_operator = "NOT IN" if operator in ("not in", "nin") else "IN"
        return f"{column} {sql_operator} ({', '.join(placeholders)})", param_counter

    if operator == "between":
        if isinstance(field_value, str):
            field_value = [v.strip() for v in field_value.split(",", 1)]
        if isinstance(field_value, (list, tuple)) and len(field_value) == 2:
            start_key = next_key()
            end_key = next_key()
            values[start_key] = field_value[0]
            values[end_key] = field_value[1]
            return f"{column} BETWEEN %({start_key})s AND %({end_key})s", param_counter
        return None, param_counter

    if operator == "timespan":
        start_date, end_date = get_timespan_date_range(field_value) or (None, None)
        if start_date and end_date:
            start_key = next_key()
            end_key = next_key()
            values[start_key] = frappe.utils.get_datetime(f"{start_date} 00:00:00")
            values[end_key] = frappe.utils.get_datetime(f"{end_date} 23:59:59")
            return f"{column} BETWEEN %({start_key})s AND %({end_key})s", param_counter
        return None, param_counter

    if operator in ("fiscal year", "fiscal_year"):
        fy_name = field_value
        if isinstance(field_value, dict):
            fy_name = field_value.get("name") or field_value.get("value") or field_value.get("fiscal_year")
        if fy_name:
            fy = frappe.db.get_value(
                "Fiscal Year",
                fy_name,
                ["year_start_date", "year_end_date"],
                as_dict=True,
            )
            if fy:
                start_key = next_key()
                end_key = next_key()
                values[start_key] = fy.year_start_date
                values[end_key] = fy.year_end_date
                return f"{column} BETWEEN %({start_key})s AND %({end_key})s", param_counter
        return None, param_counter

    if operator == "is":
        value_text = str(field_value).lower().strip()
        if value_text in ("set", "not null"):
            return f"({column} IS NOT NULL AND {column} != '')", param_counter
        if value_text in ("not set", "null"):
            return f"({column} IS NULL OR {column} = '')", param_counter

    return None, param_counter


def _resolve_call_list_filter_target(doctype, field_name, call_list_meta):
    """Resolve a filter to either the Call List table or a child table."""
    if not field_name:
        return None

    field_name = str(field_name).strip()
    if not field_name:
        return None

    if "." in field_name:
        prefix, remainder = field_name.split(".", 1)
        prefix = (prefix or "").strip()
        remainder = (remainder or "").strip()

        if prefix == "Call List":
            return {"kind": "parent", "field": remainder}

        table_field = call_list_meta.get_field(prefix) if call_list_meta else None
        if table_field and table_field.fieldtype == "Table" and table_field.options:
            return {
                "kind": "child",
                "parentfield": table_field.fieldname,
                "child_doctype": table_field.options,
                "field": remainder,
            }

        return {"kind": "parent", "field": remainder}

    if doctype and doctype != "Call List" and call_list_meta:
        for table_field in call_list_meta.fields:
            if table_field.fieldtype == "Table" and table_field.options == doctype:
                return {
                    "kind": "child",
                    "parentfield": table_field.fieldname,
                    "child_doctype": table_field.options,
                    "field": field_name,
                }

    return {"kind": "parent", "field": field_name}


def _build_call_list_filters(status=None, id=None, filters=None):
    """Build Frappe list filters so the custom page matches standard list permissions."""
    frappe_filters = []

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
            frappe_filters.append(["Call List", "status", "in", list(status_list)])
        elif isinstance(status_list, (list, tuple)) and len(status_list) == 1:
            frappe_filters.append(["Call List", "status", "=", status_list[0]])
        elif isinstance(status_list, str) and status_list:
            frappe_filters.append(["Call List", "status", "=", status_list])

    if id:
        frappe_filters.append(["Call List", "name", "like", f"%{id}%"])

    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else filters
        except Exception:
            filters_obj = []

        for f in (filters_obj or []):
            try:
                doctype = "Call List"
                if isinstance(f, dict):
                    doctype = f.get("doctype") or "Call List"
                    field = f.get("fieldname") or f.get("field") or ""
                    operator = (f.get("operator") or "=").lower().strip()
                    val = f.get("value")
                elif isinstance(f, (list, tuple)):
                    if len(f) >= 4:
                        doctype, field, operator, val = f[0], f[1], f[2], f[3]
                    elif len(f) == 3:
                        field, operator, val = f[0], f[1], f[2]
                    else:
                        continue
                    doctype = doctype or "Call List"
                    operator = (operator or "=").lower().strip()
                else:
                    continue
            except Exception:
                continue

            if not field:
                continue

            if "." in field:
                field_parts = field.split(".", 1)
                if len(field_parts) == 2:
                    doctype = field_parts[0] or doctype
                    field = field_parts[1]

            if operator in ("=", "=="):
                operator = "="
            elif operator in ("!=", "<>", "not equals"):
                operator = "!="
            elif operator in ("like", "contains"):
                operator = "like"
                val = f"%{val}%"
            elif operator in ("not like", "does not contain"):
                operator = "not like"
                val = f"%{val}%"
            elif operator == "after":
                operator = ">"
            elif operator == "before":
                operator = "<"
            elif operator == "on or after":
                operator = ">="
            elif operator == "on or before":
                operator = "<="
            elif operator in ("in", "not in", "nin") and isinstance(val, str):
                val = [v.strip() for v in val.split(",") if v.strip()]
                operator = "not in" if operator in ("not in", "nin") else "in"
            elif operator == "between" and isinstance(val, str) and "," in val:
                val = [v.strip() for v in val.split(",", 1)]
            elif operator == "timespan":
                start_date, end_date = get_timespan_date_range(val) or (None, None)
                if start_date and end_date:
                    val = [
                        frappe.utils.get_datetime(f"{start_date} 00:00:00"),
                        frappe.utils.get_datetime(f"{end_date} 23:59:59"),
                    ]
                    operator = "between"
                else:
                    continue
            elif operator in ("fiscal year", "fiscal_year"):
                fy_name = val
                if isinstance(val, dict):
                    fy_name = val.get("name") or val.get("value") or val.get("fiscal_year")
                if fy_name:
                    fy = frappe.db.get_value(
                        "Fiscal Year",
                        fy_name,
                        ["year_start_date", "year_end_date"],
                        as_dict=True,
                    )
                    if fy:
                        val = [fy.year_start_date, fy.year_end_date]
                        operator = "between"
                    else:
                        continue
            elif operator == "is":
                val_lower = str(val).lower().strip()
                if val_lower in ("set", "not null"):
                    val = "set"
                elif val_lower in ("not set", "null"):
                    val = "not set"

            frappe_filters.append([doctype or "Call List", field, operator, val])

    return frappe_filters


@frappe.whitelist()
def get_list_data(start=0, page_length=20, status=None, id=None, filters=None):
    """
    Fetch paginated list of Call List records with permission filtering.
    Applies custom permission query from user_permissions module.
    """
    start = int(start or 0)
    page_length = int(page_length or 20)
    
    # -------- permissions --------
    current_user = frappe.session.user
    permission_filter = None
    try:
        pf = calllist_permission_query(current_user)
        if isinstance(pf, str) and pf.strip():
            permission_filter = pf
    except Exception as e:
        frappe.log_error(f"Permission query error: {str(e)}", "calllist_permission_query")
        pass

    # Build conditions for direct SQL query
    conditions = []
    values = {}
    param_counter = 0
    call_list_meta = frappe.get_meta("Call List")
    
    # Apply permission filter first
    if permission_filter == "1=0":
        # User has no access
        return {"data": [], "total": 0}
    elif permission_filter and permission_filter not in ("1=1", ""):
        conditions.append(f"({permission_filter.replace('%', '%%')})")
    
    # Always exclude deleted documents
    conditions.append("`docstatus` != 2")
    
    # Apply basic filters
    frappe_filters = _build_call_list_filters(status=status, id=id, filters=filters)
    
    # Convert frappe filters to SQL conditions
    for f in frappe_filters:
        if isinstance(f, (list, tuple)) and len(f) >= 4:
            doctype = f[0] or "Call List"
            field_name = f[1]
            operator = str(f[2]).lower().strip()
            field_value = f[3]
            target = _resolve_call_list_filter_target(doctype, field_name, call_list_meta)

            if not target:
                continue

            if target.get("kind") == "child":
                child_doctype = target.get("child_doctype")
                parentfield = target.get("parentfield")
                child_field = target.get("field")

                if not child_doctype or not parentfield or not child_field:
                    continue

                child_condition, param_counter = _build_sql_condition(
                    f"child.`{child_field}`",
                    operator,
                    field_value,
                    values,
                    param_counter,
                )
                if child_condition:
                    parentfield_key = f"param_{param_counter}"
                    param_counter += 1
                    values[parentfield_key] = parentfield
                    conditions.append(
                        "EXISTS ("
                        f"SELECT 1 FROM `tab{child_doctype}` child "
                        "WHERE child.`parent` = `tabCall List`.`name` "
                        "AND child.`parenttype` = 'Call List' "
                        f"AND child.`parentfield` = %({parentfield_key})s "
                        f"AND {child_condition}"
                        ")"
                    )
                continue

            parent_field = target.get("field")
            if not parent_field:
                continue

            sql_condition, param_counter = _build_sql_condition(
                f"`{parent_field}`",
                operator,
                field_value,
                values,
                param_counter,
            )
            if sql_condition:
                conditions.append(sql_condition)

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    try:
        # Get total count
        total_sql = f"SELECT COUNT(*) FROM `tabCall List` WHERE {where_clause}"
        total = frappe.db.sql(total_sql, values)[0][0]
    except Exception as e:
        frappe.log_error(f"COUNT query error: {str(e)}\nSQL: {total_sql}\nValues: {values}", "call_lists.get_list_data COUNT error")
        return {"data": [], "total": 0}

    try:
        # Fetch data
        data_sql = f"""
            SELECT 
                name, name1, status, subject,
                start_date, start_timing, end_date, end_timing,
                modified, creation, modified_by, _comments
            FROM `tabCall List`
            WHERE {where_clause}
            ORDER BY modified DESC
            LIMIT {start}, {page_length}
        """
        rows = frappe.db.sql(data_sql, values, as_dict=True)
        
        # Parse comment count
        for row in rows:
            raw = row.get("_comments") or "[]"
            try:
                parsed = json.loads(raw)
                row["comment_count"] = len(parsed) if isinstance(parsed, list) else 0
            except Exception:
                row["comment_count"] = 0
    except Exception as e:
        frappe.log_error(f"SELECT query error: {str(e)}\nSQL: {data_sql}\nValues: {values}", "call_lists.get_list_data SELECT error")
        return {"data": [], "total": 0}

    return {
        "data": rows,
        "total": total,
    }

@frappe.whitelist()
def get_call_list_permissions():
    """
    Returns boolean dictionary indicating if the current user has 
    'write' and 'delete' permissions for 'Call List' doctype.
    """
    return {
        "write": frappe.has_permission("Call List", "write"),
        "delete": frappe.has_permission("Call List", "delete"),
        "export": frappe.has_permission("Call List", "export"),
        "print": frappe.has_permission("Call List", "print")
    }


@frappe.whitelist()
def get_call_list_details(call_list_name):
    """Fetch call list details enriched for details UI."""
    if not call_list_name:
        return {}

    doc = _get_call_list_doc(call_list_name, "read")
    data = doc.as_dict()
    data["owner_full_name"] = frappe.utils.get_fullname(doc.owner) if doc.owner else ""
    data["activity"] = get_call_list_activity(call_list_name)
    return data


@frappe.whitelist()
def get_call_list_notes(call_list_name):
    """Return Call List child table custom_note (ticketss-style model)."""
    if not call_list_name:
        return {"notes": []}

    doc = _get_call_list_doc(call_list_name, "read")
    notes = []

    def get_user_role_profile(user_id):
        if not user_id:
            return ""
        try:
            return frappe.db.get_value("User", user_id, "role_profile_name") or ""
        except Exception:
            return ""

    for row in (doc.custom_note or []):
        owner = row.owner or ""
        created_by = getattr(row, "created_by", None) or owner
        custom_role = getattr(row, "custom_role", "") or get_user_role_profile(owner)
        notes.append({
            "name": row.name,
            "description": row.note,
            "note": row.note,
            "note_type": "Internal",
            "creation": row.timestamp or row.creation,
            "timestamp": row.timestamp or row.creation,
            "owner": owner,
            "created_by": created_by,
            "custom_role": custom_role,
        })

    notes.sort(key=lambda x: x.get("creation") or "", reverse=True)
    return {"notes": notes}


@frappe.whitelist()
def add_call_list_note(call_list_name, note_text):
    """Add a note row to Call List.custom_note and return updated notes."""
    if not call_list_name or not note_text:
        frappe.throw("Missing call_list_name or note_text")

    doc = _get_call_list_doc(call_list_name, "write")
    user = frappe.session.user
    user_doc = frappe.get_doc("User", user)
    full_name = user_doc.full_name or user
    role_profile = user_doc.role_profile_name or ""

    row = doc.append("custom_note", {
        "note": note_text,
        "timestamp": frappe.utils.now_datetime(),
        "owner": user,
    })

    # Set optional fields when present in the child doctype.
    if hasattr(row, "created_by"):
        row.created_by = full_name
    if hasattr(row, "custom_role"):
        row.custom_role = role_profile

    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return get_call_list_notes(call_list_name)


@frappe.whitelist()
def get_call_list_tasks(call_list_name):
    """Return Task docs linked to this Call List."""
    if not call_list_name:
        return []

    try:
        _get_call_list_doc(call_list_name, "read")

        tasks = frappe.get_list(
            "Task",
            filters=[
                ["Task", "reference", "=", "Call List"],
                ["Task", "reference_to", "=", call_list_name],
            ],
            fields=[
                "name",
                "subject",
                "status",
                "priority",
                "creation",
                "exp_end_date",
                "owner",
            ],
            order_by="creation desc",
        )

        task_names = [t.get("name") for t in tasks if t.get("name")]
        users_by_task = {}
        if task_names:
            field = frappe.get_meta("Task").get_field("custom_users")
            child_doctype = field.options if field else "Task Users"

            if not child_doctype or not frappe.db.exists("DocType", child_doctype):
                child_doctype = "Task Users"

            rows = frappe.get_all(
                child_doctype,
                filters={
                    "parent": ["in", task_names],
                    "parenttype": "Task",
                    "parentfield": "custom_users",
                },
                fields=["parent", "user", "idx"],
                order_by="idx asc",
                ignore_permissions=True,
            )
            for row in rows:
                parent = row.get("parent")
                user = row.get("user")
                if not parent or not user:
                    continue
                users_by_task.setdefault(parent, []).append({
                    "user": user,
                    "idx": row.get("idx"),
                })

        for task in tasks:
            task["custom_users"] = users_by_task.get(task.get("name"), [])

        return tasks
    except Exception:
        frappe.log_error(frappe.get_traceback(), "get_call_list_tasks")
        return []


@frappe.whitelist()
def get_call_list_appointments(call_list_name):
    """Return Appointment docs linked to this Call List, including custom_participants."""
    if not call_list_name:
        return []

    try:
        _get_call_list_doc(call_list_name, "read")

        appointments = frappe.get_list(
            "Appointment",
            filters=[
                ["Appointment", "reference", "=", "Call List"],
                ["Appointment", "reference_to", "=", call_list_name],
            ],
            fields=[
                "name",
                "party",
                "custom_subject",
                "customer_name",
                "status",
                "creation",
                "custom_start_date",
                "custom_start_time",
                "custom_end_date",
                "custom_end_time",
                "scheduled_time",
                "customer_phone_number",
                "customer_email",
                "owner",
            ],
            order_by="creation desc",
        )

        if not appointments:
            return appointments

        field = frappe.get_meta("Appointment").get_field("custom_participants")
        child_doctype = field.options if field else None
        if not child_doctype or not frappe.db.exists("DocType", child_doctype):
            for row in appointments:
                row.custom_participants = []
            return appointments

        appointment_names = [row.name for row in appointments]
        participant_rows = frappe.get_all(
            child_doctype,
            filters={
                "parent": ["in", appointment_names],
                "parenttype": "Appointment",
                "parentfield": "custom_participants",
            },
            fields=["parent", "user"],
            order_by="idx asc",
            ignore_permissions=True,
        )

        participants_by_parent = {}
        for participant in participant_rows:
            parent = participant.get("parent")
            user = participant.get("user")
            if not parent or not user:
                continue
            participants_by_parent.setdefault(parent, []).append(user)

        for row in appointments:
            row.custom_participants = participants_by_parent.get(row.name, [])

        return appointments
    except Exception:
        frappe.log_error(frappe.get_traceback(), "get_call_list_appointments")
        return []


@frappe.whitelist()
def get_call_list_activity(call_list_name):
    """Return chronological activity timeline for an appointment."""
    if not call_list_name:
        return []

    _get_call_list_doc(call_list_name, "read")
    activity = []

    # --- 1. Comments (All Types) ---
    comments = frappe.get_all(
        "Comment",
        filters={"reference_doctype": "Call List", "reference_name": call_list_name},
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
        desc = frappe.utils.strip_html_tags(c.content or "")

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
        filters={"reference_doctype": "Call List", "reference_name": call_list_name},
        fields=["subject", "content", "sender_full_name", "creation", "communication_type", "sender", "recipients"],
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
        filters={"ref_doctype": "Call List", "docname": call_list_name},
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

    # --- 4. Created Event ---
    appointment_doc = frappe.db.get_value(
        "Call List", call_list_name, ["creation", "owner"], as_dict=True
    )
    if appointment_doc:
        activity.append({
            "type": "Created",
            "title": "Call List Created",
            "description": "Call List record created.",
            "timestamp": frappe.utils.format_datetime(appointment_doc.creation, "medium"),
            "by": frappe.utils.get_fullname(appointment_doc.owner) if appointment_doc.owner else frappe.session.user,
            "color": "danger",
            "is_html": False
        })

    # --- Sort All Activities by Date ---
    activity.sort(key=lambda x: frappe.utils.get_datetime(x["timestamp"]), reverse=True)
    return activity

def _normalize_comment_mentions(content: str) -> str:
    """Ensure mention markup matches Frappe's expected data-id attribute."""
    if not content:
        return content

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(content, 'html.parser')
    except Exception:
        return content

    try:
        import re
    except Exception:
        return content

    for node in soup.find_all(class_="mention"):
        data_id = node.get("data-id", "")
        if data_id and "@" in data_id:
            node["data-mention-email"] = data_id

    return str(soup)

@frappe.whitelist()
def add_call_list_comment(call_list_name, content):
    """Add a comment to an appointment."""
    if not call_list_name or not content:
        frappe.throw("Missing required fields")

    # Normalize mention markup so frappe can parse it safely
    content = _normalize_comment_mentions(content)

    doc = _get_call_list_doc(call_list_name, "read")
    doc.add_comment("Comment", content)
    frappe.db.commit()

    # Parse mentions and notify mentioned users
    try:
        import re
        from frappe.utils import get_url_to_form

        mentioned_emails = set()
        mentioned_emails.update(re.findall(r'data-id="([^"]+)"', content or ""))
        mentioned_emails.update(re.findall(r'data-mention-email="([^"]+)"', content or ""))
        mentioned_emails.update(re.findall(r'href="mailto:([^"]+)"', content or ""))

        mentioned_emails = {e.strip().lower() for e in mentioned_emails if e and "@" in e}
        current_user = frappe.session.user

        if mentioned_emails:
            subject = f"You were mentioned in Call List {doc.name}"
            contact_link = get_url_to_form("Call List", doc.name)
            from_fullname = frappe.db.get_value("User", current_user, "full_name") or current_user
            message = (
                f"<p><strong>{frappe.utils.escape_html(from_fullname)}</strong> mentioned you in "
                f"<a href=\"{contact_link}\">{frappe.utils.escape_html(doc.name)}</a></p>"
                f"<hr/>"
                f"<div>{content}</div>"
            )

            for email in mentioned_emails:
                try:
                    frappe.sendmail(
                        recipients=[email],
                        subject=subject,
                        message=message,
                        reference_doctype="Call List",
                        reference_name=doc.name,
                    )
                except Exception as ex:
                    frappe.log_error(message=frappe.get_traceback(), title="Mention email failed in add_call_list_comment")
    except Exception:
        frappe.log_error(message=frappe.get_traceback(), title="Mention notify: unexpected error")

    return {"message": "Comment added successfully"}

@frappe.whitelist()
def get_enabled_users():
    """Get list of enabled users for mentions."""
    users = frappe.get_all(
        "User",
        filters={"enabled": 1},
        fields=["name", "full_name", "email"],
        order_by="full_name asc"
    )
    return users


@frappe.whitelist()
def get_users_basic_info(users):
    """
    Fetch minimal User info safely (image + name)
    Works even if caller has no User permission.
    """
    if isinstance(users, str):
        users = frappe.parse_json(users)

    if not users:
        return []

    return frappe.get_all(
        "User",
        filters={"name": ["in", users]},
        fields=["name", "full_name", "user_image"],
        ignore_permissions=True,
    )


@frappe.whitelist()
def get_user_contact_meta(user=None):
    """Return safe User contact metadata for dialogs that need ignore_user_permissions."""
    if not user:
        return {}

    # Fetch by User ID first.
    rows = frappe.get_all(
        "User",
        filters={"name": user},
        fields=["name", "full_name", "mobile_no", "phone", "email", "enabled"],
        limit=1,
        ignore_permissions=True,
    )

    # Fallback when caller passes full name instead of user ID.
    if not rows:
        rows = frappe.get_all(
            "User",
            filters={"full_name": user},
            fields=["name", "full_name", "mobile_no", "phone", "email", "enabled"],
            limit=1,
            ignore_permissions=True,
        )

    if not rows:
        return {}

    u = rows[0]
    return {
        "name": u.get("name") or "",
        "full_name": u.get("full_name") or "",
        "mobile_no": u.get("mobile_no") or u.get("phone") or "",
        "email": u.get("email") or "",
        "enabled": u.get("enabled", 0),
    }


@frappe.whitelist()
def send_call_list_email(call_list_name, recipients, subject, content, cc="", bcc="", send_me_a_copy=0, attachments=None):
    """
    Sends an email from the Call List and logs it as a Communication.
    """
    if not call_list_name or not recipients or not subject or not content:
        frappe.throw("Missing required fields for email")

    _get_call_list_doc(call_list_name, "write")
    user = frappe.session.user
    
    # Optional attachments handling
    parsed_attachments = []
    if attachments:
        if isinstance(attachments, str):
            try:
                attachments = frappe.parse_json(attachments)
            except Exception:
                attachments = []
        for att in attachments:
            if isinstance(att, dict) and att.get("file_url"):
                parsed_attachments.append({"file_url": att.get("file_url")})
            elif isinstance(att, str):
                parsed_attachments.append({"file_url": att})

    # Prepare CC and BCC
    cc_list = [e.strip() for e in cc.split(",")] if cc else []
    
    # If "Send me a copy" is checked, add user to CC if not already there
    if frappe.utils.cint(send_me_a_copy):
        user_email = frappe.db.get_value("User", user, "email") or user
        if user_email not in cc_list and user_email not in recipients:
            cc_list.append(user_email)
            
    final_cc = ", ".join(cc_list)

    # Standard Frappe email send
    frappe.sendmail(
        recipients=recipients,
        cc=final_cc,
        bcc=bcc,
        subject=subject,
        message=content,
        reference_doctype="Call List",
        reference_name=call_list_name,
        attachments=parsed_attachments,
        sender=user,
        reply_to=user,
        now=True
    )

    # Note: sendmail with reference automatically creates a Communication doc.
    return {"message": "Email sent"}
