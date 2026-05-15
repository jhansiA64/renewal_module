import frappe
import json
from frappe import _
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import get_timespan_date_range
from renewal_module.user_permissions1 import appointment_has_permission, appointment_permission_query


def _get_appointment_doc(appointment_name: str, ptype: str = "read"):
    """Load an appointment and enforce document-level permission."""
    if not appointment_name:
        frappe.throw(_("Appointment not specified."))

    doc = frappe.get_doc("Appointment", appointment_name)
    if not appointment_has_permission(doc, ptype, frappe.session.user):
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

    if operator == "is":
        value_text = str(field_value).lower().strip()
        if value_text in ("set", "not null"):
            return f"{column} IS NOT NULL", param_counter
        if value_text in ("not set", "null"):
            return f"{column} IS NULL", param_counter

    return None, param_counter


def _resolve_appointment_filter_target(doctype, field_name, appointment_meta):
    """Resolve a filter to either the Appointment table or a child table."""
    if not field_name:
        return None

    field_name = str(field_name).strip()
    if not field_name:
        return None

    if "." in field_name:
        prefix, remainder = field_name.split(".", 1)
        prefix = (prefix or "").strip()
        remainder = (remainder or "").strip()

        if prefix == "Appointment":
            return {"kind": "parent", "field": remainder}

        table_field = appointment_meta.get_field(prefix) if appointment_meta else None
        if table_field and table_field.fieldtype == "Table" and table_field.options:
            return {
                "kind": "child",
                "parentfield": table_field.fieldname,
                "child_doctype": table_field.options,
                "field": remainder,
            }

        return {"kind": "parent", "field": remainder}

    if doctype and doctype != "Appointment" and appointment_meta:
        for table_field in appointment_meta.fields:
            if table_field.fieldtype == "Table" and table_field.options == doctype:
                return {
                    "kind": "child",
                    "parentfield": table_field.fieldname,
                    "child_doctype": doctype,
                    "field": field_name,
                }

    return {"kind": "parent", "field": field_name}


def _build_appointment_filters(status=None, id=None, filters=None):
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
            frappe_filters.append(["Appointment", "status", "in", list(status_list)])
        elif isinstance(status_list, (list, tuple)) and len(status_list) == 1:
            frappe_filters.append(["Appointment", "status", "=", status_list[0]])
        elif isinstance(status_list, str) and status_list:
            frappe_filters.append(["Appointment", "status", "=", status_list])

    if id:
        frappe_filters.append(["Appointment", "name", "like", f"%{id}%"])

    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else filters
        except Exception:
            filters_obj = []

        for f in (filters_obj or []):
            try:
                doctype = "Appointment"
                if isinstance(f, dict):
                    doctype = f.get("doctype") or "Appointment"
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
                    doctype = doctype or "Appointment"
                    operator = (operator or "=").lower().strip()
                else:
                    continue
            except Exception:
                continue

            if not field:
                continue

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
            elif operator == "is":
                val_lower = str(val).lower().strip()
                if val_lower in ("set", "not null"):
                    val = "set"
                elif val_lower in ("not set", "null"):
                    val = "not set"
            elif operator == "timespan":
                start_date, end_date = get_timespan_date_range(val) or (None, None)
                if start_date and end_date:
                    operator = "between"
                    val = [
                        frappe.utils.get_datetime(f"{start_date} 00:00:00"),
                        frappe.utils.get_datetime(f"{end_date} 23:59:59"),
                    ]
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
                        operator = "between"
                        val = [fy.year_start_date, fy.year_end_date]

            frappe_filters.append([doctype or "Appointment", field, operator, val])

    return frappe_filters


@frappe.whitelist()
def get_list_data(start=0, page_length=20, status=None, id=None, filters=None):
    """
    Fetch paginated list of Appointment records.
    Uses Frappe's standard `get_list` so permissions match the normal Appointment list view.
    """
    start = int(start or 0)
    page_length = int(page_length or 20)
    frappe_filters = _build_appointment_filters(status=status, id=id, filters=filters)

    current_user = frappe.session.user
    try:
        permission_filter = appointment_permission_query(current_user) or ""
    except Exception:
        frappe.log_error(frappe.get_traceback(), "appointments.get_list_data permission query error")
        return {"data": [], "total": 0}

    appointment_meta = frappe.get_meta("Appointment")
    conditions = ["`tabAppointment`.`docstatus` != 2"]
    values = {}
    param_counter = 0

    if permission_filter == "1=0":
        return {"data": [], "total": 0}
    if permission_filter and permission_filter not in ("1=1", ""):
        conditions.append(f"({permission_filter.replace('%', '%%')})")

    for f in frappe_filters:
        if not isinstance(f, (list, tuple)) or len(f) < 4:
            continue

        doctype = f[0] or "Appointment"
        field_name = f[1]
        operator = str(f[2]).lower().strip()
        field_value = f[3]

        target = _resolve_appointment_filter_target(doctype, field_name, appointment_meta)
        if not target:
            continue

        if target["kind"] == "parent":
            parent_field = target["field"]
            if not parent_field or not parent_field.replace("_", "").isalnum():
                continue

            condition, param_counter = _build_sql_condition(
                f"`tabAppointment`.`{parent_field}`",
                operator,
                field_value,
                values,
                param_counter,
            )
            if condition:
                conditions.append(condition)
            continue

        child_field = target["field"]
        if not child_field or not child_field.replace("_", "").isalnum():
            continue

        child_condition, param_counter = _build_sql_condition(
            f"child.`{child_field}`",
            operator,
            field_value,
            values,
            param_counter,
        )
        if not child_condition:
            continue

        parentfield_key = f"param_{param_counter}"
        param_counter += 1
        values[parentfield_key] = target["parentfield"]

        child_table = f"`tab{target['child_doctype']}`"
        conditions.append(
            f"EXISTS (SELECT 1 FROM {child_table} child "
            f"WHERE child.parent = `tabAppointment`.`name` "
            f"AND child.parenttype = 'Appointment' "
            f"AND child.parentfield = %({parentfield_key})s "
            f"AND {child_condition})"
        )

    try:
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        total_sql = f"SELECT COUNT(*) AS total FROM `tabAppointment` WHERE {where_clause}"
        total_result = frappe.db.sql(total_sql, values, as_dict=True)
        total = int((total_result[0] or {}).get("total", 0)) if total_result else 0
    except Exception:
        frappe.log_error(frappe.get_traceback(), "appointments.get_list_data COUNT error")
        return {"data": [], "total": 0}

    try:
        values["limit_start"] = start
        values["page_length"] = page_length
        data_sql = f"""
            SELECT
                name,
                customer_name,
                scheduled_time,
                status,
                custom_start_date,
                custom_start_time,
                custom_end_date,
                custom_end_time,
                customer_email,
                customer_phone_number,
                modified,
                creation,
                modified_by,
                _comments
            FROM `tabAppointment`
            WHERE {where_clause}
            ORDER BY scheduled_time DESC
            LIMIT %(limit_start)s, %(page_length)s
        """
        data = frappe.db.sql(data_sql, values, as_dict=True)

        for row in data:
            raw = row.get("_comments") or "[]"
            try:
                parsed = json.loads(raw)
                row["comment_count"] = len(parsed) if isinstance(parsed, list) else 0
            except Exception:
                row["comment_count"] = 0
    except Exception:
        frappe.log_error(frappe.get_traceback(), "appointments.get_list_data SELECT error")
        return {"data": [], "total": 0}

    return {
        "data": data,
        "total": total,
    }

@frappe.whitelist()
def get_appointment_permissions():
    """
    Returns boolean dictionary indicating if the current user has 
    'write' and 'delete' permissions for 'Appointment' doctype.
    """
    return {
        "write": frappe.has_permission("Appointment", "write"),
        "delete": frappe.has_permission("Appointment", "delete"),
        "export": frappe.has_permission("Appointment", "export"),
        "print": frappe.has_permission("Appointment", "print")
    }


@frappe.whitelist()
def get_appointment_activity(appointment_name):
    """Return chronological activity timeline for an appointment."""
    if not appointment_name:
        return []

    _get_appointment_doc(appointment_name, "read")
    activity = []

    # --- 1. Comments (All Types) ---
    comments = frappe.get_all(
        "Comment",
        filters={"reference_doctype": "Appointment", "reference_name": appointment_name},
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
        filters={"reference_doctype": "Appointment", "reference_name": appointment_name},
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
        filters={"ref_doctype": "Appointment", "docname": appointment_name},
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
        "Appointment", appointment_name, ["creation", "owner"], as_dict=True
    )
    if appointment_doc:
        activity.append({
            "type": "Created",
            "title": "Appointment Created",
            "description": "Appointment record created.",
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
def add_appointment_comment(appointment_name, content):
    """Add a comment to an appointment."""
    if not appointment_name or not content:
        frappe.throw("Missing required fields")

    # Normalize mention markup so frappe can parse it safely
    content = _normalize_comment_mentions(content)

    doc = _get_appointment_doc(appointment_name, "read")
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
            subject = f"You were mentioned in Appointment {doc.name}"
            contact_link = get_url_to_form("Appointment", doc.name)
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
                        reference_doctype="Appointment",
                        reference_name=doc.name,
                    )
                except Exception as ex:
                    frappe.log_error(message=frappe.get_traceback(), title="Mention email failed in add_appointment_comment")
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
        order_by="full_name asc",
        ignore_permissions=True,
    )
    return users


@frappe.whitelist()
def get_customer_sales_person(customer):
    """Return the first Sales Person from Customer > Sales Team child table."""
    if not customer:
        return ""

    sales_team = frappe.get_all(
        "Sales Team",
        filters={"parent": customer, "parenttype": "Customer"},
        fields=["sales_person"],
        order_by="idx asc",
        limit_page_length=1,
    )

    if sales_team:
        return sales_team[0].get("sales_person", "")

    return ""


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

    users = [str(u).strip() for u in users if str(u).strip()]
    if not users:
        return []

    return frappe.get_all(
        "User",
        or_filters={
            "name": ["in", users],
            "email": ["in", users],
        },
        fields=["name", "email", "full_name", "user_image"],
        ignore_permissions=True,
    )


@frappe.whitelist()
def send_appointment_email(appointment_name, recipients, subject, content, cc="", bcc="", send_me_a_copy=0, attachments=None):
    """
    Sends an email from the Appointment and logs it as a Communication.
    """
    if not appointment_name or not recipients or not subject or not content:
        frappe.throw("Missing required fields for email")

    _get_appointment_doc(appointment_name, "write")
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
        reference_doctype="Appointment",
        reference_name=appointment_name,
        attachments=parsed_attachments,
        sender=user,
        reply_to=user,
        now=True
    )

    # Note: sendmail with reference_doctype automatically creates a Communication doc.
    return {"message": "Email sent"}


@frappe.whitelist()
def get_appointment_notes(appointment_id):
    """
    Retrieve all notes associated with an appointment from the custom_note table.
    Returns a list of note records.
    """
    try:
        # Enforce read permission before loading notes
        apt_doc = _get_appointment_doc(appointment_id, "read")
        
        notes = []
        
        # Get notes from custom_note table field
        if apt_doc.custom_note:
            for note_row in apt_doc.custom_note:
                note_owner = note_row.owner or ""
                created_by = getattr(note_row, "created_by", None) or note_owner
                custom_role = getattr(note_row, "custom_role", "") or ""
                notes.append({
                    "idx": note_row.idx,
                    "name": note_row.name,
                    "title": f"Note by {created_by}",
                    "description": note_row.note,
                    "note": note_row.note,
                    "note_type": "Internal",
                    "creation": note_row.timestamp or note_row.creation,
                    "owner": note_owner,
                    "created_by": created_by,
                    "custom_role": custom_role,
                })
        
        # Get linked Note documents if they exist
        try:
            linked_notes = frappe.get_all(
                "Note",
                filters={
                    "reference_doc_type": "Appointment",
                    "reference_name": appointment_id
                },
                fields=["name", "title", "content as description", "creation", "owner"],
                order_by="creation desc"
            )
            for note in linked_notes:
                linked_owner = note.get("owner") or ""
                notes.append({
                    **note,
                    "note_type": "Linked",
                    "created_by": linked_owner,
                    "custom_role": ""
                })
        except:
            pass
        
        # Sort by timestamp/creation descending
        notes.sort(key=lambda x: x.get('creation') or '', reverse=True)
        
        return notes
    except Exception:
        frappe.log_error(frappe.get_traceback(), "get_appointment_notes")
        return []


@frappe.whitelist()
def get_appointment_calls(appointment_id):
    """
    Retrieve all Call List records linked to an appointment.
    Returns a list of call records.
    """
    try:
        _get_appointment_doc(appointment_id, "read")

        calls = frappe.get_list(
            "Call List",
            filters=[
                ["Call List", "reference", "=", "Appointment"],
                ["Call List", "reference_to", "=", appointment_id],
            ],
            fields=[
                "name",
                "name1",
                "subject",
                "status",
                "owner",
                "start_date",
                "start_timing",
                "end_date",
                "end_timing",
                "description",
            ],
            order_by="creation desc",
        )
        return calls
    except Exception:
        frappe.log_error(frappe.get_traceback(), "get_appointment_calls")
        return []


@frappe.whitelist()
def get_appointment_tasks(appointment_id):
    """
    Retrieve all Task records linked to an appointment.
    Returns a list of task records.
    """
    try:
        _get_appointment_doc(appointment_id, "read")

        tasks = frappe.get_list(
            "Task",
            filters=[
                ["Task", "reference", "=", "Appointment"],
                ["Task", "reference_to", "=", appointment_id],
            ],
            fields=[
                "name",
                "subject",
                "status",
                "priority",
                "description",
                "exp_end_date",
                "creation",
                "owner",
            ],
            order_by="creation desc",
        )

        # Include assignees from Task Users child table (same pattern as ticketss page).
        task_names = [t.get("name") for t in tasks if t.get("name")]
        users_by_task = {}
        if task_names:
            # Resolve the configured child doctype from Task.custom_users when available.
            field = frappe.get_meta("Task").get_field("custom_users")
            child_doctype = (field.options if field and field.options else "Task Users")

            rows = frappe.get_all(
                child_doctype,
                filters={"parent": ["in", task_names]},
                fields=["parent", "user", "idx"],
                order_by="parent asc, idx asc",
                ignore_permissions=True,
            )
            for row in rows:
                parent = row.get("parent")
                user = row.get("user")
                if not parent or not user:
                    continue
                users_by_task.setdefault(parent, []).append({"user": user, "idx": row.get("idx")})

        for task in tasks:
            task["custom_users"] = users_by_task.get(task.get("name"), [])

        return tasks
    except Exception:
        frappe.log_error(frappe.get_traceback(), "get_appointment_tasks")
        return []


@frappe.whitelist()
def add_appointment_note(appointment_id, note_text):
    """
    Add a note to an appointment's custom_note table field with timestamp tracking.
    """
    try:
        if not appointment_id or not note_text:
            frappe.throw("Missing appointment_id or note_text")
        
        apt = _get_appointment_doc(appointment_id, "write")
        user = frappe.session.user
        
        user_doc = frappe.get_doc("User", user)
        full_name = user_doc.full_name or user
        role_profile = user_doc.role_profile_name or ""

        # Append note to custom_note table field with timestamp
        apt.append("custom_note", {
            "note": note_text,
            "timestamp": frappe.utils.now_datetime(),
            "owner": user
        })

        if apt.custom_note:
            row = apt.custom_note[-1]
            if hasattr(row, "created_by"):
                row.created_by = full_name
            if hasattr(row, "custom_role"):
                row.custom_role = role_profile
        
        apt.save(ignore_permissions=True)
        frappe.db.commit()
        return {"message": "Note added successfully"}
    except Exception:
        frappe.log_error(frappe.get_traceback(), "add_appointment_note")
        frappe.throw("Error adding note")


@frappe.whitelist()
def update_appointment_note(appointment_id, note_name, note_text):
    """
    Update a note in an appointment's custom_note child table by row name.
    """
    try:
        if not appointment_id or not note_name or not note_text:
            frappe.throw("Missing required fields")

        apt = _get_appointment_doc(appointment_id, "write")
        current_user = frappe.session.user

        updated = False
        for note_row in apt.custom_note:
            if note_row.name == note_name:
                if current_user != note_row.owner and current_user != "Administrator":
                    frappe.throw("Not authorized to edit this note")
                note_row.note = note_text
                updated = True
                break

        if not updated:
            frappe.throw("Note not found")

        apt.save(ignore_permissions=True)
        frappe.db.commit()
        return {"message": "Note updated successfully"}
    except Exception:
        frappe.log_error(frappe.get_traceback(), "update_appointment_note")
        frappe.throw("Error updating note")


@frappe.whitelist()
def delete_appointment_note(appointment_id, note_name):
    """
    Delete a note from an appointment's custom_note child table by row name.
    Only Administrators can delete notes.
    """
    try:
        if not appointment_id or not note_name:
            frappe.throw("Missing required fields")

        if frappe.session.user != "Administrator":
            frappe.throw("Not authorized to delete notes")

        apt = _get_appointment_doc(appointment_id, "write")
        apt.custom_note = [row for row in apt.custom_note if row.name != note_name]

        apt.save(ignore_permissions=True)
        frappe.db.commit()
        return {"message": "Note deleted successfully"}
    except Exception:
        frappe.log_error(frappe.get_traceback(), "delete_appointment_note")
        frappe.throw("Error deleting note")
