import json

import frappe
from frappe import _


ALLOWED_DOC_FIELDS = {
    "Opportunity": {
        "name",
        "status",
        "opportunity_amount",
        "party_name",
        "transaction_date",
        "creation",
    },
    "Quotation": {
        "name",
        "party_name",
        "status",
        "grand_total",
        "transaction_date",
        "creation",
    },
}


def _to_list(value):
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return []
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [v for v in parsed if v]
        except Exception:
            pass
        return [value]

    if isinstance(value, (list, tuple, set)):
        return [v for v in value if v]

    return []


@frappe.whitelist()
def get_sales_team_parents(parenttype, sales_persons=None):
    """Return unique parent document names from Sales Team rows for given sales persons."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    if isinstance(sales_persons, str):
        sales_persons = sales_persons.strip()
        if not sales_persons:
            sales_persons = []
        else:
            try:
                sales_persons = json.loads(sales_persons)
            except Exception:
                sales_persons = [sales_persons]

    sales_persons = [s for s in (sales_persons or []) if s]
    if not sales_persons:
        return []

    rows = frappe.get_all(
        "Sales Team",
        filters={
            "parenttype": parenttype,
            "sales_person": ["in", sales_persons],
        },
        fields=["parent"],
        ignore_permissions=True,
        limit_page_length=0,
    )

    return sorted({r.get("parent") for r in rows if r.get("parent")})


@frappe.whitelist()
def get_active_sales_persons():
    """Return all active Sales Person rows plus Sales Manager role users for dropdown."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    rows = frappe.get_all(
        "Sales Person",
        filters={
            "enabled": 1,
            
        },
        fields=["name", "parent_sales_person", "employee", "is_group", "enabled"],
        ignore_permissions=True,
        order_by="name asc",
        limit_page_length=0,
    )

    manager_users = frappe.db.sql(
        """
        SELECT DISTINCT
            x.user_id,
            x.display_name
        FROM (
            SELECT
                u.name AS user_id,
                COALESCE(NULLIF(u.full_name, ''), u.name) AS display_name
            FROM `tabHas Role` hr
            INNER JOIN `tabUser` u ON u.name = hr.parent
            WHERE hr.role LIKE 'Sales Manager%'
              AND IFNULL(u.enabled, 0) = 1

            UNION

            SELECT
                u.name AS user_id,
                COALESCE(NULLIF(u.full_name, ''), u.name) AS display_name
            FROM `tabUser` u
            INNER JOIN `tabHas Role` rph ON rph.parent = u.role_profile_name
            WHERE IFNULL(u.role_profile_name, '') != ''
              AND rph.role LIKE 'Sales Manager%'
              AND IFNULL(u.enabled, 0) = 1
        ) x
        """,
        as_dict=True,
    )

    existing_names = {r.get("name") for r in rows if r.get("name")}
    for manager in manager_users:
        display_name = manager.get("display_name")
        if not display_name or display_name in existing_names:
            continue
        rows.append(
            {
                "name": display_name,
                "parent_sales_person": None,
                "employee": None,
                "is_group": 1,
                "enabled": 1,
                "is_sales_manager_user": 1,
                "user_id": manager.get("user_id"),
            }
        )

    rows = sorted(rows, key=lambda d: (d.get("name") or "").lower())
    return rows or []


@frappe.whitelist()
def get_scoped_docs(doctype, from_date, to_date, sales_persons=None, fields=None):
    """Return docs in date range scoped by active sales person mapping through Sales Team."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    if doctype not in ALLOWED_DOC_FIELDS:
        frappe.throw(_("Unsupported doctype"), frappe.ValidationError)

    requested_fields = _to_list(fields) or ["name"]
    allowed = ALLOWED_DOC_FIELDS[doctype]
    clean_fields = [f for f in requested_fields if f in allowed]
    if "name" not in clean_fields:
        clean_fields.insert(0, "name")

    sales_person_list = _to_list(sales_persons)
    if not sales_person_list:
        return []

    team_rows = frappe.get_all(
        "Sales Team",
        filters={
            "parenttype": doctype,
            "sales_person": ["in", sales_person_list],
        },
        fields=["parent"],
        ignore_permissions=True,
        limit_page_length=0,
    )

    parents = sorted({r.get("parent") for r in team_rows if r.get("parent")})
    if not parents:
        return []

    date_field = "transaction_date"
    base_filters = [[doctype, date_field, "between", [from_date, to_date]]]

    results = []
    chunk_size = 500
    for i in range(0, len(parents), chunk_size):
        chunk = parents[i:i + chunk_size]
        rows = frappe.get_all(
            doctype,
            fields=clean_fields,
            filters=base_filters + [[doctype, "name", "in", chunk]],
            order_by=f"{date_field} asc",
            limit_page_length=0,
        )
        results.extend(rows or [])

    return results
