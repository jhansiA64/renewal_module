import frappe

@frappe.whitelist()
def get_contact_list(start=0, page_length=20, filters=None, saved_filters=None):
    import frappe, json

    start = int(start or 0)
    page_length = int(page_length or 20)

    conditions = []
    values = {}

    # ============================================================
    # 1) SIMPLE FILTERS
    # ============================================================
    simple_filters = {}
    if filters:
        try:
            simple_filters = frappe.parse_json(filters)
        except Exception:
            simple_filters = {}

    # Search filter (name, first/last name, email, phone)
    if simple_filters.get("search"):
        like = f"%{simple_filters.get('search')}%"
        conditions.append("""(
            name LIKE %(like)s OR
            first_name LIKE %(like)s OR
            last_name LIKE %(like)s OR
            email_id LIKE %(like)s OR
            mobile_no LIKE %(like)s OR
            phone LIKE %(like)s
        )""")
        values["like"] = like

    # Filter by status if exists (Active/Inactive)
    if simple_filters.get("status"):
        conditions.append("status = %(status)s")
        values["status"] = simple_filters.get("status")

    # ============================================================
    # 2) ADVANCED FILTERS (Type-2: saved_filters)
    # ============================================================
    adv_filters = []
    if saved_filters:
        try:
            adv_filters = frappe.parse_json(saved_filters)
        except Exception:
            adv_filters = []

        for f in adv_filters:
            if len(f) < 4:
                continue

            _, field, operator, val = f[0], f[1], f[2].lower(), f[3]
            key = f"adv_{field}_{len(values)}"

            # Between
            if operator == "between" and isinstance(val, list) and len(val) == 2:
                conditions.append(f"`{field}` BETWEEN %({key}_from)s AND %({key}_to)s")
                values[f"{key}_from"] = val[0]
                values[f"{key}_to"] = val[1]

            # IS / IS NOT SET
            elif operator == "is":
                if val.lower() == "set":
                    conditions.append(f"(`{field}` IS NOT NULL AND `{field}` != '')")
                elif val.lower() == "not set":
                    conditions.append(f"(`{field}` IS NULL OR `{field}` = '')")
                continue

            # LIKE/NOT LIKE
            elif operator in ("like", "contains", "not like"):
                neg = "NOT " if operator == "not like" else ""
                conditions.append(f"`{field}` {neg}LIKE %({key})s")
                values[key] = f"%{val}%" if operator == "contains" else val

            # Exact match
            elif operator == "=":
                conditions.append(f"`{field}` = %({key})s")
                values[key] = val

            # Not equal
            elif operator in ("!=", "<>"):
                conditions.append(f"`{field}` != %({key})s")
                values[key] = val

            # > , < , >= , <=
            elif operator in (">", "<", ">=", "<="):
                conditions.append(f"`{field}` {operator} %({key})s")
                values[key] = val

            # IN
            elif operator == "in":
                val_list = val.split(",") if isinstance(val, str) else val
                placeholders = []
                for i, v in enumerate(val_list):
                    subkey = f"{key}_{i}"
                    placeholders.append(f"%({subkey})s")
                    values[subkey] = v.strip()
                conditions.append(f"`{field}` IN ({','.join(placeholders)})")

    # ============================================================
    # 3) WHERE CLAUSE
    # ============================================================
    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # ============================================================
    # 4) MAIN QUERY — Contact fields
    # ============================================================
    query = f"""
        SELECT
            name,
            first_name,
            last_name,
            CONCAT_WS(' ', first_name, last_name) AS full_name,
            email_id,
            phone,
            mobile_no,
            gender,
            designation,
            modified,
            _comments
        FROM `tabContact`
        WHERE {where_clause}
        ORDER BY modified DESC
        LIMIT %(start)s, %(length)s
    """

    values["start"] = start
    values["length"] = page_length

    rows = frappe.db.sql(query, values, as_dict=True)

    # Comment count
    for r in rows:
        try:
            r["comment_count"] = len(json.loads(r._comments or "[]"))
        except:
            r["comment_count"] = 0

    # ============================================================
    # 5) TOTAL COUNT
    # ============================================================
    total = frappe.db.sql(
        f"SELECT COUNT(*) FROM `tabContact` WHERE {where_clause}",
        values
    )[0][0]

    return {"rows": rows, "total": total}




@frappe.whitelist()
def get_contact_filters():

    # 1️⃣ Fetch Linked Customers
    customers = frappe.get_all(
        "Customer",
        fields=["name", "customer_name"],
        order_by="customer_name asc"
    )

    # 2️⃣ Fetch Users (Owners)
    owners = frappe.get_all(
        "User",
        filters={"enabled": 1},
        fields=["name", "full_name"],
        order_by="full_name asc"
    )

    # 3️⃣ Distinct Gender values
    genders = frappe.db.get_list(
        "Contact",
        fields=["distinct gender as gender"]
    )
    gender_values = [g.gender for g in genders if g.gender]

    # 4️⃣ Distinct Designation values
    designations = frappe.db.get_list(
        "Contact",
        fields=["distinct designation as designation"]
    )
    designation_values = [d.designation for d in designations if d.designation]

    # 5️⃣ Status filter options
    status_values = ["Active", "Passive"]  # Standard Contact statuses

    return {
        "linked_customer": [
            {"value": c.name, "label": c.customer_name or c.name}
            for c in customers
        ],
        "owner": [
            {"value": u.name, "label": u.full_name or u.name}
            for u in owners
        ],
        "gender": gender_values,
        "designation": designation_values,
        "status": status_values
    }
