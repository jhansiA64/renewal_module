import frappe

@frappe.whitelist()
def get_ticket_counts():
    """Return ticket counts by status from Issue doctype."""
    statuses = ["Open", "Resolved", "Pending", "Closed","On Hold"]
    counts = {}
    
    for status in statuses:
        counts[status] = frappe.db.count("Issue", {"status": status})

    return counts

from frappe import _
from datetime import datetime
from frappe.utils import flt, now_datetime, getdate, get_datetime
#from renewal_module.custom_module.page.issue_theme.timespan import add_to_date, get_timespan_date_range
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
import frappe
import json
@frappe.whitelist()
def get_list_data(start=0, page_length=20, status=None, priority=None, search=None, filters=None):
    start = int(start or 0)
    page_length = int(page_length or 20)

    conditions = ["1=1"]
    values = {}

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
        conditions.append("status = %(status)s")
        values["status"] = status
    if priority:
        conditions.append("priority = %(priority)s")
        values["priority"] = priority

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

    # --- Fetch data ---
    issues = frappe.db.sql(
        f"""
        SELECT name, subject, priority, status, customer,
               working_agent, creation, sla_resolution_by, modified
        FROM `tabIssue`
        WHERE {where_clause}
        ORDER BY modified DESC
        LIMIT {start}, {page_length}
        """,
        values,
        as_dict=True
    )

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
def awesome_search(txt, limit=10):
    txt = txt.lower()
    seen = set()
    results = []
    frappe.msgprint(txt)

    # Get list of all searchable doctypes
    # You can limit to searchable doctypes if needed
    doctypes = frappe.get_all("DocType", filters={"issingle": 0, "istable": 0}, fields=["name"])

    for dt in doctypes:
        try:
            matches = frappe.get_all(
                dt.name,
                fields=["name", "title", "status", "priority"],  # fetch extra fields if needed
                limit_page_length=int(limit)
            )
            for m in matches:
                title = getattr(m, "title", None) or m.name
                key = f"{dt.name}:{m.name}"
                if key in seen:
                    continue
                # check if search text matches name or title
                if txt in m.name.lower() or (title and txt in title.lower()):
                    seen.add(key)
                    results.append({
                        "name": m.name,
                        "title": title,
                        "doctype": dt.name,
                        "status": getattr(m, "status", ""),
                        "priority": getattr(m, "priority", "")
                    })
        except Exception as e:
            # skip doctypes you cannot read
            continue

    return results[:int(limit)]



@frappe.whitelist()
def global_search(txt, limit=5):
    # frappe.msgprint("Hi")
    results = []
    doctypes = frappe.get_all("DocType", filters={
        "istable": 0,
        "issingle": 0,
        "name": ["like", f"%{txt}%"]
    }, fields=["name"],limit_page_length=limit)
    for dt in doctypes:
        results.append({"doctype": dt.name})
        # try:
        #     items = frappe.get_all(dt.name, filters=[["name", "like", f"%{txt}%"]], fields=["name"], limit_page_length=limit)
        #     for item in items:
        #         results.append({"doctype": dt.name})
        # except Exception:
        #     continue
    return results

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

@frappe.whitelist()
def get_user_notifications(offset=0, limit=10):
    user = frappe.session.user
    notifications = frappe.get_all(
        "Notification Log",
        filters={"for_user": user},
        fields=["name", "subject", "email_content", "creation", "read"],
        order_by="creation desc",
        limit_start=int(offset),
        limit_page_length=int(limit)
    )
    return notifications



import frappe

@frappe.whitelist()
def mark_all_as_read():
    user = frappe.session.user
    frappe.db.sql("""
        UPDATE `tabNotification Log`
        SET `read` = 1
        WHERE for_user = %s AND coalesce(`read`, 0) = 0
    """, (frappe.session.user,))
    frappe.db.commit()

    return True

@frappe.whitelist()
def mark_notification_as_read(notification_name):
    if notification_name:
        frappe.db.set_value("Notification Log", notification_name, "read", 1)
        frappe.db.commit()
    return {"status": "success"}