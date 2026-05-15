import frappe
from frappe.utils import flt
import json
from datetime import datetime
from frappe.utils import get_datetime
from frappe.utils import cint, cstr

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
def get_customer_options(search_text="", limit=20):
    """Get customer options for autocomplete"""
    try:
        limit = int(limit or 20)
    except Exception:
        limit = 20
    limit = max(1, min(limit, 50))

    txt = (search_text or "").strip()
    meta = frappe.get_meta("Customer Order Form")
    party_field = "party_name" if meta.has_field("party_name") else ("customer" if meta.has_field("customer") else "name")

    where = [f"ifnull(`{party_field}`, '') != ''"]
    values = {"limit": limit}

    if txt:
        where.append(f"`{party_field}` like %(txt)s")
        values["txt"] = f"%{txt}%"

    rows = frappe.db.sql(
        f"""
        select distinct ifnull(`{party_field}`, '') as party_name
        from `tabCustomer Order Form`
        where {' and '.join(where)}
        order by 1 asc
        limit %(limit)s
        """,
        values,
        as_dict=True,
    )

    return [r.get("party_name") for r in rows if r.get("party_name")]


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
        doc = frappe.get_doc("Customer Order Form", quotation)
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

    parent_doctype = "Customer Order Form"
    conditions = ["docstatus != 2"]  # Exclude deleted documents
    values = {}

    # -------- permissions --------
    current_user = frappe.session.user
    permission_filter = "1=1"
    try:
        from renewal_module import user_permissions as _up
        if hasattr(_up, "customer_order_form_permission_query"):
            pf = _up.customer_order_form_permission_query(current_user)
        elif hasattr(_up, "quotation_permission_query"):
            pf = _up.quotation_permission_query(current_user)
        else:
            pf = "1=1"
        if isinstance(pf, str) and pf.strip():
            permission_filter = pf
    except Exception:
        pass

    if permission_filter and permission_filter != "1=1":
        conditions.append(permission_filter)
    elif permission_filter == "1=0":
        conditions.append(permission_filter)

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

    # DEBUG LOGGING
    try:
        frappe.log_error(
            title="Customer Order Forms List Query Debug",
            message=f"SQL: SELECT ... FROM `tab{parent_doctype}` WHERE {where_clause}\nValues: {json.dumps(values, default=str)}\nUser: {current_user}"
        )
    except Exception as e:
        pass

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
        frappe.log_error(f"Error fetching customer order form list: {str(e)}")
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


@frappe.whitelist()
def create_customer_order_form(**kwargs):
    """Create a new Customer Order Form document"""
    try:
        # Create new document
        doc = frappe.get_doc({
            "doctype": "Customer Order Form",
            "docstatus": 0,
        })

        # Set basic fields from kwargs
        for key, value in kwargs.items():
            if key in ["name", "doctype", "docstatus", "creation", "modified", "owner", "modified_by"]:
                continue
            if hasattr(doc, key) or key in doc.meta.fields:
                doc.set(key, value)

        # Handle sales_team specifically
        if "sales_team" in kwargs and kwargs["sales_team"]:
            sales_team_data = kwargs["sales_team"]
            if isinstance(sales_team_data, str):
                try:
                    sales_team_data = json.loads(sales_team_data)
                except:
                    sales_team_data = []
            
            if isinstance(sales_team_data, list):
                doc.sales_team = []
                for row in sales_team_data:
                    if isinstance(row, dict):
                        doc.append("sales_team", {
                            "sales_person": row.get("sales_person"),
                            "allocated_percentage": row.get("allocated_percentage", 0),
                            "allocated_amount": row.get("allocated_amount", 0),
                            "commission_rate": row.get("commission_rate", 0),
                            "incentives": row.get("incentives", 0),
                        })

        # Save the document
        doc.save()
        
        return {
            "name": doc.name,
            "status": "success",
            "message": f"Customer Order Form {doc.name} created successfully"
        }

    except Exception as e:
        frappe.log_error(f"Error creating Customer Order Form: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }
