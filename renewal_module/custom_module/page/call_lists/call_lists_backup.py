import frappe
import json
from frappe import _
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from renewal_module.user_permissions import calllist_has_permission, calllist_permission_query


@frappe.whitelist()
def get_list_data(start=0, page_length=20, status=None, id=None, filters=None):
    """
    Fetch paginated list of Call List records.
    Supports:
      - status: single value or comma-separated list
      - id: partial match on name (LIKE)
      - filters: JSON array of [doctype, field, operator, value] from FilterGroup
    Returns: { data: [...], total: int }
    """
    start = int(start or 0)
    page_length = int(page_length or 20)

    conditions = ["1=1"]
    values = {}

    # ---- Status filter ----
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
            conditions.append(f"`status` IN ({', '.join(placeholders)})")
        elif isinstance(status_list, (list, tuple)) and len(status_list) == 1:
            conditions.append("`status` = %(status_val)s")
            values["status_val"] = status_list[0]
        elif isinstance(status_list, str) and status_list:
            conditions.append("`status` = %(status_val)s")
            values["status_val"] = status_list

    # ---- ID (name) LIKE filter ----
    if id:
        conditions.append("`name` LIKE %(id_val)s")
        values["id_val"] = f"%{id}%"

    # ---- Advanced FilterGroup filters ----
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
                    # Frappe FilterGroup sends [doctype, field, operator, value, default]
                    if len(f) >= 4:
                        _, field, operator, val = f[0], f[1], f[2], f[3]
                    elif len(f) == 3:
                        field, operator, val = f[0], f[1], f[2]
                    else:
                        continue
                else:
                    continue
            except Exception:
                continue

            if not field:
                continue

            # Strip table prefix (e.g. "Appointment.name" → "name")
            if "." in field:
                field = field.split(".")[-1]

            key = f"f_{field}_{len(values)}"
            operator = (operator or "=").lower().strip()

            if operator in ("=", "=="):
                conditions.append(f"`{field}` = %({key})s")
                values[key] = val
            elif operator in ("!=", "<>", "not equals"):
                conditions.append(f"`{field}` != %({key})s")
                values[key] = val
            elif operator in ("like", "contains"):
                conditions.append(f"`{field}` LIKE %({key})s")
                values[key] = f"%{val}%"
            elif operator in ("not like", "does not contain"):
                conditions.append(f"`{field}` NOT LIKE %({key})s")
                values[key] = f"%{val}%"
            elif operator in (">", "<", ">=", "<=", "after", "before", "on or after", "on or before"):
                sql_op = {
                    ">": ">", "<": "<", ">=": ">=", "<=": "<=",
                    "after": ">", "before": "<", "on or after": ">=", "on or before": "<="
                }.get(operator, "=")
                conditions.append(f"`{field}` {sql_op} %({key})s")
                values[key] = val
            elif operator == "in":
                if isinstance(val, str):
                    val = [v.strip() for v in val.split(",") if v.strip()]
                if isinstance(val, (list, tuple)) and val:
                    placeholders = []
                    for i, v in enumerate(val):
                        kk = f"{key}_{i}"
                        placeholders.append(f"%({kk})s")
                        values[kk] = v
                    conditions.append(f"`{field}` IN ({', '.join(placeholders)})")
            elif operator in ("not in", "nin"):
                if isinstance(val, str):
                    val = [v.strip() for v in val.split(",") if v.strip()]
                if isinstance(val, (list, tuple)) and val:
                    placeholders = []
                    for i, v in enumerate(val):
                        kk = f"{key}_{i}"
                        placeholders.append(f"%({kk})s")
                        values[kk] = v
                    conditions.append(f"`{field}` NOT IN ({', '.join(placeholders)})")
            elif operator == "between":
                if isinstance(val, str) and "," in val:
                    val = [v.strip() for v in val.split(",")]
                if isinstance(val, (list, tuple)) and len(val) == 2:
                    sk, ek = f"{key}_start", f"{key}_end"
                    conditions.append(f"`{field}` BETWEEN %({sk})s AND %({ek})s")
                    values[sk] = val[0]
                    values[ek] = val[1]
            elif operator == "timespan":
                start_date, end_date = get_timespan_date_range(val) or (None, None)
                if start_date and end_date:
                    sk, ek = f"{key}_start", f"{key}_end"
                    conditions.append(f"`{field}` BETWEEN %({sk})s AND %({ek})s")
                    values[sk] = frappe.utils.get_datetime(f"{start_date} 00:00:00")
                    values[ek] = frappe.utils.get_datetime(f"{end_date} 23:59:59")
            elif operator in ("fiscal year", "fiscal_year"):
                fy_name = val
                if isinstance(val, dict):
                    fy_name = val.get("name") or val.get("value") or val.get("fiscal_year")
                if fy_name:
                    fy = frappe.db.get_value(
                        "Fiscal Year", fy_name,
                        ["year_start_date", "year_end_date"],
                        as_dict=True
                    )
                    if fy:
                        sk, ek = f"{key}_start", f"{key}_end"
                        conditions.append(f"`{field}` BETWEEN %({sk})s AND %({ek})s")
                        values[sk] = fy.year_start_date
                        values[ek] = fy.year_end_date
            elif operator == "is":
                val_lower = str(val).lower()
                if val_lower in ("set", "not null"):
                    conditions.append(f"(`{field}` IS NOT NULL AND `{field}` != '')")
                elif val_lower in ("not set", "null"):
                    conditions.append(f"(`{field}` IS NULL OR `{field}` = '')")

    # ---- Build final query ----
    # permission_clause = calllist_permission_query(frappe.session.user)
    # if permission_clause:
    #     conditions.append(f"({permission_clause})")

    #Match standard list-view visibility (user permissions, shares, role-based match conditions).
    # match_clause = frappe.build_match_conditions("Call List")
    # if match_clause:
    #     conditions.append(f"({match_clause})")

    where_clause = " AND ".join(conditions)

    try:
        total = frappe.db.sql(
            f"SELECT COUNT(*) FROM `tabCall List` WHERE {where_clause}",
            values
        )[0][0]
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "call_lists.get_list_data COUNT error")
        return {"data": [], "total": 0}

    try:
        data = frappe.db.sql(
            f"""
            SELECT
                `name`,
				`name1`,
                `status`,
				`subject`,
                `start_date`,
                `start_timing`,
                `end_date`,
                `end_timing`,
                `modified`,
                `creation`,
                `modified_by`,
                `_comments`
            FROM `tabCall List`
            WHERE {where_clause}
            ORDER BY `modified` DESC
            LIMIT {start}, {page_length}
            """,
            values,
            as_dict=True
        )
        for r in data:
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
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "call_lists.get_list_data SELECT error")
        return {"data": [], "total": 0}

    return {
        "data": data,
        "total": total
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

    doc = frappe.get_doc("Call List", call_list_name)
    if not calllist_has_permission(doc, "read", frappe.session.user):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    data = doc.as_dict()
    data["owner_full_name"] = frappe.utils.get_fullname(doc.owner) if doc.owner else ""
    data["activity"] = get_call_list_activity(call_list_name)
    return data


@frappe.whitelist()
def get_call_list_notes(call_list_name):
    """Return Call List child table custom_note (ticketss-style model)."""
    if not call_list_name:
        return {"notes": []}

    if not frappe.db.exists("Call List", call_list_name):
        return {"notes": []}

    doc = frappe.get_doc("Call List", call_list_name)
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

    if not frappe.db.exists("Call List", call_list_name):
        frappe.throw("Call List not found")

    doc = frappe.get_doc("Call List", call_list_name)
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
        tasks = frappe.db.sql(
            """
            SELECT
                `name`,
                `subject`,
                `status`,
                `priority`,
                `creation`,
                `exp_end_date`,
                `owner`
            FROM `tabTask`
            WHERE (
                (`reference` = 'Call List' AND `reference_to` = %(call_list_name)s)
            )
            ORDER BY `creation` DESC
            """,
            {"call_list_name": call_list_name},
            as_dict=True,
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
        appointments = frappe.db.sql(
            """
            SELECT
                `name`,
                `party`,
                `custom_subject`,
                `customer_name`,
                `status`,
                `creation`,
                `custom_start_date`,
                `custom_start_time`,
                `custom_end_date`,
                `custom_end_time`,
                `scheduled_time`,
                `customer_phone_number`,
                `customer_email`,
                `owner`
            FROM `tabAppointment`
            WHERE (
                (`reference` = 'Call List' AND `reference_to` = %(call_list_name)s)
            )
            ORDER BY `creation` DESC
            """,
            {"call_list_name": call_list_name},
            as_dict=True,
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

    doc = frappe.get_doc("Call List", call_list_name)
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
