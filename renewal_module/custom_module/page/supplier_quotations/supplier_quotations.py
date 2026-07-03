import json

import frappe
from frappe.utils import cint, cstr
from frappe.utils import get_datetime, now_datetime


@frappe.whitelist()
def get_filters():
    owners = frappe.get_all(
        "User",
        filters={"enabled": 1},
        fields=["name as value", "full_name as label", "user_image"],
    )
    return {"owners": owners}


@frappe.whitelist()
def get_customer_options(search_text="", limit=20):
    """Return supplier names for the party autocomplete used by the page."""
    try:
        limit = int(limit or 20)
    except Exception:
        limit = 20
    limit = max(1, min(limit, 50))

    txt = (search_text or "").strip()
    where = ["ifnull(supplier, '') != ''"]
    values = {"limit": limit}

    if txt:
        where.append("(supplier like %(txt)s or ifnull(supplier_name, '') like %(txt)s)")
        values["txt"] = f"%{txt}%"

    rows = frappe.db.sql(
        f"""
        select distinct
            ifnull(supplier_name, supplier) as party_name
        from `tabSupplier Quotation`
        where {' and '.join(where)}
        order by party_name asc
        limit %(limit)s
        """,
        values,
        as_dict=True,
    )

    return [r.get("party_name") for r in rows if r.get("party_name")]


@frappe.whitelist()
def get_users_basic_info(users):
    users = frappe.parse_json(users) if isinstance(users, str) else users
    if not users:
        return []
    return frappe.get_all(
        "User",
        filters={"name": ["in", users]},
        fields=["name", "full_name", "user_image"],
    )


@frappe.whitelist()
def get_sales_person_details(sales_person=None, employee=None):
    # Reuse existing implementation used by quotation page.
    from renewal_module.custom_module.page.quotation_list.quotation_list import get_sales_person_details as _impl

    return _impl(sales_person=sales_person, employee=employee)


@frappe.whitelist()
def get_quotation_analytics(quotation=None):
    if not quotation:
        return {
            "brandwise": {"total": 0, "rows": []},
            "stage_amounts": [],
            "sales_profit": {"sales": 0, "supplier": 0, "commission": 0, "profit": 0},
        }

    try:
        doc = frappe.get_doc("Supplier Quotation", quotation)
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
    except Exception:
        return {
            "brandwise": {"total": 0, "rows": []},
            "stage_amounts": [],
            "sales_profit": {"sales": 0, "supplier": 0, "commission": 0, "profit": 0},
        }


@frappe.whitelist()
def make_quotation_from_quotation(source_name, target_doc=None):
    return {}


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
def make_supplier_quotation_from_opportunity(opportunity_name, items_payload=None):
    """
    Create Supplier Quotation from Opportunity with taxes and all details filled.
    """
    from erpnext.controllers.accounts_controller import get_default_taxes_and_charges, get_taxes_and_charges
    from frappe.utils import cstr, get_link_to_form
	
    try:
        # Parse payload
        if isinstance(items_payload, str):
            items_payload = frappe.parse_json(items_payload)
        else:
            items_payload = items_payload or {}
		
        # Get Opportunity document
        opportunity = frappe.get_doc("Opportunity", opportunity_name)
		
        # Create new Supplier Quotation
        supplier_quotation = frappe.new_doc("Supplier Quotation")
		
        # Map supplier from payload (comes from first item's supplier)
        supplier_name = cstr(items_payload.get("supplier") or "").strip()
        supplier_quotation.supplier = supplier_name
        supplier_quotation.supplier_name = supplier_name
        supplier_quotation.opportunity = opportunity_name
		
        # Set transaction dates
        supplier_quotation.transaction_date = items_payload.get("transaction_date") or frappe.utils.nowdate()
        supplier_quotation.valid_till = items_payload.get("valid_till") or frappe.utils.add_days(frappe.utils.nowdate(), 7)
		
        # Map company and user info
        supplier_quotation.company = cstr(items_payload.get("company") or frappe.defaults.get_defaults().get("company") or "").strip()
        supplier_quotation.owner = cstr(items_payload.get("owner") or frappe.session.user).strip()
		
        # Map contact
        if items_payload.get("contact_person"):
            supplier_quotation.contact_person = cstr(items_payload.get("contact_person")).strip()
		
        # Map sales team if provided
        if isinstance(items_payload.get("sales_team"), list):
            for team_member in items_payload.get("sales_team"):
                if isinstance(team_member, dict):
                    supplier_quotation.append("sales_team", {
                        "sales_person": team_member.get("sales_person"),
                        "allocated_percentage": team_member.get("allocated_percentage", 0),
                        "commission_rate": team_member.get("commission_rate", 0),
                    })
		
        # Add items
        selected_row_names = set(items_payload.get("selected_row_names", []))
        items_list = items_payload.get("items", [])
		
        for item_data in items_list:
            if selected_row_names and str(item_data.get("name") or "").strip() not in selected_row_names:
                continue
			
            # Create new item row
            new_item = {
                "item_code": item_data.get("item_code", ""),
                "item_name": item_data.get("item_name", ""),
                "description": item_data.get("description", ""),
                "qty": item_data.get("qty", 1),
                "uom": item_data.get("uom") or item_data.get("stock_uom") or "Nos",
                "rate": item_data.get("rate", 0),
                "amount": item_data.get("amount", 0),
                "supplier": item_data.get("supplier", ""),
            }
			
            # Map custom fields from original item
            for key in item_data:
                if key.startswith("custom_") and key not in new_item:
                    new_item[key] = item_data.get(key)
			
            supplier_quotation.append("items", new_item)
		
        # Get and set taxes from default template
        try:
            taxes_template = get_default_taxes_and_charges(
                "Purchase Taxes and Charges Template",
                company=supplier_quotation.company
            ) or {}
			
            if isinstance(taxes_template, dict) and taxes_template.get("taxes"):
                supplier_quotation.update(taxes_template)
            else:
                # Fallback: try to get any available template
                fallback_template = frappe.db.get_value(
                    "Purchase Taxes and Charges Template",
                    {"company": supplier_quotation.company, "disabled": 0},
                    "name",
                    order_by="is_default desc, modified desc",
                )
                if fallback_template:
                    fallback_taxes = get_taxes_and_charges(
                        "Purchase Taxes and Charges Template",
                        fallback_template
                    )
                    if fallback_taxes:
                        supplier_quotation.taxes_and_charges = fallback_template
                        supplier_quotation.set("taxes", [])
                        for tax_row in fallback_taxes:
                            supplier_quotation.append("taxes", tax_row)
        except Exception as tax_error:
            frappe.log_error(f"Error setting taxes: {str(tax_error)}", "make_supplier_quotation_from_opportunity")
		
        # Run totals calculation directly. Avoid set_missing_values(), which can fail
        # on heavily customized doctypes when expected docfields are absent.
        try:
            supplier_quotation.run_method("calculate_taxes_and_totals")
        except Exception as calc_error:
            frappe.log_error(f"Error calculating totals: {str(calc_error)}", "make_supplier_quotation_from_opportunity")
		
        # Save the document
        supplier_quotation.insert()
		
        return {
            "success": True,
            "supplier_quotation_name": supplier_quotation.name,
            "message": f"Supplier Quotation {get_link_to_form('Supplier Quotation', supplier_quotation.name)} created successfully"
        }
	
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "make_supplier_quotation_from_opportunity")
        return {
            "success": False,
            "message": f"Error creating Supplier Quotation: {str(e)}"
        }


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def search_items_for_link(doctype, txt, searchfield, start, page_len, filters=None):
    from renewal_module.custom_module.page.quotation_list.quotation_list import search_items_for_link as _impl

    return _impl(doctype, txt, searchfield, start, page_len, filters)


# @frappe.whitelist()
# def get_list_data(start=0, page_length=20, status="", probability="", owners=None, filters="[]"):
#     parent_doctype = "Supplier Quotation"

#     try:
#         start = int(start or 0)
#     except Exception:
#         start = 0
#     try:
#         page_length = int(page_length or 20)
#     except Exception:
#         page_length = 20

#     start = max(0, start)
#     page_length = max(1, min(page_length, 200))

#     conditions = ["docstatus != 2"]
#     values = {"start": start, "page_length": page_length}

#     if status:
#         conditions.append("`status` = %(status)s")
#         values["status"] = status

#     if owners:
#         owner_list = owners
#         if isinstance(owner_list, str):
#             try:
#                 parsed = json.loads(owner_list)
#                 owner_list = parsed if isinstance(parsed, (list, tuple)) else [owner_list]
#             except Exception:
#                 owner_list = [x.strip() for x in owner_list.split(",") if x.strip()]

#         if isinstance(owner_list, (list, tuple)):
#             owner_list = [o for o in owner_list if o]

#         if owner_list:
#             owner_placeholders = []
#             assign_clauses = []
#             for i, owner in enumerate(owner_list):
#                 own_key = f"own_{i}"
#                 ass_key = f"ass_{i}"
#                 values[own_key] = owner
#                 values[ass_key] = f'%"{owner}"%'
#                 owner_placeholders.append(f"%({own_key})s")
#                 assign_clauses.append(f"`_assign` like %({ass_key})s")

#             owner_in_clause = f"`owner` in ({', '.join(owner_placeholders)})"
#             conditions.append(f"({owner_in_clause} or {' or '.join(assign_clauses)})")

#     filter_rows = []
#     if filters:
#         try:
#             filter_rows = json.loads(filters) if isinstance(filters, str) else (filters or [])
#         except Exception:
#             filter_rows = []

#     meta = frappe.get_meta(parent_doctype)
#     core_fields = {
#         "name",
#         "owner",
#         "creation",
#         "modified",
#         "docstatus",
#         "idx",
#         "_assign",
#         "_comments",
#         "_liked_by",
#         "_seen",
#         "_user_tags",
#     }

#     def add_condition(fieldname, operator, value):
#         fieldname = cstr(fieldname).strip()
#         if not fieldname:
#             return
#         if "." in fieldname:
#             fieldname = fieldname.split(".")[-1]
#         if fieldname not in core_fields and not meta.has_field(fieldname):
#             return

#         op = cstr(operator or "=").strip().lower()
#         key = f"f_{fieldname}_{len(values)}"

#         if op in ("=", "=="):
#             conditions.append(f"`{fieldname}` = %({key})s")
#             values[key] = value
#         elif op in ("!=", "<>", "not equals"):
#             conditions.append(f"`{fieldname}` != %({key})s")
#             values[key] = value
#         elif op in ("like", "contains"):
#             conditions.append(f"`{fieldname}` like %({key})s")
#             values[key] = f"%{value}%"
#         elif op in ("not like", "does not contain"):
#             conditions.append(f"`{fieldname}` not like %({key})s")
#             values[key] = f"%{value}%"
#         elif op in (">", "<", ">=", "<="):
#             conditions.append(f"`{fieldname}` {op} %({key})s")
#             values[key] = value
#         elif op == "in":
#             seq = value
#             if isinstance(seq, str):
#                 try:
#                     parsed = json.loads(seq)
#                     seq = parsed if isinstance(parsed, (list, tuple)) else [seq]
#                 except Exception:
#                     seq = [v.strip() for v in seq.split(",") if v.strip()]
#             if isinstance(seq, (list, tuple)) and seq:
#                 placeholders = []
#                 for i, val in enumerate(seq):
#                     seq_key = f"{key}_{i}"
#                     placeholders.append(f"%({seq_key})s")
#                     values[seq_key] = val
#                 conditions.append(f"`{fieldname}` in ({', '.join(placeholders)})")

#     if isinstance(filter_rows, list):
#         for row in filter_rows:
#             if not row:
#                 continue
#             if isinstance(row, dict):
#                 add_condition(row.get("field") or row.get("fieldname"), row.get("operator") or row.get("op") or "=", row.get("value"))
#                 continue
#             if isinstance(row, (list, tuple)):
#                 if len(row) >= 4:
#                     add_condition(row[1], row[2], row[3])
#                 elif len(row) == 3:
#                     add_condition(row[0], row[1], row[2])

#     where_sql = " and ".join(conditions) if conditions else "1=1"

#     rows = frappe.db.sql(
#         f"""
#         select
#             name,
#             supplier,
#             supplier_name,
#             status,
#             grand_total,
#             transaction_date,
#             valid_till,
#             owner,
#             creation,
#             modified,
#             _assign,
#             docstatus,
#             currency
#         from `tab{parent_doctype}`
#         where {where_sql}
#         order by modified desc
#         limit %(start)s, %(page_length)s
#         """,
#         values,
#         as_dict=True,
#     )

#     total = frappe.db.sql(
#         f"""
#         select count(*) as total
#         from `tab{parent_doctype}`
#         where {where_sql}
#         """,
#         values,
#         as_dict=True,
#     )[0]["total"]

#     for row in rows:
#         row["party_name"] = row.get("supplier_name") or row.get("supplier") or ""

#     return {"data": rows, "total": total}

@frappe.whitelist()
def get_list_data(start=0, page_length=20, status="", probability="", owners=None, filters="[]"):
    parent_doctype = "Supplier Quotation"

    try:
        start = int(start or 0)
    except Exception:
        start = 0
    try:
        page_length = int(page_length or 20)
    except Exception:
        page_length = 20

    start = max(0, start)
    page_length = max(1, min(page_length, 200))

    conditions = ["docstatus != 2"]
    values = {
        "start": start,
        "page_length": page_length,
    }

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

    if status and parent_meta.has_field("status"):
        conditions.append("`status` = %(status)s")
        values["status"] = status

    if owners:
        owner_list = owners
        if isinstance(owner_list, str):
            try:
                parsed = json.loads(owner_list)
                owner_list = parsed if isinstance(parsed, (list, tuple)) else [owner_list]
            except Exception:
                owner_list = [x.strip() for x in owner_list.split(",") if x.strip()]

        if isinstance(owner_list, (list, tuple)):
            owner_list = [o for o in owner_list if o]

        if owner_list:
            owner_placeholders = []
            assign_clauses = []

            for i, owner in enumerate(owner_list):
                owner_key = f"own_{i}"
                assign_key = f"ass_{i}"

                values[owner_key] = owner
                values[assign_key] = f'%"{owner}"%'

                owner_placeholders.append(f"%({owner_key})s")
                assign_clauses.append(f"`_assign` LIKE %({assign_key})s")

            owner_in = f"`owner` IN ({', '.join(owner_placeholders)})"
            assign_in = f"({' OR '.join(assign_clauses)})" if assign_clauses else "0=1"
            conditions.append(f"({owner_in} OR {assign_in})")

    filters_obj = []
    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else (filters or [])
        except Exception:
            filters_obj = []

    try:
        from frappe.utils import get_datetime
        from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import get_timespan_date_range
    except Exception:
        get_datetime = None
        get_timespan_date_range = None

    def add_condition_for(fieldname, operator, value):
        if not fieldname:
            return

        if "." in fieldname:
            fieldname = fieldname.split(".")[-1]

        child_table = get_child_table_for_field(parent_doctype, fieldname)
        parent_has_field = fieldname in core_parent_fields or parent_meta.has_field(fieldname)
        if not child_table and not parent_has_field:
            return

        key = f"f_{fieldname}_{len(values)}"
        op = (operator or "=").lower()

        def append_condition(sql_cond, **bind_values):
            if child_table:
                conditions.append(
                    f"`tab{parent_doctype}`.`name` IN (SELECT parent FROM `tab{child_table}` WHERE {sql_cond})"
                )
            else:
                conditions.append(sql_cond)

            for bind_key, bind_value in bind_values.items():
                values[bind_key] = bind_value

        if op in ("=", "=="):
            append_condition(f"`{fieldname}` = %({key})s", **{key: value})
        elif op in ("!=", "<>", "not equals"):
            append_condition(f"`{fieldname}` != %({key})s", **{key: value})
        elif op in ("like", "contains"):
            append_condition(f"`{fieldname}` LIKE %({key})s", **{key: f"%{value}%"})
        elif op in ("not like", "does not contain"):
            append_condition(f"`{fieldname}` NOT LIKE %({key})s", **{key: f"%{value}%"})
        elif op in (">", "<", ">=", "<=", "after", "before", "on or after", "on or before"):
            sql_op = {
                ">": ">",
                "<": "<",
                ">=": ">=",
                "<=": "<=",
                "after": ">",
                "before": "<",
                "on or after": ">=",
                "on or before": "<=",
            }[op]
            append_condition(f"`{fieldname}` {sql_op} %({key})s", **{key: value})
        elif op in ("in", "not in", "nin"):
            sequence = value
            if isinstance(sequence, str):
                try:
                    parsed = json.loads(sequence)
                    sequence = parsed if isinstance(parsed, (list, tuple)) else [sequence]
                except Exception:
                    sequence = [v.strip() for v in sequence.split(",") if v.strip()]

            if isinstance(sequence, (list, tuple)) and sequence:
                placeholders = []
                for i, row_value in enumerate(sequence):
                    row_key = f"{key}_{i}"
                    values[row_key] = row_value
                    placeholders.append(f"%({row_key})s")

                in_operator = "NOT IN" if op in ("not in", "nin") else "IN"
                append_condition(f"`{fieldname}` {in_operator} ({', '.join(placeholders)})")
        elif op == "between":
            date_range = value
            if isinstance(date_range, str) and "," in date_range:
                date_range = [v.strip() for v in date_range.split(",")]

            if isinstance(date_range, (list, tuple)) and len(date_range) == 2:
                start_key = f"{key}_start"
                end_key = f"{key}_end"
                append_condition(
                    f"`{fieldname}` BETWEEN %({start_key})s AND %({end_key})s",
                    **{start_key: date_range[0], end_key: date_range[1]},
                )
        elif op == "timespan" and get_timespan_date_range and get_datetime:
            from_date, to_date = get_timespan_date_range(value) or (None, None)
            if from_date and to_date:
                start_key = f"{key}_start"
                end_key = f"{key}_end"
                append_condition(
                    f"`{fieldname}` BETWEEN %({start_key})s AND %({end_key})s",
                    **{
                        start_key: get_datetime(f"{from_date} 00:00:00"),
                        end_key: get_datetime(f"{to_date} 23:59:59"),
                    },
                )
        elif op == "is":
            lowered = cstr(value).strip().lower()
            if lowered in ("set", "not null"):
                append_condition(f"`{fieldname}` IS NOT NULL AND `{fieldname}` != ''")
            elif lowered in ("not set", "null"):
                append_condition(f"(`{fieldname}` IS NULL OR `{fieldname}` = '')")
        elif op == "fiscal year" and value:
            fy = frappe.db.get_value("Fiscal Year", value, ["year_start_date", "year_end_date"], as_dict=True)
            if fy:
                start_key = f"{key}_start"
                end_key = f"{key}_end"
                append_condition(
                    f"`{fieldname}` BETWEEN %({start_key})s AND %({end_key})s",
                    **{start_key: fy.year_start_date, end_key: fy.year_end_date},
                )

    for raw_filter in filters_obj or []:
        try:
            if isinstance(raw_filter, dict):
                fieldname = raw_filter.get("fieldname") or raw_filter.get("field") or ""
                operator = raw_filter.get("operator") or "="
                value = raw_filter.get("value")
            elif isinstance(raw_filter, (list, tuple)):
                if len(raw_filter) >= 4:
                    _, fieldname, operator, value = raw_filter[:4]
                elif len(raw_filter) >= 3:
                    fieldname, operator, value = raw_filter[:3]
                else:
                    continue
            else:
                continue
        except Exception:
            continue

        if fieldname:
            add_condition_for(fieldname, operator, value)

    where_clause = " AND ".join(conditions)

    def has(fieldname):
        try:
            return parent_meta.has_field(fieldname)
        except Exception:
            return False

    select_fields = ["name", "modified", "_comments", "_assign", "owner"]
    optional_fields = [
        "status",
        "supplier",
        "supplier_name",
        "grand_total",
        "base_grand_total",
        "rounded_total",
        "transaction_date",
        "valid_till",
        "currency",
    ]

    for fieldname in optional_fields:
        if has(fieldname):
            select_fields.append(fieldname)

    cols = ", ".join([f"`{col}`" for col in select_fields])

    try:
        total = frappe.db.sql(
            f"SELECT COUNT(*) FROM `tab{parent_doctype}` WHERE {where_clause}",
            values,
        )[0][0]
    except Exception:
        total = 0

    try:
        rows = frappe.db.sql(
            f"""
            SELECT {cols}
            FROM `tab{parent_doctype}`
            WHERE {where_clause}
            ORDER BY modified DESC
            LIMIT %(start)s, %(page_length)s
            """,
            values,
            as_dict=True,
        )
    except Exception:
        rows = []

    for row in rows:
        if not row.get("supplier_name") and row.get("supplier"):
            row["supplier_name"] = row.get("supplier")

        raw_comments = row.get("_comments") or "[]"
        try:
            parsed = json.loads(raw_comments)
            row["comment_count"] = len(parsed) if isinstance(parsed, list) else 0
        except Exception:
            row["comment_count"] = 0

    return {"data": rows, "total": total}


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
    if not frappe.db.exists("Supplier Quotation", opportunity_name):
        frappe.throw("Supplier Quotation not found")
    opportunity = frappe.get_doc("Supplier Quotation", opportunity_name)
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
    if not frappe.db.exists("Supplier Quotation", opportunity_name):
        frappe.throw("Supplier Quotation not found")
    opportunity = frappe.get_doc("Supplier Quotation", opportunity_name)
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
    if not frappe.db.exists("Supplier Quotation", opportunity_name):
        frappe.throw("Supplier Quotation not found")
    opportunity = frappe.get_doc("Supplier Quotation", opportunity_name)
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
    if not frappe.db.exists("Supplier Quotation", opportunity_name):
        return []
    opportunity = frappe.get_doc("Supplier Quotation", opportunity_name)
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
        filters={"reference":"Supplier Quotation", "reference_to": opportunity_name},
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
        filters={"reference":"Supplier Quotation", "reference_to": opportunity_name},
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

    doc = frappe.get_doc("Supplier Quotation", docname)
    doc.add_comment("Comment", content)

    frappe.db.commit()

    return {"message": "Comment added successfully"}


@frappe.whitelist()
def get_opportunity_comments(docname, limit=20):
    if not docname:
        frappe.throw("Missing required fields")

    doc = frappe.get_doc("Supplier Quotation", docname)
    if not doc.has_permission("read"):
        raise frappe.PermissionError

    return frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Supplier Quotation",
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
                "reference_doctype": "Supplier Quotation",
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