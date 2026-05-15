from functools import lru_cache

import frappe

TECH_SUPPORT_ROLES = (
    "L1 - Tech Support",
    "Tech Support",
    "L2 - Tech Support",
    "L3 - Tech Support",
)


def has_tech_support_role(user: str) -> bool:
    if not user:
        return False
    return any(role in frappe.get_roles(user) for role in TECH_SUPPORT_ROLES)


def is_technical_hierarchy_user(user: str) -> bool:
    """Allow technical hierarchy checks even if explicit Tech Support role is missing."""
    if not user:
        return False

    if has_tech_support_role(user):
        return True

    user_roles = set(frappe.get_roles(user) or [])
    if {"Support Team", "Renewal Support"}.intersection(user_roles):
        return True

    department = frappe.db.get_value("Employee", {"user_id": user}, "department")
    if department and "tech" in str(department).strip().lower():
        return True

    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return False

    # Fallback: if user is in Employee reports_to hierarchy, allow hierarchy-based visibility.
    if frappe.db.exists("Employee", {"reports_to": employee}):
        return True

    if frappe.db.get_value("Employee", employee, "reports_to"):
        return True

    return False


def is_tech_user_or_team(owner, user):
    """Keep runtime tech-team access aligned with `get_tech_team_users()` used in list filters."""
    if not owner or not user:
        return False

    return owner in set(get_tech_team_users(user))

 
def is_sales_user_or_team(sales_person, user):
 
    # Get employee from user
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return False
 
    sp = frappe.db.get_value(
        "Sales Person",
        {"employee": employee},
        ["name", "lft", "rgt"],
        as_dict=True
    )
 
    if not sp:
        return False
 
    # Same sales person

    if sp.name == sales_person:
        return True
 
    # Team lead → child sales persons

    children = frappe.db.get_all(
        "Sales Person",
        filters={
            "lft": (">", sp.lft),
            "rgt": ("<", sp.rgt),
            "is_group": 0
        },
        pluck="name"

    )
 
    return sales_person in children

 
def get_tech_team_users(user):
 
    users = {user}  # include self ALWAYS
    employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee_name:
        return list(users)

    employees = frappe.get_all(
        "Employee",
        fields=["name", "reports_to", "user_id"],
        ignore_permissions=True,
    )

    employees_by_name = {emp.get("name"): emp for emp in employees if emp.get("name")}
    reports_map = {}
    for emp in employees:
        reports_to = emp.get("reports_to")
        if reports_to:
            reports_map.setdefault(reports_to, []).append(emp.get("name"))

    # Include manager chain above current user.
    visited_up = set()
    cursor = employee_name
    while cursor and cursor not in visited_up:
        visited_up.add(cursor)
        manager = (employees_by_name.get(cursor) or {}).get("reports_to")
        if not manager:
            break
        manager_user = (employees_by_name.get(manager) or {}).get("user_id")
        if manager_user:
            users.add(manager_user)
        cursor = manager

    # Include full subordinate hierarchy below current user.
    visited_down = set()
    stack = [employee_name]
    while stack:
        current = stack.pop()
        if current in visited_down:
            continue
        visited_down.add(current)

        current_user = (employees_by_name.get(current) or {}).get("user_id")
        if current_user:
            users.add(current_user)

        for child in reports_map.get(current, []):
            if child and child not in visited_down:
                stack.append(child)

    return list(filter(None, users))

 
def get_visible_sales_persons(user):
    emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not emp:
        return []
 
    sp = frappe.db.get_value(
        "Sales Person",
        {"employee": emp},
        ["name", "lft", "rgt"],
        as_dict=True

    )
 
    if not sp:
        return []
 
    children = frappe.db.get_all(
        "Sales Person",
        filters={
            "lft": (">", sp.lft),
            "rgt": ("<", sp.rgt)
        },
        pluck="name"
    )
 
    return [sp.name] + children


@lru_cache(maxsize=None)
def get_effective_sales_persons(user: str) -> tuple[str, ...]:
    """Return the user's usable Sales Person scope, including child hierarchy."""
    visible_sales_persons = list(dict.fromkeys(filter(None, get_visible_sales_persons(user) or [])))
    explicit_sales_persons = list(_get_explicit_user_permission_values(user, "Sales Person"))

    if not explicit_sales_persons:
        return tuple(visible_sales_persons)

    expanded_explicit = set()
    for sales_person in explicit_sales_persons:
        expanded_explicit.add(sales_person)
        bounds = frappe.db.get_value("Sales Person", sales_person, ["lft", "rgt"], as_dict=True)
        if not bounds:
            continue

        expanded_explicit.update(
            frappe.get_all(
                "Sales Person",
                filters={
                    "lft": (">=", bounds.lft),
                    "rgt": ("<=", bounds.rgt),
                },
                pluck="name",
            )
        )

    if visible_sales_persons:
        effective = [sp for sp in visible_sales_persons if sp in expanded_explicit]
        if effective:
            return tuple(dict.fromkeys(effective))

    return tuple(dict.fromkeys(filter(None, expanded_explicit)))


import frappe
 
# ---------------------------------------------------------

# GENERIC HAS PERMISSION

# ---------------------------------------------------------

# def has_common_permission(doc, user, sales_person_field=None):

#     # System Manager → full access
#     if "System Manager" in frappe.get_roles(user):
#         return True

#     # Keep Call List visibility aligned with linked Sales Person restrictions.
#     if not _has_sales_team_access(doc, user):
#         return False

#     # Creator / assigned user
#     if _is_owner_or_assigned(doc, user):
#         return True

#     # Explicit doc share access
#     if _has_docshare_access(doc, user):
#         return True

#     # Any direct or child-table User link on the document
#     if _has_user_reference_access(doc, user):
#         return True

#     # Linked customer visibility (customer users, sales person, team lead)
#     if _has_customer_access(doc, user):
#         return True

#     # TECH SIDE
#     if is_technical_hierarchy_user(user):
#         hierarchy_users = set(get_tech_team_users(user))
#         if getattr(doc, "owner", None) in hierarchy_users:
#             return True

#         if getattr(doc, "doctype", None) == "Call List":
#             if _has_user_reference_access_for_users(doc, hierarchy_users):
#                 return True
#             if _has_hierarchy_assignment(doc, hierarchy_users):
#                 return True

#     # SALES SIDE
#     if sales_person_field and _has_sales_team_access(doc, user):
#         sales_person = doc.get(sales_person_field)
#         if sales_person and is_sales_user_or_team(sales_person, user):
#             return True

#         if getattr(doc, "doctype", None) == "Call List" and _get_sales_team_members_for_doc(doc):
#             return True

#     return False

 
# def common_permission_query(user, doctype, sales_person_field=None):
 
#     if "System Manager" in frappe.get_roles(user):
#         return ""
 
#     conditions = [
#         f"`tab{doctype}`.owner = {frappe.db.escape(user)}",
#         _assigned_to_exists_sql(doctype, user),
#         _get_docshare_condition(doctype, user),
#     ]
 
#     # TECH SIDE (hierarchy based)
#     if is_technical_hierarchy_user(user):
#         tech_users = get_tech_team_users(user)
#         if tech_users:
#             tech_list_sql = ", ".join(frappe.db.escape(team_user) for team_user in tech_users)
#             conditions.append(f"`tab{doctype}`.owner IN ({tech_list_sql})")

#             if doctype == "Call List":
#                 assignment_condition = _assigned_to_exists_for_users_sql(doctype, tech_users)
#                 if assignment_condition:
#                     conditions.append(assignment_condition)
#                 conditions.extend(_get_user_reference_conditions_for_users(doctype, tech_users))
 
#     # SALES SIDE
#     conditions.extend(_get_sales_access_conditions(doctype, user, sales_person_field=sales_person_field))

#     # Any direct or child-table User link on the document
#     conditions.extend(_get_user_reference_conditions(doctype, user))

#     # Linked customer visibility (customer users, sales person, team lead)
#     conditions.extend(_get_customer_access_conditions(doctype, user))

#     deduped_conditions = list(dict.fromkeys(c for c in conditions if c))
#     allow_clause = "(" + " OR ".join(deduped_conditions) + ")" if deduped_conditions else "1=0"

#     restrictive_conditions = _get_strict_link_restriction_conditions(doctype, user, sales_person_field=sales_person_field)
#     if restrictive_conditions and allow_clause != "1=0":
#         allow_clause = f"({allow_clause}) AND " + " AND ".join(f"({cond})" for cond in restrictive_conditions)

#     return allow_clause

 
def calllist_has_permission(doc, ptype, user):
    ptype = (ptype or "read").lower()

    if not user:
        user = frappe.session.user

    if "System Manager" in frappe.get_roles(user):
        return True

    if _is_owner_or_assigned(doc, user):
        return True

    if _has_docshare_access(doc, user):
        return True

    if _has_user_reference_access(doc, user):
        return True

    if _has_customer_access(doc, user):
        return True

    if is_technical_hierarchy_user(user):
        hierarchy_users = set(get_tech_team_users(user))
        if getattr(doc, "owner", None) in hierarchy_users:
            return True

        if _has_user_reference_access_for_users(doc, hierarchy_users):
            return True

        if _has_hierarchy_assignment(doc, hierarchy_users):
            return True

    if _has_sales_team_access(doc, user):
        sales_person = doc.get("custom_sales_person")
        if sales_person and is_sales_user_or_team(sales_person, user):
            return True

        if _get_sales_team_members_for_doc(doc):
            return True

    return False
 
 
def calllist_permission_query(user):
    if "System Manager" in frappe.get_roles(user):
        return ""

    conditions = [
        f"`tabCall List`.owner = {frappe.db.escape(user)}",
        _assigned_to_exists_sql("Call List", user),
        _get_docshare_condition("Call List", user),
    ]

    if is_technical_hierarchy_user(user):
        tech_users = get_tech_team_users(user)
        if tech_users:
            tech_list_sql = ", ".join(frappe.db.escape(team_user) for team_user in tech_users)
            conditions.append(f"`tabCall List`.owner IN ({tech_list_sql})")

            assignment_condition = _assigned_to_exists_for_users_sql("Call List", tech_users)
            if assignment_condition:
                conditions.append(assignment_condition)

            conditions.extend(_get_user_reference_conditions_for_users("Call List", tech_users))

    conditions.extend(_get_sales_access_conditions("Call List", user, sales_person_field="custom_sales_person"))
    conditions.extend(_get_user_reference_conditions("Call List", user))
    conditions.extend(_get_customer_access_conditions("Call List", user))

    deduped_conditions = list(dict.fromkeys(c for c in conditions if c))
    return "(" + " OR ".join(deduped_conditions) + ")" if deduped_conditions else "1=0"


import frappe

# -----------------------------
# TEAM HELPERS
# -----------------------------

def get_user_teams(user: str) -> list[str]:
    """Return list of Team names where this user is a member (via Team Members child)."""
    if not user:
        return []
    # Team Members child rows sit under parenttype='Team'
    return frappe.get_all(
        "Team Members",
        filters={"parenttype": "Team", "user": user},
        pluck="parent",
        ignore_permissions=True,
    )

def _assigned_to_exists_sql(doctype: str, user: str) -> str:
    """SQL EXISTS for ToDo assignments, safe to OR into permission queries."""
    # ToDo stores reference names; we avoid string concat outside escape
    return f"""
        EXISTS (
            SELECT 1 FROM `tabToDo` td
            WHERE td.reference_type = {frappe.db.escape(doctype)}
              AND td.reference_name = `tab{doctype}`.name
              AND td.status IN ('Open','Pending','Overdue')
              AND td.allocated_to = {frappe.db.escape(user)}
        )
    """


def _assigned_to_exists_for_users_sql(doctype: str, users: list[str] | tuple[str, ...] | set[str]) -> str:
    users = list(dict.fromkeys(filter(None, users or [])))
    if not users:
        return ""

    user_list_sql = ", ".join(frappe.db.escape(user) for user in users)
    return f"""
        EXISTS (
            SELECT 1 FROM `tabToDo` td
            WHERE td.reference_type = {frappe.db.escape(doctype)}
              AND td.reference_name = `tab{doctype}`.name
              AND td.status IN ('Open','Pending','Overdue')
              AND td.allocated_to IN ({user_list_sql})
        )
    """


def _has_hierarchy_assignment(doc, hierarchy_users: set[str]) -> bool:
    if not doc or not getattr(doc, "doctype", None) or not getattr(doc, "name", None) or not hierarchy_users:
        return False

    return bool(
        frappe.db.exists(
            "ToDo",
            {
                "reference_type": doc.doctype,
                "reference_name": doc.name,
                "allocated_to": ("in", list(hierarchy_users)),
                "status": ("in", ["Open", "Pending", "Overdue"]),
            },
        )
    )


@lru_cache(maxsize=None)
def _get_user_reference_config(
    doctype: str,
) -> tuple[tuple[str, ...], tuple[tuple[str, str, tuple[str, ...]], ...]]:
    """Collect direct User link fields and child tables that reference User."""
    try:
        meta = frappe.get_meta(doctype)
    except Exception:
        return (), ()

    direct_fields: list[str] = []
    child_tables: list[tuple[str, str, tuple[str, ...]]] = []

    for df in meta.fields or []:
        fieldname = getattr(df, "fieldname", None)
        fieldtype = getattr(df, "fieldtype", None)
        options = getattr(df, "options", None)

        if not fieldname:
            continue

        if fieldtype == "Link" and options == "User":
            direct_fields.append(fieldname)
            continue

        if fieldtype not in {"Table", "Table MultiSelect"} or not options:
            continue

        try:
            child_meta = frappe.get_meta(options)
        except Exception:
            continue

        user_fields = tuple(
            child_df.fieldname
            for child_df in (child_meta.fields or [])
            if getattr(child_df, "fieldtype", None) == "Link"
            and getattr(child_df, "options", None) == "User"
            and getattr(child_df, "fieldname", None)
        )
        if user_fields:
            child_tables.append((fieldname, options, user_fields))

    return tuple(direct_fields), tuple(child_tables)


def _has_user_reference_access(doc, user: str) -> bool:
    if not doc or not user:
        return False

    direct_fields, child_tables = _get_user_reference_config(doc.doctype)

    for fieldname in direct_fields:
        if doc.get(fieldname) == user:
            return True

    for table_field, child_doctype, user_fields in child_tables:
        rows = doc.get(table_field) or []
        for row in rows:
            for user_field in user_fields:
                row_user = row.get(user_field) if isinstance(row, dict) else getattr(row, user_field, None)
                if row_user == user:
                    return True

        if not getattr(doc, "name", None):
            continue

        child_filters = {
            "parenttype": doc.doctype,
            "parent": doc.name,
            "parentfield": table_field,
        }
        for user_field in user_fields:
            if frappe.db.exists(child_doctype, {**child_filters, user_field: user}):
                return True

    return False


def _has_user_reference_access_for_users(doc, users: set[str]) -> bool:
    if not doc or not users:
        return False

    direct_fields, child_tables = _get_user_reference_config(doc.doctype)

    for fieldname in direct_fields:
        if doc.get(fieldname) in users:
            return True

    for table_field, child_doctype, user_fields in child_tables:
        rows = doc.get(table_field) or []
        for row in rows:
            for user_field in user_fields:
                row_user = row.get(user_field) if isinstance(row, dict) else getattr(row, user_field, None)
                if row_user in users:
                    return True

        if not getattr(doc, "name", None):
            continue

        child_filters = {
            "parenttype": doc.doctype,
            "parent": doc.name,
            "parentfield": table_field,
        }
        for user_field in user_fields:
            if frappe.db.exists(child_doctype, {**child_filters, user_field: ("in", list(users))}):
                return True

    return False


def _get_user_reference_conditions(doctype: str, user: str) -> list[str]:
    conditions = []
    user_sql = frappe.db.escape(user)
    direct_fields, child_tables = _get_user_reference_config(doctype)

    for fieldname in direct_fields:
        conditions.append(f"`tab{doctype}`.`{fieldname}` = {user_sql}")

    for table_field, child_doctype, user_fields in child_tables:
        field_checks = " OR ".join(f"child.`{user_field}` = {user_sql}" for user_field in user_fields)
        conditions.append(f"""
            EXISTS (
                SELECT 1
                FROM `tab{child_doctype}` child
                WHERE child.parenttype = {frappe.db.escape(doctype)}
                  AND child.parent = `tab{doctype}`.name
                  AND child.parentfield = {frappe.db.escape(table_field)}
                  AND ({field_checks})
            )
        """)

    return conditions


def _get_user_reference_conditions_for_users(
    doctype: str, users: list[str] | tuple[str, ...] | set[str]
) -> list[str]:
    users = list(dict.fromkeys(filter(None, users or [])))
    if not users:
        return []

    user_list_sql = ", ".join(frappe.db.escape(user) for user in users)
    conditions = []
    direct_fields, child_tables = _get_user_reference_config(doctype)

    for fieldname in direct_fields:
        conditions.append(f"`tab{doctype}`.`{fieldname}` IN ({user_list_sql})")

    for table_field, child_doctype, user_fields in child_tables:
        field_checks = " OR ".join(
            f"child.`{user_field}` IN ({user_list_sql})" for user_field in user_fields
        )
        conditions.append(f"""
            EXISTS (
                SELECT 1
                FROM `tab{child_doctype}` child
                WHERE child.parenttype = {frappe.db.escape(doctype)}
                  AND child.parent = `tab{doctype}`.name
                  AND child.parentfield = {frappe.db.escape(table_field)}
                  AND ({field_checks})
            )
        """)

    return conditions


def _assigned_to_reference_exists_sql(reference_doctype: str, reference_name_sql: str, user: str) -> str:
    """SQL EXISTS for ToDo assignments against an arbitrary linked document name expression."""
    return f"""
        EXISTS (
            SELECT 1 FROM `tabToDo` td
            WHERE td.reference_type = {frappe.db.escape(reference_doctype)}
              AND td.reference_name = {reference_name_sql}
              AND td.status IN ('Open','Pending','Overdue')
              AND td.allocated_to = {frappe.db.escape(user)}
        )
    """


@lru_cache(maxsize=None)
def _get_customer_reference_config(doctype: str) -> tuple[tuple[str, ...], tuple[tuple[str, str, str], ...]]:
    """Collect direct and dynamic Customer link fields for a doctype."""
    try:
        meta = frappe.get_meta(doctype)
    except Exception:
        return (), ()

    direct_fields: list[str] = []
    dynamic_fields: list[tuple[str, str, str]] = []

    for df in meta.fields or []:
        if getattr(df, "fieldtype", None) == "Link" and getattr(df, "options", None) == "Customer" and getattr(df, "fieldname", None):
            direct_fields.append(df.fieldname)

    if meta.has_field("party"):
        if meta.has_field("appointment_with"):
            dynamic_fields.append(("party", "appointment_with", "Customer"))
        if meta.has_field("party_type"):
            dynamic_fields.append(("party", "party_type", "Customer"))

    if meta.has_field("name1") and meta.has_field("related_to"):
        dynamic_fields.append(("name1", "related_to", "Customer"))

    return tuple(dict.fromkeys(direct_fields)), tuple(dict.fromkeys(dynamic_fields))


def _get_linked_customers(doc) -> set[str]:
    customers = set()
    if not doc:
        return customers

    direct_fields, dynamic_fields = _get_customer_reference_config(doc.doctype)

    for fieldname in direct_fields:
        customer = doc.get(fieldname)
        if customer and frappe.db.exists("Customer", customer):
            customers.add(customer)

    for value_field, controller_field, expected_value in dynamic_fields:
        if doc.get(controller_field) != expected_value:
            continue
        customer = doc.get(value_field)
        if customer and frappe.db.exists("Customer", customer):
            customers.add(customer)

    return customers


def _has_customer_access(doc, user: str) -> bool:
    linked_customers = _get_linked_customers(doc)
    if not linked_customers:
        return False

    allowed_customers = set(filter(None, get_allowed_customers(user) or []))
    if allowed_customers.intersection(linked_customers):
        return True

    for customer in linked_customers:
        try:
            customer_doc = frappe.get_doc("Customer", customer)
        except Exception:
            continue

        if _is_owner_or_assigned(customer_doc, user):
            return True

        if _has_user_reference_access(customer_doc, user):
            return True

        if frappe.db.exists(
            "DocShare",
            {
                "user": user,
                "share_doctype": "Customer",
                "share_name": customer,
            },
        ):
            return True

    return False


def _get_customer_access_conditions(doctype: str, user: str) -> list[str]:
    conditions = []
    direct_fields, dynamic_fields = _get_customer_reference_config(doctype)
    if not direct_fields and not dynamic_fields:
        return conditions

    user_sql = frappe.db.escape(user)
    customer_sql_exprs = [f"`tab{doctype}`.`{fieldname}`" for fieldname in direct_fields]
    customer_sql_exprs.extend(
        f"(CASE WHEN `tab{doctype}`.`{controller_field}` = {frappe.db.escape(expected_value)} THEN `tab{doctype}`.`{value_field}` END)"
        for value_field, controller_field, expected_value in dynamic_fields
    )

    allowed_customers = list(dict.fromkeys(filter(None, get_allowed_customers(user) or [])))
    if allowed_customers:
        customer_list_sql = ", ".join(frappe.db.escape(customer) for customer in allowed_customers)
        conditions.extend(
            f"{customer_expr} IN ({customer_list_sql})"
            for customer_expr in customer_sql_exprs
        )

    customer_level_conditions = [
        f"cust.owner = {user_sql}",
        _assigned_to_reference_exists_sql("Customer", "cust.name", user),
        f"EXISTS (SELECT 1 FROM `tabDocShare` ds WHERE ds.user = {user_sql} AND ds.share_doctype = 'Customer' AND ds.share_name = cust.name)",
    ]

    conditions.extend(
        f"""
            EXISTS (
                SELECT 1
                FROM `tabCustomer` cust
                WHERE cust.name = {customer_expr}
                  AND ({' OR '.join(customer_level_conditions)})
            )
        """
        for customer_expr in customer_sql_exprs
    )

    return conditions


@lru_cache(maxsize=None)
def _get_explicit_user_permission_values(user: str, allow: str) -> tuple[str, ...]:
    if not user or not allow:
        return ()

    return tuple(
        dict.fromkeys(
            filter(
                None,
                frappe.get_all(
                    "User Permission",
                    filters={"user": user, "allow": allow},
                    pluck="for_value",
                )
                or [],
            )
        )
    )


def _get_sales_team_members_for_doc(doc) -> list[str]:
    if not doc:
        return []

    rows = doc.get("sales_team") or []
    sales_people = []
    for row in rows:
        sales_person = row.get("sales_person") if isinstance(row, dict) else getattr(row, "sales_person", None)
        if sales_person:
            sales_people.append(sales_person)

    if sales_people or not getattr(doc, "name", None):
        return sales_people

    return [
        sales_person
        for sales_person in frappe.get_all(
            "Sales Team",
            filters={"parenttype": doc.doctype, "parent": doc.name},
            pluck="sales_person",
        )
        if sales_person
    ]


def _has_sales_team_access(doc, user: str) -> bool:
    if not doc or not user:
        return False

    if "System Manager" in frappe.get_roles(user) or is_technical_hierarchy_user(user):
        return True

    if getattr(doc, "doctype", None) != "Call List":
        return True

    sales_people = set(_get_sales_team_members_for_doc(doc))
    if doc.get("custom_sales_person"):
        sales_people.add(doc.get("custom_sales_person"))

    if not sales_people:
        return True

    allowed_sales_persons = set(get_effective_sales_persons(user))
    if not allowed_sales_persons:
        return False

    return all(sales_person in allowed_sales_persons for sales_person in sales_people)


def _get_sales_access_conditions(doctype: str, user: str, sales_person_field: str | None = None) -> list[str]:
    sales_persons = list(dict.fromkeys(filter(None, get_effective_sales_persons(user) or [])))
    if not sales_persons:
        return []

    sp_list_sql = ", ".join(frappe.db.escape(sp) for sp in sales_persons)
    conditions = []

    if sales_person_field and doctype != "Call List":
        conditions.append(f"`tab{doctype}`.`{sales_person_field}` IN ({sp_list_sql})")
        return conditions

    if doctype == "Call List":
        checks = []
        if sales_person_field:
            checks.append(f"`tab{doctype}`.`{sales_person_field}` IN ({sp_list_sql})")

        checks.append(f"""
            EXISTS (
                SELECT 1
                FROM `tabSales Team` st_allow
                WHERE st_allow.parenttype = {frappe.db.escape(doctype)}
                  AND st_allow.parent = `tab{doctype}`.name
                  AND st_allow.sales_person IN ({sp_list_sql})
            )
        """)

        conditions.append("(" + " OR ".join(checks) + ")")

    return conditions


def _get_strict_link_restriction_conditions(doctype: str, user: str, sales_person_field: str | None = None) -> list[str]:
    conditions = []

    if doctype != "Call List":
        return conditions

    if "System Manager" in frappe.get_roles(user) or is_technical_hierarchy_user(user):
        return conditions

    sales_persons = list(dict.fromkeys(filter(None, get_effective_sales_persons(user) or [])))
    if not sales_persons:
        conditions.append("1=0")
        return conditions

    sp_list_sql = ", ".join(frappe.db.escape(sp) for sp in sales_persons)

    if sales_person_field:
        conditions.append(
            f"COALESCE(`tab{doctype}`.`{sales_person_field}`, '') IN ('', {sp_list_sql})"
        )

    conditions.append(f"""
        NOT EXISTS (
            SELECT 1
            FROM `tabSales Team` st
            WHERE st.parenttype = {frappe.db.escape(doctype)}
              AND st.parent = `tab{doctype}`.name
              AND COALESCE(st.sales_person, '') != ''
              AND st.sales_person NOT IN ({sp_list_sql})
        )
    """)

    return conditions


def has_team_permission(
    doc,
    user: str,
    *,
    doctype: str,
    primary_team_field: str | None = "team",   # set to None if you don't have primary link
    child_table_doctype: str = "Teams",
    child_link_field: str = "team",
    honor_owner: bool = True,
    honor_assigned: bool = True,
    sys_manager_full: bool = True,
) -> bool:
    """Runtime has_permission check using Teams."""
    # Sys Manager
    if sys_manager_full and "System Manager" in frappe.get_roles(user):
        return True

    # Owner
    if honor_owner and getattr(doc, "owner", None) == user:
        return True

    # Assigned
    if honor_assigned:
        try:
            assigns = frappe.parse_json(getattr(doc, "_assign", "[]") or "[]")
            if isinstance(assigns, list) and user in assigns:
                return True
        except Exception:
            pass

    # User teams
    user_teams = set(get_user_teams(user))
    if not user_teams:
        return False

    # Primary team on doc (optional)
    if primary_team_field and getattr(doc, primary_team_field, None):
        if getattr(doc, primary_team_field) in user_teams:
            return True

    # Multiselect teams via child table
    # NOTE: we don't need the fieldname; the child rows live in their own table.
    # But at runtime we can also check the in-memory rows if present.
    rows = getattr(doc, "get", None)
    if callable(rows):
        # try to iterate any child rows present at runtime (fails safe if not loaded)
        for table_field, meta in (doc.as_dict().items()):
            # skip non-lists
            pass
    # Safer: query child table for this doc
    teams_in_doc = frappe.get_all(
        child_table_doctype,
        filters={"parenttype": doctype, "parent": doc.name},
        pluck=child_link_field
    )
    frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(user_teams)))
    frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(teams_in_doc)))
    if any(t in user_teams for t in teams_in_doc):
        return True

    return False

def team_permission_query(
    user: str,
    *,
    doctype: str,
    primary_team_field: str | None = "team",
    child_table_doctype: str = "Teams",
    child_link_field: str = "team",
    honor_owner: bool = True,
    honor_assigned: bool = True,
    sys_manager_full: bool = True,
) -> str:
    """Return SQL WHERE clause snippet limiting docs to user's teams (plus owner/assigned)."""
    roles = frappe.get_roles(user)

    if sys_manager_full and "System Manager" in roles:
        return ""

    conditions = []

    # Owner
    if honor_owner:
        conditions.append(f"`tab{doctype}`.owner = {frappe.db.escape(user)}")

    # Assigned
    if honor_assigned:
        conditions.append(_assigned_to_exists_sql(doctype, user))

    # Team visibility
    user_teams = get_user_teams(user)
    if user_teams:
        team_list_sql = ", ".join(frappe.db.escape(t) for t in user_teams)

        # 1) Primary team field on the doc (if present)
        if primary_team_field:
            conditions.append(f"`tab{doctype}`.{primary_team_field} IN ({team_list_sql})")

        # 2) Child 'Teams' rows
        conditions.append(f"""
            EXISTS (
                SELECT 1
                FROM `tab{child_table_doctype}` t
                WHERE t.parenttype = {frappe.db.escape(doctype)}
                  AND t.parent = `tab{doctype}`.name
                  AND t.{child_link_field} IN ({team_list_sql})
            )
        """)
    else:
        # if the user is in no teams, keep only owner/assigned fallbacks
        pass

    # Safety: if nothing to allow, deny
    if not conditions:
        return "1=0"

    # Combine
    return "(" + " OR ".join(conditions) + ")"


def _get_direct_report_users(team_lead_user: str) -> list[str]:
    """Return direct-report user IDs for a team lead (Employee.reports_to based)."""
    if not team_lead_user:
        return []

    lead_emp = frappe.db.get_value("Employee", {"user_id": team_lead_user}, "name")
    if not lead_emp:
        return []

    users = frappe.get_all(
        "Employee",
        filters={"reports_to": lead_emp},
        pluck="user_id",
        ignore_permissions=True,
    )
    return [u for u in users if u]


def _is_owner_or_assigned(doc, user: str) -> bool:
    if getattr(doc, "owner", None) == user:
        return True

    try:
        assigns = frappe.parse_json(getattr(doc, "_assign", "[]") or "[]")
    except Exception:
        assigns = []

    if isinstance(assigns, list) and user in assigns:
        return True

    if getattr(doc, "doctype", None) and getattr(doc, "name", None):
        return bool(
            frappe.db.exists(
                "ToDo",
                {
                    "reference_type": doc.doctype,
                    "reference_name": doc.name,
                    "allocated_to": user,
                },
            )
        )

    return False


def _has_docshare_access(doc, user: str) -> bool:
    if not doc or not user:
        return False

    doctype = getattr(doc, "doctype", None)
    name = getattr(doc, "name", None)
    if not doctype or not name:
        return False

    if frappe.db.exists(
        "DocShare",
        {
            "share_doctype": doctype,
            "share_name": name,
            "user": user,
        },
    ):
        return True

    if frappe.db.exists(
        "DocShare",
        {
            "share_doctype": doctype,
            "share_name": name,
            "everyone": 1,
        },
    ):
        return True

    return False


def has_doc_share_access(doc, user: str) -> bool:
    """Backward-compatible alias for shared-document access checks."""
    return _has_docshare_access(doc, user)


def _get_docshare_condition(doctype: str, user: str) -> str:
    return (
        f"EXISTS ("
        f"SELECT 1 FROM `tabDocShare` ds "
        f"WHERE ds.share_doctype = {frappe.db.escape(doctype)} "
        f"AND ds.share_name = `tab{doctype}`.name "
        f"AND (ds.user = {frappe.db.escape(user)} OR ds.everyone = 1)"
        f")"
    )


def _get_appointment_custom_participants(doc):
    users = set()
    for row in getattr(doc, "custom_participants", []) or []:
        if not row:
            continue

        if isinstance(row, dict):
            user_id = row.get("user") or row.get("participant_name")
        else:
            user_id = getattr(row, "user", None) or getattr(row, "participant_name", None)

        if user_id:
            users.add(user_id)
    return users


def _has_appointment_hierarchy_assignment(doc, hierarchy_users: set[str]) -> bool:
    return _has_hierarchy_assignment(doc, hierarchy_users)


def _has_docshare_for_appointment(doc, user):
    if not doc or not getattr(doc, "name", None):
        return False

    return frappe.db.exists(
        "DocShare",
        {
            "user": user,
            "share_doctype": "Appointment",
            "share_name": doc.name,
        },
    )


def appointment_has_permission(doc, ptype, user):
    if not user:
        user = frappe.session.user

    if "System Manager" in frappe.get_roles(user):
        return True

    if _is_owner_or_assigned(doc, user):
        return True

    if _has_user_reference_access(doc, user):
        return True

    if _has_customer_access(doc, user):
        return True

    if is_technical_hierarchy_user(user):
        hierarchy_users = set(get_tech_team_users(user))
        if getattr(doc, "owner", None) in hierarchy_users:
            return True

        if _has_user_reference_access_for_users(doc, hierarchy_users):
            return True

        if _has_appointment_hierarchy_assignment(doc, hierarchy_users):
            return True

    if user in _get_appointment_custom_participants(doc):
        return True

    if _has_docshare_for_appointment(doc, user):
        return True

    return False


def appointment_permission_query(user):
    if "System Manager" in frappe.get_roles(user):
        return ""

    user_esc = frappe.db.escape(user).strip("'")

    conditions = [
        f"`tabAppointment`.owner = {frappe.db.escape(user)}",
        _assigned_to_exists_sql("Appointment", user),
        f"`tabAppointment`._assign LIKE '%\"{user_esc}\"%'",
        f"EXISTS (SELECT 1 FROM `tabMultiselect Users` mu WHERE mu.parenttype = 'Appointment' AND mu.parent = `tabAppointment`.name AND mu.parentfield = 'custom_participants' AND mu.user = {frappe.db.escape(user)})",
        f"EXISTS (SELECT 1 FROM `tabDocShare` ds WHERE ds.user = {frappe.db.escape(user)} AND ds.share_doctype = 'Appointment' AND ds.share_name = `tabAppointment`.name)",
    ]
    if is_technical_hierarchy_user(user):
        tech_users = get_tech_team_users(user)
        if tech_users:
            tech_list_sql = ", ".join(frappe.db.escape(team_user) for team_user in tech_users)
            conditions.append(f"`tabAppointment`.owner IN ({tech_list_sql})")

            assignment_condition = _assigned_to_exists_for_users_sql("Appointment", tech_users)
            if assignment_condition:
                conditions.append(assignment_condition)

            conditions.extend(_get_user_reference_conditions_for_users("Appointment", tech_users))

    conditions.extend(_get_user_reference_conditions("Appointment", user))
    conditions.extend(_get_customer_access_conditions("Appointment", user))

    deduped_conditions = list(dict.fromkeys(c for c in conditions if c))
    return "(" + " OR ".join(deduped_conditions) + ")" if deduped_conditions else "1=0"


def task_has_permission(doc, ptype, user):
    if not user:
        user = frappe.session.user

    if "System Manager" in frappe.get_roles(user):
        return True

    if _is_owner_or_assigned(doc, user):
        return True

    if _has_docshare_access(doc, user):
        return True

    if _has_user_reference_access(doc, user):
        return True

    if is_technical_hierarchy_user(user):
        hierarchy_users = set(get_tech_team_users(user))
        if getattr(doc, "owner", None) in hierarchy_users:
            return True
        if _has_user_reference_access_for_users(doc, hierarchy_users):
            return True
        if _has_hierarchy_assignment(doc, hierarchy_users):
            return True

    return False


def task_permission_query(user):
    if "System Manager" in frappe.get_roles(user):
        return ""

    conditions = [
        f"`tabTask`.owner = {frappe.db.escape(user)}",
        _assigned_to_exists_sql("Task", user),
        _get_docshare_condition("Task", user),
    ]
    if is_technical_hierarchy_user(user):
        tech_users = get_tech_team_users(user)
        if tech_users:
            tech_list_sql = ", ".join(frappe.db.escape(team_user) for team_user in tech_users)
            conditions.append(f"`tabTask`.owner IN ({tech_list_sql})")

            assignment_condition = _assigned_to_exists_for_users_sql("Task", tech_users)
            if assignment_condition:
                conditions.append(assignment_condition)

            conditions.extend(_get_user_reference_conditions_for_users("Task", tech_users))

    conditions.extend(_get_user_reference_conditions("Task", user))

    deduped_conditions = list(dict.fromkeys(c for c in conditions if c))
    return "(" + " OR ".join(deduped_conditions) + ")" if deduped_conditions else "1=0"


import frappe

def get_allowed_customers(user):
    roles = frappe.get_roles(user)

    # TECH → ALL CUSTOMERS
    if is_technical_hierarchy_user(user):
        return []  # empty list = no restriction

    # SYSTEM MANAGER → ALL
    if "System Manager" in roles:
        return []

    # SALES → restricted
    sales_persons = list(get_effective_sales_persons(user))
    if not sales_persons:
        return []

    sp_list = ", ".join(frappe.db.escape(sp) for sp in sales_persons)

    return frappe.db.sql(f"""
        SELECT DISTINCT parent as customer  
        FROM `tabSales Team`
        WHERE sales_person IN ({sp_list})
    """, pluck="customer")

 
import frappe

from renewal_module.user_permissions1 import get_allowed_customers
 
def contact_has_permission(doc, ptype, user):
    if "System Manager" in frappe.get_roles(user):
        return True

    roles = frappe.get_roles(user)
    tech_roles = [
        "L1 - Tech Support",
        "Tech Support",
        "L2 - Tech Support",
        "L3 - Tech Support"
    ]

    # TECH → read access to ALL
    if any(r in roles for r in tech_roles):
        return True

    # Owner / assigned
    if doc.owner == user:
        return True
    if doc._assign and user in frappe.parse_json(doc._assign):
        return True

    customers = get_allowed_customers(user)
    if not customers:
        return False

    return frappe.db.exists(
        "Dynamic Link",
        {
            "parent": doc.name,
            "link_doctype": "Customer",
            "link_name": ("in", customers)
        }
    )

def contact_permission_query(user):
    roles = frappe.get_roles(user)

    # TECH + SYSTEM MANAGER → NO FILTER
    tech_roles = [
        "L1 - Tech Support",
        "Tech Support",
        "L2 - Tech Support",
        "L3 - Tech Support"
    ]

    if "System Manager" in roles or any(r in roles for r in tech_roles):
        return ""

    customers = get_allowed_customers(user)
    if not customers:
        return "1=0"

    cust_list = ", ".join(frappe.db.escape(c) for c in customers)

    return f"""
        EXISTS (
            SELECT 1 FROM `tabDynamic Link` dl
            WHERE dl.parent = `tabContact`.name
            AND dl.link_doctype = 'Customer'
            AND dl.link_name IN ({cust_list})
        )
    """

 
import frappe

from renewal_module.user_permissions1 import get_allowed_customers
 
def address_has_permission(doc, ptype, user):

    if "System Manager" in frappe.get_roles(user):

        return True
 
    if doc.owner == user:

        return True
 
    if doc._assign and user in frappe.parse_json(doc._assign):

        return True
 
    customers = get_allowed_customers(user)

    if not customers:

        return False
 
    return frappe.db.exists(

        "Dynamic Link",

        {

            "parent": doc.name,

            "link_doctype": "Customer",

            "link_name": ("in", customers)

        }

    )

 
def address_permission_query(user):

    if "System Manager" in frappe.get_roles(user):

        return ""
 
    customers = get_allowed_customers(user)

    if not customers:

        return f"`tabAddress`.owner = '{user}'"
 
    #cust_list = "', '".join(customers)
    cust_list = ", ".join(frappe.db.escape(c) for c in customers)
 
    return f"""

        `tabAddress`.owner = '{user}'

        OR EXISTS (

            SELECT 1 FROM `tabDynamic Link` dl

            WHERE dl.parent = `tabAddress`.name

            AND dl.link_doctype = 'Customer'

            AND dl.link_name IN ({cust_list})

        )

    """

 