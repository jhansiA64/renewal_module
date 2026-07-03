import frappe
from frappe.utils import flt
import json
from datetime import datetime
from frappe.utils import cint, cstr
from frappe.utils import get_datetime, now_datetime

@frappe.whitelist()
def get_filters():
    """Get available filters: owners list for Quotation"""
    owners = frappe.get_all(
        "User",
        filters={"enabled": 1},
        fields=["name as value", "full_name as label", "user_image"]
    )
    return {"owners": owners}


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def search_items_for_link(doctype, txt, searchfield, start, page_len, filters=None):
    """Link-search helper for Item fields used by quotation page wizards."""
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
    meta = frappe.get_meta("Item")

    start = max(cint(start or 0), 0)
    page_len = max(1, min(cint(page_len or 10), 50))

    item_code = cstr(txt).strip()
    brand = cstr(filters.get("brand")).strip()
    item_group = cstr(filters.get("item_group")).strip()
    tenure = cstr(filters.get("tenure")).strip()
    years_months = cstr(filters.get("years_months")).strip()
    product = cstr(filters.get("product")).strip()

    conditions = ["ifnull(disabled, 0) = 0"]
    values = {
        "start": start,
        "page_len": page_len,
    }

    if item_code:
        values["item_code"] = f"%{item_code}%"
        conditions.append(
            "("
            "name like %(item_code)s "
            "or ifnull(item_name, '') like %(item_code)s "
            "or ifnull(description, '') like %(item_code)s"
            ")"
        )

    if brand and meta.has_field("brand"):
        values["brand"] = f"%{brand}%"
        conditions.append("ifnull(brand, '') like %(brand)s")

    if item_group and meta.has_field("item_group"):
        values["item_group"] = f"%{item_group}%"
        conditions.append("ifnull(item_group, '') like %(item_group)s")

    if product:
        values["product"] = f"%{product}%"
        conditions.append(
            "("
            "name like %(product)s "
            "or ifnull(item_name, '') like %(product)s "
            "or ifnull(description, '') like %(product)s"
            ")"
        )

    tenure_fields = [
        fieldname
        for fieldname in ["tenure", "custom_tenure", "renewal_option"]
        if meta.has_field(fieldname)
    ]
    if tenure and tenure_fields:
        values["tenure"] = f"%{tenure}%"
        conditions.append(
            "(" + " or ".join([f"ifnull(`{fieldname}`, '') like %(tenure)s" for fieldname in tenure_fields]) + ")"
        )

    tenure_normalized = tenure.strip().lower()
    if tenure_normalized == "years" and meta.has_field("years"):
        conditions.append("ifnull(years, 0) > 0")
    elif tenure_normalized == "months" and meta.has_field("months"):
        conditions.append("ifnull(months, 0) > 0")

    years_months_clauses = []
    if years_months:
        values["years_months"] = f"%{years_months}%"
        if meta.has_field("years") and tenure_normalized != "months":
            years_months_clauses.append("cast(ifnull(years, '') as char) like %(years_months)s")
        if meta.has_field("months") and tenure_normalized != "years":
            years_months_clauses.append("cast(ifnull(months, '') as char) like %(years_months)s")
        if meta.has_field("years") and meta.has_field("months") and tenure_normalized not in {"years", "months"}:
            years_months_clauses.append(
                "concat(ifnull(years, ''), ' year ', ifnull(months, ''), ' month') like %(years_months)s"
            )
        if years_months_clauses:
            conditions.append("(" + " or ".join(years_months_clauses) + ")")

    tenure_summary_parts = []
    if meta.has_field("tenure"):
        tenure_summary_parts.append("ifnull(tenure, '')")

    if meta.has_field("years"):
        tenure_summary_parts.append("concat(ifnull(years, ''), 'Y')")
    if meta.has_field("months"):
        tenure_summary_parts.append("concat(ifnull(months, ''), 'M')")

    tenure_summary_sql = (
        f"concat_ws(' ', {', '.join(tenure_summary_parts)})"
        if tenure_summary_parts
        else "''"
    )

    rows = frappe.db.sql(
        f"""
        select
            name,
            ifnull(item_name, '') as item_name,
            ifnull(brand, '') as brand,
            {tenure_summary_sql} as tenure_summary
        from `tabItem`
        where {' and '.join(conditions)}
        order by name asc
        limit %(start)s, %(page_len)s
        """,
        values,
        as_list=True,
    )

    return rows

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
def get_customer_options(search_text="", limit=20):
    """Get customer options for autocomplete"""
    try:
        limit = int(limit or 20)
    except Exception:
        limit = 20
    limit = max(1, min(limit, 50))

    txt = (search_text or "").strip()
    where = ["ifnull(party_name, '') != ''"]
    values = {"limit": limit}

    if txt:
        where.append("party_name like %(txt)s")
        values["txt"] = f"%{txt}%"

    rows = frappe.db.sql(
        f"""
        select distinct party_name
        from `tabQuotation`
        where {' and '.join(where)}
        order by party_name asc
        limit %(limit)s
        """,
        values,
        as_dict=True,
    )

    return [r.get("party_name") for r in rows if r.get("party_name")]

@frappe.whitelist()
def get_party_link_details(link_doctype="", link_name="", parenttypes=None, limit=100):
    """Return linked addresses / contacts for a party without client-side Dynamic Link access."""
    link_doctype = cstr(link_doctype).strip()
    link_name = cstr(link_name).strip()

    try:
        limit = max(1, min(cint(limit or 100), 200))
    except Exception:
        limit = 100

    parenttypes = frappe.parse_json(parenttypes) if isinstance(parenttypes, str) else (parenttypes or [])
    requested_parenttypes = [cstr(pt).strip() for pt in parenttypes if cstr(pt).strip()]
    allowed_parenttypes = [pt for pt in requested_parenttypes if pt in {"Address", "Contact"}] or ["Address", "Contact"]

    out = {
        "addresses": [],
        "contacts": [],
        "customer_address": "",
        "shipping_address": "",
        "contact_person": "",
        "company_address": "",
    }

    if not link_doctype or not link_name or not frappe.db.exists(link_doctype, link_name):
        return out

    try:
        doc = frappe.get_doc(link_doctype, link_name)
    except Exception:
        return out

    if not frappe.has_permission(doctype=link_doctype, ptype="read", doc=doc):
        return out

    if link_doctype == "Customer":
        out["customer_address"] = cstr(
            doc.get("customer_primary_address")
            or doc.get("primary_address")
            or doc.get("customer_address")
        ).strip()
        out["shipping_address"] = cstr(
            doc.get("shipping_address_name")
            or doc.get("shipping_address")
        ).strip()
        out["contact_person"] = cstr(
            doc.get("customer_primary_contact")
            or doc.get("primary_contact")
            or doc.get("default_contact")
        ).strip()
    elif link_doctype == "Company":
        out["company_address"] = cstr(
            doc.get("company_address")
            or doc.get("default_address")
        ).strip()

    placeholders = ", ".join(["%s"] * len(allowed_parenttypes))
    rows = frappe.db.sql(
        f"""
        select distinct parent, parenttype
        from `tabDynamic Link`
        where link_doctype = %s
          and link_name = %s
          and parenttype in ({placeholders})
          and ifnull(parent, '') != ''
        order by modified desc, creation desc
        limit %s
        """,
        [link_doctype, link_name, *allowed_parenttypes, limit],
        as_dict=True,
    )

    for row in rows or []:
        parent = cstr(row.get("parent")).strip()
        parenttype = cstr(row.get("parenttype")).strip()
        if not parent:
            continue
        if parenttype == "Address" and parent not in out["addresses"]:
            out["addresses"].append(parent)
        elif parenttype == "Contact" and parent not in out["contacts"]:
            out["contacts"].append(parent)

    if link_doctype == "Customer":
        if not out["customer_address"] and out["addresses"]:
            out["customer_address"] = out["addresses"][0]
        if not out["shipping_address"]:
            out["shipping_address"] = out["addresses"][1] if len(out["addresses"]) > 1 else (out["addresses"][0] if out["addresses"] else "")
        if not out["customer_address"] and out["shipping_address"]:
            out["customer_address"] = out["shipping_address"]
        if not out["shipping_address"] and out["customer_address"]:
            out["shipping_address"] = out["customer_address"]
        if not out["contact_person"] and out["contacts"]:
            out["contact_person"] = out["contacts"][0]
    elif link_doctype == "Company":
        if not out["company_address"] and out["addresses"]:
            out["company_address"] = out["addresses"][0]

    return out

@frappe.whitelist()
def get_users_basic_info(users):
    """Get basic info for multiple users"""
    users = frappe.parse_json(users) if isinstance(users, str) else users
    if not users:
        return []
    return frappe.get_all(
        "User",
        filters={"name": ["in", users]},
        fields=["name", "full_name", "user_image"]
    )


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
def get_sales_person_details(sales_person=None, employee=None):
    """Get sales person or employee details"""
    def first_non_empty(*values):
        for value in values:
            if value:
                return value
        return ""

    out = {
        "name": sales_person or "",
        "email": "",
        "mobile": "",
        "designation": "",
    }

    if sales_person:
        try:
            sp_meta = frappe.get_meta("Sales Person")
            sp_fields = [
                fieldname
                for fieldname in [
                    "sales_person_name",
                    "employee_name",
                    "employee",
                    "email_id",
                    "email",
                    "mobile_no",
                    "mobile",
                    "phone",
                    "contact_no",
                    "designation",
                ]
                if sp_meta.has_field(fieldname)
            ]
            sp = frappe.db.get_value("Sales Person", sales_person, sp_fields, as_dict=True) if sp_fields else None
            sp = sp or {}

            out["name"] = first_non_empty(sp.get("sales_person_name"), sp.get("employee_name"), out["name"])
            out["email"] = first_non_empty(sp.get("email_id"), sp.get("email"))
            out["mobile"] = first_non_empty(
                sp.get("mobile_no"),
                sp.get("mobile"),
                sp.get("phone"),
                sp.get("contact_no"),
            )
            out["designation"] = first_non_empty(sp.get("designation"))
            employee = employee or sp.get("employee")
        except Exception:
            pass

    if employee:
        try:
            emp_meta = frappe.get_meta("Employee")
            emp_fields = [
                fieldname
                for fieldname in [
                    "employee_name",
                    "designation",
                    "company_email",
                    "personal_email",
                    "prefered_email",
                    "cell_number",
                    "personal_mobile_no",
                    "mobile_no",
                ]
                if emp_meta.has_field(fieldname)
            ]
            emp = frappe.db.get_value("Employee", employee, emp_fields, as_dict=True) if emp_fields else None
            emp = emp or {}

            out["name"] = first_non_empty(out["name"], emp.get("employee_name"), employee)
            out["designation"] = first_non_empty(out["designation"], emp.get("designation"))
            out["email"] = first_non_empty(
                out["email"],
                emp.get("company_email"),
                emp.get("personal_email"),
                emp.get("prefered_email"),
            )
            out["mobile"] = first_non_empty(
                out["mobile"],
                emp.get("cell_number"),
                emp.get("personal_mobile_no"),
                emp.get("mobile_no"),
            )
        except Exception:
            pass

    return out


@frappe.whitelist()
def get_quotation_analytics(quotation=None):
    """Get analytics for a quotation (placeholder for future enhancements)"""
    if not quotation:
        return {
            "brandwise": {"total": 0, "rows": []},
            "stage_amounts": [],
            "sales_profit": {"sales": 0, "supplier": 0, "commission": 0, "profit": 0},
        }

    try:
        doc = frappe.get_doc("Quotation", quotation)
        items = doc.get("items") or []

        def as_float(value):
            try:
                if value is None:
                    return 0.0
                if isinstance(value, str):
                    cleaned = value.replace(",", "").strip()
                    cleaned = "".join(ch for ch in cleaned if ch.isdigit() or ch in ".-")
                    if not cleaned:
                        return 0.0
                    return float(cleaned)
                return float(value)
            except Exception:
                return 0.0

        # Calculate brand totals
        brand_totals = {}
        grand_total = 0.0
        for item in items:
            brand = (item.get("brand") or "Others").strip() or "Others"
            qty = as_float(item.get("qty"))
            rate = as_float(item.get("rate"))
            amount = as_float(item.get("amount")) or (qty * rate)
            if amount <= 0:
                continue
            brand_totals[brand] = as_float(brand_totals.get(brand)) + amount
            grand_total += amount

        brand_rows = []
        for brand, amount in sorted(brand_totals.items(), key=lambda entry: entry[1], reverse=True)[:3]:
            pct = (amount / grand_total * 100.0) if grand_total > 0 else 0.0
            brand_rows.append({"brand": brand, "amount": amount, "percentage": pct})

        total_amount = as_float(doc.get("grand_total") or doc.get("total") or 0)

        return {
            "brandwise": {"total": grand_total, "rows": brand_rows},
            "stage_amounts": [],
            "sales_profit": {"sales": total_amount, "supplier": 0, "commission": 0, "profit": 0},
        }

    except Exception as e:
        return {
            "brandwise": {"total": 0, "rows": []},
            "stage_amounts": [],
            "sales_profit": {"sales": 0, "supplier": 0, "commission": 0, "profit": 0},
        }


@frappe.whitelist()
def make_quotation_from_quotation(source_name, target_doc=None):
    """Placeholder for future quotation to quotation conversion"""
    return {}


@frappe.whitelist()
def get_list_data(start=0, page_length=20, status="", probability="", owners=None, filters="[]"):
    """
    Quotation list data with full filtering:
      - status: exact match (Draft, Submitted, etc.)
      - owners: list / csv / json => owner IN (...) OR _assign contains
      - filters: advanced filters array supporting child tables & rich operators

    Returns: {"data": [...], "total": <int>}
    """
    # -------- normalize basic args --------
    try:
        start = int(start or 0)
    except Exception:
        start = 0
    try:
        page_length = int(page_length or 20)
    except Exception:
        page_length = 20

    parent_doctype = "Quotation"
    conditions = ["docstatus != 2"]  # Exclude deleted documents
    values = {}

    # -------- permissions --------
    current_user = frappe.session.user
    permission_filter = "1=0"  # fail closed if permission resolver errors
    try:
        from renewal_module.user_permissions import quotation_permission_query

        pf = quotation_permission_query(current_user)
        if isinstance(pf, str):
            pf = pf.strip()
            permission_filter = pf if pf else "1=1"
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Quotation get_list_data permission filter error")

    if permission_filter != "1=1":
        conditions.append(f"({permission_filter})")

    # -------- helpers --------
    parent_meta = frappe.get_meta(parent_doctype)
    core_parent_fields = {
        "name",
        "owner",
        "creation",
        "modified",
        "docstatus",
        "idx",
        "_assign",
        "_comments",
        "_liked_by",
        "_seen",
        "_user_tags",
    }

    def get_child_table_for_field(parent_dt, fieldname):
        """Return child doctype name if `fieldname` is in any child table of parent_dt, else None."""
        try:
            meta = frappe.get_meta(parent_dt)
            for df in meta.fields:
                if df.fieldtype == "Table":
                    child_meta = frappe.get_meta(df.options)
                    if fieldname in [f.fieldname for f in child_meta.fields]:
                        return df.options
        except Exception:
            pass
        return None

    # map of common Quotation fields
    FIELD = {
        "status": "status",
        "customer": "party_name",
        "amount": "grand_total",
        "owner": "owner",
        "date": "transaction_date",
        "tags": "_user_tags",
    }

    # -------- simple filters (top-level args) --------
    if status:
        conditions.append(f"`status` = %(status)s")
        values["status"] = status

    # owners: accept json/list/csv and match owner or _assign contains
    if owners:
        owner_list = owners
        if isinstance(owner_list, str):
            try:
                parsed = json.loads(owner_list)
                if isinstance(parsed, (list, tuple)):
                    owner_list = parsed
                else:
                    owner_list = [owner_list]
            except Exception:
                owner_list = [x.strip() for x in owner_list.split(",") if x.strip()]
        if isinstance(owner_list, (list, tuple)):
            owner_list = [o for o in owner_list if o]

        if isinstance(owner_list, (list, tuple)) and owner_list:
            owner_placeholders = []
            for i, o in enumerate(owner_list):
                k = f"own_{i}"
                values[k] = o
                owner_placeholders.append(f"%({k})s")
            
            assign_clauses = []
            for i, o in enumerate(owner_list):
                k = f"ass_{i}"
                values[k] = f'%"{o}"%'
                assign_clauses.append(f"`_assign` LIKE %({k})s")

            owner_in_clause = f"`owner` IN ({', '.join(owner_placeholders)})"
            assign_or = f"({' OR '.join(assign_clauses)})" if assign_clauses else "0=1"
            conditions.append(f"({owner_in_clause} OR {assign_or})")

    # -------- advanced filters (array or JSON string) --------
    filters_obj = []
    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else filters
        except Exception:
            filters_obj = []

    try:
        from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import (
            add_to_date, get_timespan_date_range
        )
    except Exception:
        add_to_date = None
        get_timespan_date_range = None

    def add_condition_for(field, operator, val):
        """Add a condition for a field, detecting child table presence."""
        if "." in field:
            field = field.split(".")[-1]

        child_table = get_child_table_for_field(parent_doctype, field)
        parent_has_field = field in core_parent_fields or parent_meta.has_field(field)
        if not child_table and not parent_has_field:
            return
        key = f"f_{field}_{len(values)}"

        def field_condition(sql_cond, **kwargs):
            if child_table:
                conditions.append(
                    f"`tab{parent_doctype}`.`name` IN (SELECT parent FROM `tab{child_table}` WHERE {sql_cond})"
                )
            else:
                conditions.append(sql_cond)
            for k, v in kwargs.items():
                values[k] = v

        op = (operator or "=").lower()

        if op in ("=", "=="):
            field_condition(f"`{field}` = %({key})s", **{key: val})
        elif op in ("!=", "<>", "not equals"):
            field_condition(f"`{field}` != %({key})s", **{key: val})
        elif op in ("like", "contains"):
            field_condition(f"`{field}` LIKE %({key})s", **{key: f"%{val}%"})
        elif op in ("not like", "does not contain"):
            field_condition(f"`{field}` NOT LIKE %({key})s", **{key: f"%{val}%"})
        elif op in (">", "<", ">=", "<=", "after", "before", "on or after", "on or before"):
            sql_op = {
                ">": ">", "<": "<", ">=": ">=", "<=": "<=",
                "after": ">", "before": "<", "on or after": ">=", "on or before": "<="
            }[op]
            field_condition(f"`{field}` {sql_op} %({key})s", **{key: val})
        elif op == "in":
            seq = val
            if isinstance(seq, str):
                try:
                    parsed = json.loads(seq)
                    if isinstance(parsed, (list, tuple)):
                        seq = parsed
                    else:
                        seq = [seq]
                except Exception:
                    seq = [v.strip() for v in seq.split(",") if v.strip()]
            if isinstance(seq, (list, tuple)) and seq:
                ph = []
                for i, v in enumerate(seq):
                    kk = f"{key}_{i}"
                    ph.append(f"%({kk})s")
                    values[kk] = v
                field_condition(f"`{field}` IN ({', '.join(ph)})")
        elif op in ("not in", "nin"):
            seq = val
            if isinstance(seq, str):
                try:
                    parsed = json.loads(seq)
                    if isinstance(parsed, (list, tuple)):
                        seq = parsed
                    else:
                        seq = [seq]
                except Exception:
                    seq = [v.strip() for v in seq.split(",") if v.strip()]
            if isinstance(seq, (list, tuple)) and seq:
                ph = []
                for i, v in enumerate(seq):
                    kk = f"{key}_{i}"
                    ph.append(f"%({kk})s")
                    values[kk] = v
                field_condition(f"`{field}` NOT IN ({', '.join(ph)})")
        elif op == "between":
            rng = val
            if isinstance(rng, str) and "," in rng:
                rng = [v.strip() for v in rng.split(",")]
            if isinstance(rng, (list, tuple)) and len(rng) == 2:
                k1, k2 = f"{key}_start", f"{key}_end"
                field_condition(f"`{field}` BETWEEN %({k1})s AND %({k2})s", **{k1: rng[0], k2: rng[1]})
        elif op == "timespan" and get_timespan_date_range:
            start_date, end_date = get_timespan_date_range(val) or (None, None)
            if start_date and end_date:
                start_dt = get_datetime(f"{start_date} 00:00:00")
                end_dt = get_datetime(f"{end_date} 23:59:59")
                k1, k2 = f"{key}_start", f"{key}_end"
                field_condition(f"`{field}` BETWEEN %({k1})s AND %({k2})s", **{k1: start_dt, k2: end_dt})
        elif op == "is":
            val_lower = str(val).lower()
            if child_table:
                if val_lower in ("set", "not null"):
                    conditions.append(
                        f"`tab{parent_doctype}`.`name` IN ("
                        f"SELECT parent FROM `tab{child_table}` WHERE `{field}` IS NOT NULL AND `{field}` != ''"
                        f")"
                    )
                elif val_lower in ("not set", "null"):
                    conditions.append(
                        f"(`tab{parent_doctype}`.`name` NOT IN ("
                        f"SELECT parent FROM `tab{child_table}` WHERE `{field}` IS NOT NULL AND `{field}` != ''"
                        f"))"
                    )
            else:
                if val_lower in ("set", "not null"):
                    conditions.append(f"`{field}` IS NOT NULL AND `{field}` != ''")
                elif val_lower in ("not set", "null"):
                    conditions.append(f"(`{field}` IS NULL OR `{field}` = '')")

    # normalize each advanced filter entry and append conditions
    for f in (filters_obj or []):
        try:
            if isinstance(f, dict):
                field = f.get("fieldname") or f.get("field") or ""
                operator = (f.get("operator") or "=").lower()
                val = f.get("value")
            elif isinstance(f, (list, tuple)):
                if len(f) >= 4:
                    _, field, operator, val = f[:4]
                else:
                    field, operator, val = f[0], f[1], f[2]
            else:
                continue
        except Exception:
            continue
        if not field:
            continue
        add_condition_for(field, operator, val)

    # -------- build query --------
    where_clause = " AND ".join(conditions)

    # dynamic fields to select
    meta = frappe.get_meta(parent_doctype)
    def has(fieldname):
        try:
            return meta.has_field(fieldname)
        except Exception:
            return False

    select_fields = ["name", "modified", "_comments", "_assign", "owner", "status"]
    
    # Optional fields
    if has("party_name"):           select_fields.append("party_name")
    if has("customer"):             select_fields.append("customer")
    if has("quotation_to"):           select_fields.append("quotation_to")
    if has("grand_total"):          select_fields.append("grand_total")
    if has("transaction_date"):     select_fields.append("transaction_date")
    if has("company"):              select_fields.append("company")

    cols = ", ".join([f"`{c}`" for c in select_fields])

    # total count
    try:
        total = frappe.db.sql(
            f"SELECT COUNT(*) FROM `tab{parent_doctype}` WHERE {where_clause}",
            values
        )[0][0]
    except Exception:
        total = 0

    # data fetch
    try:
        rows = frappe.db.sql(
            f"""
            SELECT {cols}
            FROM `tab{parent_doctype}`
            WHERE {where_clause}
            ORDER BY modified DESC
            LIMIT {start}, {page_length}
            """,
            values,
            as_dict=True
        )
    except Exception as e:
        frappe.log_error(f"Error fetching quotation list: {str(e)}")
        rows = []

    # derive comment_count
    for r in rows:
        # Keep list payload compatible with UI code that still reads `customer`.
        if not r.get("customer") and r.get("party_name"):
            r["customer"] = r.get("party_name")

        raw = r.get("_comments") or "[]"
        try:
            parsed = json.loads(raw)
            r["comment_count"] = len(parsed) if isinstance(parsed, list) else 0
        except Exception:
            r["comment_count"] = 0

    return {"data": rows, "total": total}


import frappe

@frappe.whitelist()
def get_sales_order_count(quotation_name):
    if not quotation_name:
        return {"count": 0, "fieldUsed": ""}

    result = frappe.db.sql("""
        SELECT COUNT(DISTINCT so.name) as count
        FROM `tabSales Order` so
        INNER JOIN `tabSales Order Item` soi ON soi.parent = so.name
        WHERE soi.prevdoc_docname = %(q)s
    """, {"q": quotation_name}, as_dict=True)

    return {
        "count": result[0]["count"] if result else 0,
        "fieldUsed": "items.prevdoc_docname"
    }



def update_opportunity_notes_html(opportunity):
    """Update notes_html field with a rendered list of notes"""
    if not opportunity.meta.has_field("notes_html"):
        return
        
    if not opportunity.notes:
        opportunity.notes_html = ""
        return

    # Safe sort by added_on (descending)
    sorted_notes = sorted(
        opportunity.notes, 
        key=lambda x: x.added_on.strftime("%Y-%m-%d %H:%M:%S") if x.added_on else "", 
        reverse=True
    )

    html = "<div class='opportunity-notes'>"
    for n in sorted_notes:
        added_by = frappe.get_value("User", n.added_by, "full_name") or n.added_by
        added_on = frappe.utils.format_datetime(n.added_on) if n.added_on else ""
        note_content = n.note or ""
        html += f"""
            <div style='margin-bottom: 10px; padding: 8px; border: 1px solid #d1d8dd; border-radius: 4px; background-color: #f8f9fa;'>
                <div style='font-weight: bold; font-size: 0.9em;'>{added_by} <span style='color: #8d99a6; font-weight: normal;'>({added_on})</span></div>
                <div style='margin-top: 5px;'>{note_content}</div>
            </div>
        """
    html += "</div>"
    opportunity.notes_html = html

@frappe.whitelist()
def add_opportunity_note(opportunity_name, note_text):
    """Add a note row to Opportunity.notes and return updated list"""
    if not frappe.db.exists("Quotation", opportunity_name):
        frappe.throw("Quotation not found")
    opportunity = frappe.get_doc("Quotation", opportunity_name)
    opportunity.append("notes", {
        "note": note_text,
        "added_on": now_datetime(),
        "added_by": frappe.session.user,
    })
    update_opportunity_notes_html(opportunity)
    opportunity.save(ignore_permissions=True)
    frappe.db.commit()
    return get_opportunity_notes(opportunity_name)

@frappe.whitelist()
def update_opportunity_note(opportunity_name, idx, note_text):
    """Edit a note by idx"""
    if not frappe.db.exists("Quotation", opportunity_name):
        frappe.throw("Quotation not found")
    opportunity = frappe.get_doc("Quotation", opportunity_name)
    found = False
    for n in opportunity.notes:
        if n.idx == int(idx):
            n.note = note_text
            n.added_on = now_datetime() # Update timestamp on edit?
            n.added_by = frappe.session.user
            found = True
            break
    if not found:
        frappe.throw("Note not found")
    update_opportunity_notes_html(opportunity)
    opportunity.save(ignore_permissions=True)
    frappe.db.commit()
    return get_opportunity_notes(opportunity_name)

@frappe.whitelist()
def delete_opportunity_note(opportunity_name, idx):
    """Delete a note by idx"""
    if not frappe.db.exists("Quotation", opportunity_name):
        frappe.throw("Quotation not found")
    opportunity = frappe.get_doc("Quotation", opportunity_name)
    found = False
    for n in opportunity.notes:
        if n.idx == int(idx):
            opportunity.remove(n)
            found = True
            break
    if not found:
        frappe.throw("Note not found")
    update_opportunity_notes_html(opportunity)
    opportunity.save(ignore_permissions=True)
    frappe.db.commit()
    return get_opportunity_notes(opportunity_name)

@frappe.whitelist()
def get_opportunity_notes(opportunity_name):
    """Return all notes for an opportunity"""
    if not frappe.db.exists("Quotation", opportunity_name):
        return []
    opportunity = frappe.get_doc("Quotation", opportunity_name)
    return [
        {
            "note": n.note,
            "timestamp": n.added_on,
            "owner": n.added_by,
            "created_by": frappe.get_value("User", n.added_by, "full_name") or n.added_by,
            "idx": n.idx
        }
        for n in opportunity.notes
    ]

@frappe.whitelist()
def get_permitted_call_list(opportunity_name=None):
    if not opportunity_name:
        return []

    current_user = frappe.session.user

    docs = frappe.get_all(
        "Call List",
        filters={"reference":"Quotation", "reference_to": opportunity_name},
        fields=[
            "name", "name1", "subject", "status", "owner",
            "start_date", "start_timing", "end_date", "end_timing",
            "description"
        ],
        order_by="creation desc"
    )

    permitted = []
    shared_docs = frappe.share.get_shared("Call List", user=current_user) or []

    for d in docs:
        docname = d.name
        has_perm = frappe.has_permission("Call List", "read", docname)
        is_shared = docname in shared_docs
        is_everyone = frappe.db.exists(
            "DocShare",
            {
                "share_doctype": "Call List",
                "share_name": docname,
                "everyone": 1,
                "read": 1
            }
        )
        if has_perm or is_shared or is_everyone:
            permitted.append(d)

    return permitted

@frappe.whitelist()
def get_permitted_appointments(opportunity_name=None):
    if not opportunity_name:
        return []

    current_user = frappe.session.user

    docs = frappe.get_all(
        "Appointment",
        filters={"reference":"Quotation", "reference_to": opportunity_name},
        fields=[
            "name",
            "party",
            "custom_subject",
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
def add_custom_comment(docname, content):
    if not docname or not content:
        frappe.throw("Missing required fields")

    # Normalize mention markup so notify_mentions works safely
    content = _normalize_comment_mentions(content)

    doc = frappe.get_doc("Quotation", docname)
    doc.add_comment("Comment", content)

    frappe.db.commit()

    return {"message": "Comment added successfully"}


@frappe.whitelist()
def get_opportunity_comments(docname, limit=20):
    if not docname:
        frappe.throw("Missing required fields")

    doc = frappe.get_doc("Quotation", docname)
    if not doc.has_permission("read"):
        raise frappe.PermissionError

    return frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Quotation",
            "reference_name": docname,
            "comment_type": "Comment",
        },
        fields=["name", "creation", "content", "owner", "comment_type", "reference_doctype", "reference_name"],
        order_by="creation desc",
        limit_page_length=max(1, min(cint(limit or 20), 100)),
    )

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
            if label:
                node["data-mention-name"] = label

    return str(soup)

@frappe.whitelist()
def get_opportunity_activity(doctype, name, start=0, limit=20):
    """Return only comments for the opportunity."""
    try:
        if not name:
            return []
        
        name = str(name).strip()
        
        # Use get_list which is often more reliable for raw fetching
        comments = frappe.get_list(
            "Comment",
            filters={
                "reference_doctype": "Quotation",
                "reference_name": name
            },
            fields=["name", "comment_type", "owner as sender", "creation", "content", "reference_doctype", "reference_name"],
            order_by="creation desc",
            ignore_permissions=True
        )
        
        for c in comments:
            c.sender_full_name = frappe.utils.get_fullname(c.sender)
            c.communication_type = "Comment"
            c.communication_date = c.creation
            
        return comments
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_opportunity_activity Failed")
        return []