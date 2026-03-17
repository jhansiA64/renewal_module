# import frappe

# @frappe.whitelist()
# def get_issues(issue_type=None, assigned_to=None, sort_by='modified desc'):
#     filters = {}
#     if issue_type:
#         filters['issue_type'] = issue_type
#     if assigned_to:
#         filters['assigned_to'] = assigned_to

#     return frappe.get_all(
#         'Issue',
#         fields=['name', 'subject', 'company', 'status', 'modified'],
#         filters=filters,
#         order_by=sort_by,
#         limit=100
#     )

import frappe

@frappe.whitelist()
def get_filtered_issues(filters=None):
    import json
    filters = json.loads(filters) if isinstance(filters, str) else filters or []
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters)))
    issues = frappe.get_all(
        "Issue",
        fields=["*"],
        filters=filters,
        order_by="modified desc"
    )
    return issues


import frappe
import json

@frappe.whitelist()
def get_issues(issue_type=None, assigned_to=None, sort_by="modified desc", filters=None):
    filters = json.loads(filters) if filters else []

    if issue_type:
        filters.append(["issue_type", "=", issue_type])
    if assigned_to:
        filters.append(["_assign", "like", f"%{assigned_to}%"])

    issues = frappe.get_all("Issue",
        fields=["name", "subject", "status", "customer", "company", "creation", "modified"],
        filters=filters,
        order_by=sort_by,
        limit_page_length=5000
    )
    return issues


import frappe

@frappe.whitelist()
def get_issue_comments(issue_name):
    """Return comments for a given Issue"""
    comments = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Issue",
            "reference_name": issue_name
        },
        fields=["creation", "comment_by", "content"],
        order_by="creation desc"
    )
    return comments


import frappe

@frappe.whitelist()
def add_custom_comment(docname, content):
    if not docname or not content:
        frappe.throw("Missing required fields")

    doc = frappe.get_doc("Issue", docname)
    doc.add_comment("Comment", content)
    frappe.db.commit()
    return {"message": "Comment added successfully"}


import frappe
from frappe.utils import get_fullname

@frappe.whitelist()
def get_user_roles(user):
    user_doc = frappe.get_doc("User", user)
    full_name = get_fullname(user)
    image = user_doc.user_image or ""
    role_profile = user_doc.role_profile_name or ""

    roles = frappe.get_all("Has Role", filters={"parent": user}, fields=["role"])
    role_names = [r["role"] for r in roles]

    return {
        "full_name": full_name,
        "image": image,
        "role_profile": role_profile,
        "roles": role_names
    }

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
# def export_with_children(doctype, fields, issues=None, child_tables=None):
#     issues = frappe.parse_json(issues) or []
#     fields = frappe.parse_json(fields) or []
#     child_tables = frappe.parse_json(child_tables) or []

#     filters = {"name": ["in", issues]} if issues else {}
#     docs = frappe.get_all(doctype, filters=filters, fields=["name"] + fields, order_by="name asc")

#     results = []
#     for d in docs:
#         doc = frappe.get_doc(doctype, d.name)
#         base_row = {f: d.get(f) for f in fields}

#         if child_tables:
#             for table in child_tables:
#                 for row in doc.get(table):
#                     row_data = base_row.copy()
#                     for c in row.as_dict():
#                         row_data[f"{table}.{c}"] = row.get(c)
#                     results.append(row_data)
#         else:
#             results.append(base_row)

#     return results

@frappe.whitelist()
def export_with_children(doctype, fields, filters=None, child_tables=None):
    if isinstance(fields, str):
        fields = frappe.parse_json(fields)
    if isinstance(child_tables, str):
        child_tables = frappe.parse_json(child_tables)

    # Fetch parent docs
    docs = frappe.get_all(
        doctype,
        fields=fields,
        filters=filters,
        order_by="name asc",
        limit_page_length=0
    )

    data = []
    header = fields[:]

    # Add child table columns dynamically
    if child_tables:
        for table in child_tables:
            meta = frappe.get_meta(table)
            for df in meta.fields:
                if df.fieldname and df.fieldtype not in ("Table", "Section Break", "Column Break", "Tab Break"):
                    col_name = f"{table}.{df.fieldname}"
                    header.append(col_name)

    data.append(header)

    # Prepare rows
    for d in docs:
        doc = frappe.get_doc(doctype, d.name)
        base_row = [d.get(f) or "" for f in fields]

        if child_tables:
            for table in child_tables:
                # ✅ Ensure empty list if no children
                child_rows = doc.get(table) or []

                if child_rows:
                    for row in child_rows:
                        row_data = base_row[:]
                        for df in frappe.get_meta(table).fields:
                            if df.fieldname and df.fieldtype not in ("Table", "Section Break", "Column Break", "Tab Break"):
                                row_data.append(row.get(df.fieldname) or "")
                        data.append(row_data)
                else:
                    # Add just the parent row if no children exist
                    row_data = base_row[:]
                    for df in frappe.get_meta(table).fields:
                        if df.fieldname and df.fieldtype not in ("Table", "Section Break", "Column Break", "Tab Break"):
                            row_data.append("")
                    data.append(row_data)
        else:
            data.append(base_row)

    return data
