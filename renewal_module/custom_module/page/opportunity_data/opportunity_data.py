import frappe
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt
from erpnext.setup.utils import get_exchange_rate

@frappe.whitelist()
def get_filters():
    owners = frappe.get_all(
        "User",
        filters={"enabled": 1},
        fields=["name as value", "full_name as label", "user_image"]
    )
    return {"owners": owners}


@frappe.whitelist()
def get_customer_options(search_text="", limit=20):
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

    # Prefer customer party_name values when available
    where_customer = where[:]
    where_customer.append("ifnull(opportunity_from, '') = 'Customer'")

    rows = frappe.db.sql(
        f"""
        select distinct party_name
        from `tabOpportunity`
        where {' and '.join(where_customer)}
        order by party_name asc
        limit %(limit)s
        """,
        values,
        as_dict=True,
    )

    if not rows:
        rows = frappe.db.sql(
            f"""
            select distinct party_name
            from `tabOpportunity`
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
        fields=["name", "full_name", "user_image"]
    )


@frappe.whitelist()
def get_sales_person_details(sales_person=None, employee=None):
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
def make_supplier_quotation_from_opportunity(source_name, target_doc=None):
    def update_item(source, target, source_parent):
        spq_rate = flt(source.get("spq_rate"))
        source_rate = flt(source.get("rate"))
        qty = flt(target.get("qty") or source.get("qty") or 0)

        target.rate = spq_rate if spq_rate > 0 else source_rate
        if target.rate and qty:
            target.amount = flt(target.rate) * qty

    return get_mapped_doc(
        "Opportunity",
        source_name,
        {
            "Opportunity": {"doctype": "Supplier Quotation", "field_map": {"name": "opportunity"}},
            "Opportunity Item": {
                "doctype": "Supplier Quotation Item",
                "field_map": {"uom": "stock_uom"},
                "postprocess": update_item,
            },
        },
        target_doc,
    )


@frappe.whitelist()
def make_quotation_from_opportunity(source_name, target_doc=None, selected_items=None):
    selected_items = selected_items or frappe.flags.get("args", {}).get("selected_items") or []
    selected_items = frappe.parse_json(selected_items) if isinstance(selected_items, str) else selected_items

    selected_row_names = set()
    for row in selected_items:
        if isinstance(row, dict):
            row_name = (row.get("name") or "").strip()
        else:
            row_name = str(row or "").strip()
        if row_name:
            selected_row_names.add(row_name)

    if not selected_row_names:
        frappe.throw("Please select at least one item")

    valid_rows = frappe.get_all(
        "Opportunity Item",
        filters={"parent": source_name, "name": ["in", list(selected_row_names)]},
        pluck="name",
    )
    valid_row_set = set(valid_rows or [])
    if not valid_row_set:
        frappe.throw("Selected items are not available in this Opportunity")

    def set_missing_values(source, target):
        from erpnext.controllers.accounts_controller import get_default_taxes_and_charges, get_taxes_and_charges

        quotation = frappe.get_doc(target)
        company_currency = frappe.get_cached_value("Company", quotation.company, "default_currency")

        if company_currency == quotation.currency:
            exchange_rate = 1
        else:
            exchange_rate = get_exchange_rate(
                quotation.currency, company_currency, quotation.transaction_date, args="for_selling"
            )

        quotation.conversion_rate = exchange_rate

        taxes = get_default_taxes_and_charges("Sales Taxes and Charges Template", company=quotation.company)
        if taxes.get("taxes"):
            quotation.update(taxes)
        else:
            # Fallback for setups where no template is marked as default.
            fallback_template = frappe.db.get_value(
                "Sales Taxes and Charges Template",
                {"company": quotation.company, "disabled": 0},
                "name",
                order_by="is_default desc, modified desc",
            )
            fallback_rows = get_taxes_and_charges("Sales Taxes and Charges Template", fallback_template) or []
            if fallback_template and fallback_rows:
                quotation.taxes_and_charges = fallback_template
                quotation.set("taxes", [])
                for row in fallback_rows:
                    quotation.append("taxes", row)

        quotation.run_method("set_missing_values")
        quotation.run_method("calculate_taxes_and_totals")
        if not source.get("items", []):
            quotation.opportunity = source.name

    return get_mapped_doc(
        "Opportunity",
        source_name,
        {
            "Opportunity": {
                "doctype": "Quotation",
                "field_map": {"opportunity_from": "quotation_to", "name": "enq_no"},
            },
            "Opportunity Item": {
                "doctype": "Quotation Item",
                "field_map": {
                    "parent": "prevdoc_docname",
                    "parenttype": "prevdoc_doctype",
                    "uom": "stock_uom",
                },
                "add_if_empty": True,
                "condition": lambda doc: doc.name in valid_row_set,
            },
        },
        target_doc,
        set_missing_values,
    )


@frappe.whitelist()
def get_opportunity_analytics(opportunity=None):
    if not opportunity:
        return {
            "brandwise": {"total": 0, "rows": []},
            "stage_amounts": [],
            "sales_profit": {"sales": 0, "supplier": 0, "commission": 0, "profit": 0},
        }

    doc = frappe.get_doc("Opportunity", opportunity)
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

    def first_positive(*values):
        for val in values:
            num = as_float(val)
            if num > 0:
                return num
        return 0.0

    recommended_exact = {}
    recommended_by_item = {}
    try:
        sq_docs = frappe.get_all(
            "Supplier Quotation",
            filters={"opportunity": doc.name},
            fields=["name", "modified"],
            order_by="modified desc",
            limit_page_length=500,
        )
        sq_names = [row.get("name") for row in sq_docs if row.get("name")]

        if sq_names:
            sq_item_meta = frappe.get_meta("Supplier Quotation Item")
            recommender_field = ""
            if sq_item_meta.has_field("recommender"):
                recommender_field = "recommender"
            elif sq_item_meta.has_field("recommended_"):
                recommender_field = "recommended_"

            if not recommender_field:
                raise Exception("No recommender flag field found in Supplier Quotation Item")

            recommended_rows = frappe.get_all(
                "Supplier Quotation Item",
                filters={
                    "parent": ["in", sq_names],
                    recommender_field: 1,
                },
                fields=["parent", "item_code", "qty", "amount"],
                limit_page_length=2000,
            )

            recommended_parent_set = {
                (row.get("parent") or "").strip()
                for row in recommended_rows
                if (row.get("parent") or "").strip()
            }

            selected_parent = ""
            for sq_name in sq_names:
                if sq_name in recommended_parent_set:
                    selected_parent = sq_name
                    break

            scoped_rows = [
                row for row in recommended_rows
                if (row.get("parent") or "").strip() == selected_parent
            ] if selected_parent else []

            for row in scoped_rows:
                item_code = (row.get("item_code") or "").strip()
                if not item_code:
                    continue
                qty_key = round(as_float(row.get("qty")), 6)
                amount = as_float(row.get("amount"))
                if amount <= 0:
                    continue

                exact_key = (item_code, qty_key)
                if amount > as_float(recommended_exact.get(exact_key)):
                    recommended_exact[exact_key] = amount
                if amount > as_float(recommended_by_item.get(item_code)):
                    recommended_by_item[item_code] = amount
    except Exception:
        recommended_exact = {}
        recommended_by_item = {}

    orc_exact = {}
    orc_by_item = {}
    try:
        orc_meta = frappe.get_meta("ORC List")
        opportunity_field = ""
        for candidate in ["opportunity_id", "opportunity"]:
            if orc_meta.has_field(candidate):
                opportunity_field = candidate
                break

        if opportunity_field:
            orc_filters = {
                opportunity_field: doc.name,
                "docstatus": ["!=", 2],
            }
            if orc_meta.has_field("status"):
                orc_filters["status"] = ["!=", "Duplicate"]

            orc_lists = frappe.get_all(
                "ORC List",
                filters=orc_filters,
                fields=["name"],
                limit_page_length=500,
            )
            orc_list_names = [row.get("name") for row in orc_lists if row.get("name")]

            if orc_list_names:
                orc_items = frappe.get_all(
                    "ORC Item",
                    filters={"parent": ["in", orc_list_names]},
                    fields=["item_code", "qty", "commission_amount"],
                    limit_page_length=2000,
                )

                for row in orc_items:
                    item_code = (row.get("item_code") or "").strip()
                    if not item_code:
                        continue

                    qty_key = round(as_float(row.get("qty")), 6)
                    commission_amount = as_float(row.get("commission_amount"))
                    if commission_amount <= 0:
                        continue

                    exact_key = (item_code, qty_key)
                    if commission_amount > as_float(orc_exact.get(exact_key)):
                        orc_exact[exact_key] = commission_amount
                    if commission_amount > as_float(orc_by_item.get(item_code)):
                        orc_by_item[item_code] = commission_amount
    except Exception:
        orc_exact = {}
        orc_by_item = {}

    def is_closed_won(stage):
        text = (stage or "").strip().lower()
        return ("won" in text) or ("converted" in text) or ("closed won" in text)

    def is_excluded_brand_stage(stage):
        text = (stage or "").strip().lower()
        if not text:
            return False
        return (
            ("dead" in text)
            or ("closed won" in text)
            or ("closed lost" in text)
            or ("won" in text)
            or ("converted" in text)
            or ("lost" in text)
        )

    won_items = []
    for item in items:
        stage = item.get("sales_stage") or item.get("status") or doc.get("status") or doc.get("sales_stage")
        if is_closed_won(stage):
            won_items.append(item)

    active_brand_items = []
    for item in items:
        stage = item.get("sales_stage") or item.get("status") or doc.get("sales_stage") or doc.get("status")
        if is_excluded_brand_stage(stage):
            continue
        active_brand_items.append(item)

    brand_totals = {}
    grand_total = 0.0
    for item in active_brand_items:
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

    stage_names = []
    stage_order = {}
    try:
        sales_stage_rows = frappe.get_all("Sales Stage", fields=["name", "idx"], order_by="idx asc")
        stage_names = [row.get("name") for row in sales_stage_rows if row.get("name")]
        stage_order = {
            row.get("name"): int(row.get("idx") or 0)
            for row in sales_stage_rows
            if row.get("name")
        }
    except Exception:
        stage_names = []
        stage_order = {}

    stage_amount_map = {stage: 0.0 for stage in stage_names}

    if items:
        for item in items:
            stage = (item.get("sales_stage") or doc.get("sales_stage") or "").strip()
            if not stage:
                continue
            qty = as_float(item.get("qty"))
            rate = as_float(item.get("rate"))
            amount = as_float(item.get("amount")) or (qty * rate)
            if amount <= 0:
                continue
            if stage not in stage_amount_map:
                stage_amount_map[stage] = 0.0
            stage_amount_map[stage] += amount
    else:
        doc_stage = (doc.get("sales_stage") or "").strip()
        doc_amount = (
            as_float(doc.get("opportunity_amount"))
            or as_float(doc.get("amount"))
            or as_float(doc.get("expected_revenue"))
            or 0.0
        )
        if doc_stage and doc_amount > 0:
            if doc_stage not in stage_amount_map:
                stage_amount_map[doc_stage] = 0.0
            stage_amount_map[doc_stage] += doc_amount

    stage_amounts = [
        {
            "stage": stage,
            "amount": amount,
            "stage_idx": stage_order.get(stage, 9999),
        }
        for stage, amount in stage_amount_map.items()
        if amount > 0
    ]

    stage_amounts.sort(key=lambda row: (int(row.get("stage_idx") or 9999), str(row.get("stage") or "")))

    total_sales = 0.0
    total_supplier = 0.0
    total_commission = 0.0
    for item in won_items:
        qty = as_float(item.get("qty"))
        rate = as_float(item.get("rate"))
        amount = as_float(item.get("amount")) or (qty * rate)
        if amount <= 0:
            continue

        item_code = (item.get("item_code") or "").strip()
        recommended_supplier_amount = 0.0
        orc_list_commission_amount = 0.0
        if item_code:
            exact_key = (item_code, round(qty, 6))
            recommended_supplier_amount = first_positive(
                recommended_exact.get(exact_key),
                recommended_by_item.get(item_code),
            )
            orc_list_commission_amount = first_positive(
                orc_exact.get(exact_key),
                orc_by_item.get(item_code),
            )

        supplier_amount = first_positive(
            recommended_supplier_amount,
            item.get("supplier_amount"),
            item.get("supplier_amt"),
            item.get("supplier_total"),
            item.get("purchase_amount"),
            item.get("buying_amount"),
            item.get("supplier_rate") and (as_float(item.get("supplier_rate")) * qty),
            item.get("cost") and (as_float(item.get("cost")) * qty),
            item.get("cost_price") and (as_float(item.get("cost_price")) * qty),
            item.get("valuation_rate") and (as_float(item.get("valuation_rate")) * qty),
        )
        commission_amount = first_positive(
            orc_list_commission_amount,
            item.get("orc_amount"),
            item.get("commission_amount"),
            item.get("commission"),
            item.get("orc"),
            item.get("agent_commission"),
        )

        total_sales += amount
        total_supplier += supplier_amount
        total_commission += commission_amount

    profit = total_sales - total_supplier - total_commission

    return {
        "brandwise": {"total": grand_total, "rows": brand_rows},
        "stage_amounts": stage_amounts,
        "sales_profit": {
            "sales": total_sales,
            "supplier": total_supplier,
            "commission": total_commission,
            "profit": profit,
        },
    }


from frappe import _
import frappe, json
from datetime import datetime
from frappe.utils import get_datetime

@frappe.whitelist()
def get_list_data(start=0, page_length=20, status="", probability="", owners=None, filters="[]"):
    """
    Opportunity list data with full filtering:
      - status: exact match
      - probability: "min-max" => BETWEEN, or single numeric => "="
      - owners: list / csv / json => owner IN (...) OR _assign contains
      - filters: advanced filters array (like frappe list) supporting child tables & rich operators

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

    parent_doctype = "Opportunity"
    conditions = ["1=1"]
    values = {}

    # -------- permissions (align with hook in renewal_module.user_permissions) --------
    current_user = frappe.session.user
    permission_filter = "1=1"
    try:
        from renewal_module.user_permissions import opportunity_permission_query  # type: ignore
        pf = opportunity_permission_query(current_user)
        if isinstance(pf, str) and pf.strip():
            permission_filter = pf
    except Exception:
        # If hook import fails for any reason, fall back to no extra filter.
        pass

    if permission_filter and permission_filter != "1=1":
        conditions.append(permission_filter)
    elif permission_filter == "1=0":
        conditions.append(permission_filter)

    # -------- helpers --------
    def get_child_table_for_field(parent_dt, fieldname):
        """Return child doctype name if `fieldname` is in any child table of parent_dt, else None."""
        meta = frappe.get_meta(parent_dt)
        for df in meta.fields:
            if df.fieldtype == "Table":
                child_meta = frappe.get_meta(df.options)
                if fieldname in [f.fieldname for f in child_meta.fields]:
                    return df.options
        return None

    # map of common Opportunity fields (change if your schema differs)
    FIELD = {
        "status": "status",                   # sometimes "opportunity_status" in custom setups
        "probability": "probability",         # numeric 0..100
        "expected_closing": "expected_closing",  # or "expected_close_date"
        "amount": "amount",                   # resolved dynamically below when possible
        "owner": "owner",                     # creator; adjust if you use "opportunity_owner"
        "account": "party_name",              # often "party_name" (with opportunity_from = Customer/Lead)
        "industry": "industry",               # present in some setups or via link child; optional
        "region": "territory",                # "territory" is common for region
        "product": "item_group",              # or a custom product field
        "contact": "contact_person",          # if you link a specific Contact
        "tags": "_user_tags",
        "sales_stage":"sales_stage",
    }

    # -------- simple filters (top-level args) --------
    if status:
        conditions.append(f"`{FIELD['status']}` = %(status)s")
        values["status"] = status

    # probability: support "min-max" or single numeric
    if probability:
        prob_str = str(probability).strip()
        rng = None
        # "50-75" or "50 - 75"
        if "-" in prob_str:
            parts = [p.strip() for p in prob_str.split("-") if p.strip()]
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                rng = (int(parts[0]), int(parts[1]))
        if rng:
            values["prob_start"] = rng[0]
            values["prob_end"] = rng[1]
            conditions.append(f"`{FIELD['probability']}` BETWEEN %(prob_start)s AND %(prob_end)s")
        else:
            try:
                pv = int(float(prob_str))
                values["prob_val"] = pv
                conditions.append(f"`{FIELD['probability']}` = %(prob_val)s")
            except Exception:
                # ignore invalid probability format
                pass

    # owners: accept json/list/csv and match owner or _assign contains (best-effort)
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
            # owner IN (...) OR _assign LIKE each (OR-ed)
            owner_placeholders = []
            for i, o in enumerate(owner_list):
                k = f"own_{i}"
                values[k] = o
                owner_placeholders.append(f"%({k})s")
            # _assign matching
            assign_clauses = []
            for i, o in enumerate(owner_list):
                k = f"ass_{i}"
                values[k] = f'%"{o}"%'  # _assign is a JSON array string -> match the quoted email/id
                assign_clauses.append(f"`_assign` LIKE %({k})s")

            owner_in_clause = f"`{FIELD['owner']}` IN ({', '.join(owner_placeholders)})"
            assign_or = f"({' OR '.join(assign_clauses)})" if assign_clauses else "0=1"
            conditions.append(f"({owner_in_clause} OR {assign_or})")

    # -------- advanced filters (array or JSON string) --------
    # You already send saved_filters; support both array and string forms.
    filters_obj = []
    if filters:
        try:
            filters_obj = json.loads(filters) if isinstance(filters, str) else filters
        except Exception:
            filters_obj = []

    # Optional: import helpers for timespan; reuse what tickets page uses
    try:
        from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import (
            add_to_date, get_timespan_date_range
        )
    except Exception:
        add_to_date = None
        get_timespan_date_range = None

    def add_condition_for(field, operator, val):
        """
        Add a condition for a field, detecting child table presence.
        Supports all operators used in the Tickets handler.
        """
        # strip doctype prefix if provided like "Opportunity.field"
        if "." in field:
            field = field.split(".")[-1]

        child_table = get_child_table_for_field(parent_doctype, field)
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

        elif op == "fiscal year":
            if val:
                fy = frappe.db.get_value("Fiscal Year", val, ["year_start_date", "year_end_date"], as_dict=True)
                if fy:
                    k1, k2 = f"{key}_start", f"{key}_end"
                    field_condition(f"`{field}` BETWEEN %({k1})s AND %({k2})s", **{k1: fy.year_start_date, k2: fy.year_end_date})

    # normalize each advanced filter entry and append conditions
    for f in (filters_obj or []):
        try:
            if isinstance(f, dict):
                field = f.get("fieldname") or f.get("field") or ""
                operator = (f.get("operator") or "=").lower()
                val = f.get("value")
            elif isinstance(f, (list, tuple)):
                # [DT, field, op, val] or [field, op, val]
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

    # dynamic fields to select (only include if exists to avoid errors)
    meta = frappe.get_meta(parent_doctype)
    def has(fieldname):
        return meta.has_field(fieldname)

    def first_existing_field(candidates):
        for fieldname in candidates:
            if has(fieldname):
                return fieldname
        return None

    amount_field = first_existing_field([
        "opportunity_amount",
        "amount",
        "expected_revenue",
        "base_opportunity_amount",
        "grand_total",
        "base_grand_total",
    ])
    if amount_field:
        FIELD["amount"] = amount_field

    select_fields = ["name", "modified", "_comments", "_assign", "owner"]
    # Optional fields
    if has(FIELD["status"]):              select_fields.append(FIELD["status"])
    if has(FIELD["sales_stage"]):              select_fields.append(FIELD["sales_stage"])
    if has(FIELD["probability"]):         select_fields.append(FIELD["probability"])
    if has(FIELD["expected_closing"]):    select_fields.append(FIELD["expected_closing"])
    if amount_field:                       select_fields.append(amount_field)
    if has(FIELD["account"]):             select_fields.append(FIELD["account"])
    if has(FIELD.get("industry", "")):    select_fields.append(FIELD["industry"])
    if has(FIELD.get("region", "")):      select_fields.append(FIELD["region"])
    if has(FIELD.get("product", "")):     select_fields.append(FIELD["product"])
    if has(FIELD.get("contact", "")):     select_fields.append(FIELD["contact"])
    if has("opportunity_from"):           select_fields.append("opportunity_from")

    cols = ", ".join([f"`{c}`" for c in select_fields])

    # total count
    total = frappe.db.sql(
        f"SELECT COUNT(*) FROM `tab{parent_doctype}` WHERE {where_clause}",
        values
    )[0][0]

    # data fetch
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

    # derive comment_count (same pattern as tickets)
    for r in rows:
        raw = r.get("_comments") or "[]"
        try:
            parsed = json.loads(raw)
            r["comment_count"] = len(parsed) if isinstance(parsed, list) else 0
        except Exception:
            r["comment_count"] = 0

    # (Optional) enrich owner initials/image - copy your tickets logic if needed

    return {"data": rows, "total": total}
    frappe.msgprint("<pre>{}</pre>".format(frappe.as_json({filters})))
    owners = frappe.parse_json(owners) if owners else []
    adv_filters = frappe.parse_json(filters) if filters else []

    conds = ["docstatus < 2"]
    vals = {}

    if status:
        conds.append("status = %(status)s")
        vals["status"] = status

    if probability:
        try:
            lo, hi = [int(x) for x in probability.split("-")]
            conds.append("ifnull(probability,0) between %(lo)s and %(hi)s")
            vals.update({"lo": lo, "hi": hi})
        except:
            pass

    if owners:
        conds.append("owner in %(owners)s")
        vals["owners"] = tuple(owners)

    where = " and ".join(conds)

    total = frappe.db.sql(
        f"select count(*) from `tabOpportunity` where {where}",
        vals
    )[0][0]

    rows = frappe.db.sql(
        f"""
        select
            name,
            coalesce(title, name) as title,
            status,sales_stage,
            probability,
            opportunity_amount,
            expected_closing,
            owner,
            party_name,
            opportunity_from,
            modified,
            _assign
        from `tabOpportunity`
        where {where}
        order by modified desc
        limit %(start)s, %(limit)s
        """,
        dict(vals, start=int(start), limit=int(page_length)),
        as_dict=True
    )

    return {"data": rows, "total": total}