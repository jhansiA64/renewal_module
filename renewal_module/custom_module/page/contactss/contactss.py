import json
import frappe
from datetime import datetime
from frappe.utils import flt, now_datetime, getdate, get_datetime
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range

@frappe.whitelist()
def get_list_data(start=0, page_length=20,status=None, name=None,full_name=None,company_name=None, filters=None):
    # Cast pagination inputs
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(full_name)))
    try:
        start = int(start or 0)
        page_length = int(page_length or 20)
    except (ValueError, TypeError):
        start = 0
        page_length = 20

    conditions = []
    values = {}
    parent_doctype = "Contact"

    def get_child_table_for_field(parent_doctype, fieldname):
        try:
            meta = frappe.get_meta(parent_doctype)
            for df in meta.fields:
                if df.fieldtype == "Table":
                    child_meta = frappe.get_meta(df.options)
                    if fieldname in [f.fieldname for f in child_meta.fields]:
                        return df.options
        except Exception as e:
            frappe.log_error(f"Error detecting child table for {fieldname}: {str(e)}")
        return None

    # basic filters
    if status:
        conditions.append("`status` = %(status)s")
        values["status"] = status
        
    if name and name.strip():
        conditions.append("`name` LIKE %(name)s")
        values["name"] = f"%{name}%"

    if full_name and full_name.strip():
        conditions.append("`full_name` LIKE %(full_name)s")
        values["full_name"] = f"%{full_name}%"
        
    if company_name and company_name.strip():
        conditions.append("`company_name` LIKE %(company_name)s")
        values["company_name"] = f"%{company_name}%"

    # additional filters
    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else filters
        except Exception as e:
            frappe.log_error(f"Error parsing filters: {str(e)}")
            filters_obj = []

        for f in (filters_obj or []):
            try:
                if isinstance(f, dict):
                    field = f.get("fieldname") or f.get("field") or ""
                    operator = (f.get("operator") or "=").lower()
                    val = f.get("value")
                elif isinstance(f, (list, tuple)) and len(f) >= 3:
                    field = f[-3]
                    operator = (f[-2] or "=").lower()
                    val = f[-1]
                else:
                    continue
            except Exception as e:
                frappe.log_error(f"Error processing filter {f}: {str(e)}")
                continue

            if "." in field:
                field = field.split(".")[-1]

            # Map common field aliases to actual Contact fields
            field_mapping = {
                "id": "name",
                "fullname": "full_name",
                "contact_name": "full_name"
            }
            field = field_mapping.get(field.lower(), field)

            key = f"f_{field}_{len(values)}"
            child_table = get_child_table_for_field(parent_doctype, field)

            def add_condition(cond_str, **kwargs):
                if child_table:
                    conditions.append(
                        "`tabContact`.`name` IN ("
                        f"SELECT parent FROM `tab{child_table}` WHERE {cond_str}"
                        ")"
                    )
                else:
                    conditions.append(f"`tabContact`.{cond_str}")
                values.update(kwargs)

            try:
                if operator in ("=", "==", "equals"):
                    add_condition(f"`{field}` = %({key})s", **{key: val})

                elif operator in ("!=", "<>", "not equals"):
                    add_condition(f"`{field}` != %({key})s", **{key: val})

                elif operator in ("like", "contains"):
                    add_condition(f"`{field}` LIKE %({key})s", **{key: f"%{val}%"})

                elif operator in ("not like", "does not contain"):
                    add_condition(f"`{field}` NOT LIKE %({key})s", **{key: f"%{val}%"})

                elif operator in (">", "<", ">=", "<=", "after", "before", "on or after", "on or before"):
                    sql_op = {
                        ">": ">", "<": "<", ">=": ">=", "<=": "<=",
                        "after": ">", "before": "<",
                        "on or after": ">=", "on or before": "<="
                    }.get(operator, "=")
                    add_condition(f"`{field}` {sql_op} %({key})s", **{key: val})

                elif operator == "in":
                    if isinstance(val, str):
                        val = [v.strip() for v in val.split(",") if v.strip()]
                    if isinstance(val, (list, tuple)) and val:
                        placeholders = []
                        for i, v in enumerate(val):
                            kk = f"{key}_{i}"
                            placeholders.append(f"%({kk})s")
                            values[kk] = v
                        add_condition(f"`{field}` IN ({', '.join(placeholders)})")

                elif operator in ("not in", "nin"):
                    if isinstance(val, str):
                        val = [v.strip() for v in val.split(",") if v.strip()]
                    if isinstance(val, (list, tuple)) and val:
                        placeholders = []
                        for i, v in enumerate(val):
                            kk = f"{key}_{i}"
                            placeholders.append(f"%({kk})s")
                            values[kk] = v
                        add_condition(f"`{field}` NOT IN ({', '.join(placeholders)})")

                elif operator == "between":
                    if isinstance(val, str) and "," in val:
                        val = [v.strip() for v in val.split(",")]
                    if isinstance(val, (list, tuple)) and len(val) == 2:
                        start_key = f"{key}_start"
                        end_key = f"{key}_end"
                        add_condition(
                            f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                            **{start_key: val[0], end_key: val[1]}
                        )

                elif operator == "timespan":
                    start_date, end_date = get_timespan_date_range(val) or (None, None)
                    if start_date and end_date:
                        start_date = get_datetime(f"{start_date} 00:00:00")
                        end_date = get_datetime(f"{end_date} 23:59:59")
                        start_key = f"{key}_start"
                        end_key = f"{key}_end"
                        add_condition(
                            f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                            **{start_key: start_date, end_key: end_date}
                        )

                elif operator == "is":
                    val_lower = str(val).lower()
                    if child_table:
                        if val_lower in ("set", "not null"):
                            conditions.append(
                                f"`tabContact`.`name` IN ("
                                f"SELECT parent FROM `tab{child_table}` "
                                f"WHERE `{field}` IS NOT NULL AND `{field}` != ''"
                                f")"
                            )
                        elif val_lower in ("not set", "null"):
                            conditions.append(
                                f"`tabContact`.`name` NOT IN ("
                                f"SELECT parent FROM `tab{child_table}` "
                                f"WHERE `{field}` IS NOT NULL AND `{field}` != ''"
                                f")"
                            )
                    else:
                        if val_lower in ("set", "not null"):
                            conditions.append(f"`tabContact`.`{field}` IS NOT NULL AND `tabContact`.`{field}` != ''")
                        elif val_lower in ("not set", "null"):
                            conditions.append(f"(`tabContact`.`{field}` IS NULL OR `tabContact`.`{field}` = '')")

                elif operator == "fiscal year":
                    if val:
                        fy = frappe.db.get_value("Fiscal Year", val, ["year_start_date", "year_end_date"], as_dict=True)
                        if fy:
                            start_key = f"{key}_start"
                            end_key = f"{key}_end"
                            add_condition(
                                f"`{field}` BETWEEN %({start_key})s AND %({end_key})s",
                                **{start_key: fy.year_start_date, end_key: fy.year_end_date}
                            )
            except Exception as e:
                frappe.log_error(f"Operator processing error for {operator}: {str(e)}")
                continue

    where_clause = " AND ".join(conditions) or "1=1"

    # Total count
    total = frappe.db.sql(
        f"SELECT COUNT(*) FROM `tabContact` WHERE {where_clause}",
        values
    )[0][0]

    # Fetch paginated data
    contacts = frappe.db.sql(
        f"""
        SELECT
            name,
            full_name,
            email_id,
            status,
            phone,
            mobile_no,
            company_name,
            user,
            modified,
            _comments
        FROM `tabContact`
        WHERE {where_clause}
        ORDER BY modified DESC
        LIMIT {start}, {page_length}
        """,
        values,
        as_dict=True,
    )

    # Add comment count
    for row in contacts:
        try:
            row["comment_count"] = len(json.loads(row.get("_comments") or "[]"))
        except Exception:
            row["comment_count"] = 0

        # Aliases expected by JS
        row["user_id"] = row.get("user")
        row["email"] = row.get("email_id")
        row["customer_name"] = row.get("company_name")

    return {
        "data": contacts,
        "total": total
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


@frappe.whitelist()
def get_contact_activity(contact_name):
    """Return chronological activity timeline for a contact."""
    if not contact_name:
        return []
    
    activity = []

    # --- 1. Comments (All Types) ---
    comments = frappe.get_all(
        "Comment",
        filters={"reference_doctype": "Contact", "reference_name": contact_name},
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
        filters={"reference_doctype": "Contact", "reference_name": contact_name},
        fields=["subject", "content", "sender_full_name", "creation", "communication_type", "sender", "recipients"],
        order_by="creation desc"
    )
    
    for c in communications:
        # use the same title logic as the tickets timeline so the two timelines are consistent
        activity.append({
            "type": "Communication",
            # prefer reporting the notification recipients (same as ticket timeline)
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
        filters={"ref_doctype": "Contact", "docname": contact_name},
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

    # --- 4. Contact Created Event ---
    contact = frappe.db.get_value(
        "Contact", contact_name, ["creation", "owner"], as_dict=True
    )
    if contact:
        # when the contact is first created, show the owner/creator rather than the current session user
        activity.append({
            "type": "Created",
            "title": "Contact Created",
            "description": "Contact record created.",
            "timestamp": frappe.utils.format_datetime(contact.creation, "medium"),
            "by": frappe.utils.get_fullname(contact.owner) if contact.owner else frappe.session.user,
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
def add_contact_comment(contact_name, content):
    """Add a comment to a contact."""
    if not contact_name or not content:
        frappe.throw("Missing required fields")

    # Normalize mention markup so frappe can parse it safely
    content = _normalize_comment_mentions(content)

    doc = frappe.get_doc("Contact", contact_name)
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
            subject = f"You were mentioned in Contact {doc.name}"
            contact_link = get_url_to_form("Contact", doc.name)
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
                        reference_doctype="Contact",
                        reference_name=doc.name,
                    )
                except Exception as ex:
                    frappe.log_error(message=frappe.get_traceback(), title="Mention email failed in add_contact_comment")
    except Exception:
        frappe.log_error(message=frappe.get_traceback(), title="Mention notify: unexpected error")

    return {"message": "Comment added successfully"}

@frappe.whitelist()
def get_contact_emails(contact_id=None):
    """
    Fetch:
    1. Contact emails linked to a customer (if provided)
    2. All active system user emails in the company
    """

    emails = set()

    # 🟢 1. Get Active System Users (excluding Guest / Administrator)
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
def send_contact_email(contact_name, recipients=None, cc=None, bcc=None, subject=None, content=None, attachments=None, send_me_a_copy=0):
    """Send email to contact."""
    if not contact_name or not recipients:
        frappe.throw("Contact name and recipients are required")

    if isinstance(recipients, str):
        recipients = [r.strip() for r in recipients.split(",") if r.strip()]

    if cc and isinstance(cc, str):
        cc = [c.strip() for c in cc.split(",") if c.strip()]

    if bcc and isinstance(bcc, str):
        bcc = [b.strip() for b in bcc.split(",") if b.strip()]

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

            recipients = rec_list
    except Exception:
        frappe.log_error(message=frappe.get_traceback(), title="send_contact_email send_me_a_copy failed")

    # Build comma-separated strings for Communication
    try:
        recipients_str = ", ".join(recipients) if isinstance(recipients, (list, tuple)) else (recipients or "")
        cc_str = ", ".join(cc) if isinstance(cc, (list, tuple)) else (cc or None)
        bcc_str = ", ".join(bcc) if isinstance(bcc, (list, tuple)) else (bcc or None)

        # Create Communication record so the email shows in Email Queue
        comm = frappe.get_doc({
            "doctype": "Communication",
            "subject": subject or "",
            "content": content or "",
            "sender": frappe.session.user,
            "recipients": recipients_str,
            "cc": cc_str,
            "bcc": bcc_str,
            "communication_medium": "Email",
            "sent_or_received": "Sent",
            "reference_doctype": "Contact",
            "reference_name": contact_name,
            "has_attachment": 1 if attachments else 0,
            "communication_type": "Communication",
        })
        comm.insert(ignore_permissions=True)

        # Attach files (if any) to the Communication doc by creating File records
        if attachments and isinstance(attachments, (list, tuple)):
            for att in attachments:
                try:
                    file_url = att.get("file_url") if isinstance(att, dict) else None
                    file_name = att.get("file_name") if isinstance(att, dict) else None
                    if not file_url:
                        continue
                    # Create File record linking to Communication
                    frappe.get_doc({
                        "doctype": "File",
                        "file_name": file_name or file_url.split("/")[-1],
                        "file_url": file_url,
                        "is_private": 0,
                        "attached_to_doctype": "Communication",
                        "attached_to_name": comm.name,
                    }).insert(ignore_permissions=True)
                except Exception:
                    frappe.log_error(frappe.get_traceback(), "Failed to attach file to Communication")

        # Send (this will create Email Queue entries via Communication.send_email)
        comm.send_email(send_me_a_copy=False)
        return {"status": "success", "message": "Email sent successfully"}
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title="Error sending contact email")
        return {"status": "error", "message": str(e)}


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