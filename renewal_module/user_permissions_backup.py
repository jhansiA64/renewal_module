

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

def has_common_permission(doc, user, sales_person_field=None):

    # System Manager → full access
    if "System Manager" in frappe.get_roles(user):
        return True

    # Keep Call List visibility aligned with linked Sales Person restrictions.
    if not _has_sales_team_access(doc, user):
        return False

    # Creator / assigned user
    if _is_owner_or_assigned(doc, user):
        return True

    # Explicit doc share access
    if _has_docshare_access(doc, user):
        return True

    # Any direct or child-table User link on the document
    if _has_user_reference_access(doc, user):
        return True

    # Linked customer visibility (customer users, sales person, team lead)
    if _has_customer_access(doc, user):
        return True

    # TECH SIDE
    if is_technical_hierarchy_user(user):
        hierarchy_users = set(get_tech_team_users(user))
        if getattr(doc, "owner", None) in hierarchy_users:
            return True

        if getattr(doc, "doctype", None) == "Call List":
            if _has_user_reference_access_for_users(doc, hierarchy_users):
                return True
            if _has_hierarchy_assignment(doc, hierarchy_users):
                return True

    # SALES SIDE
    if _has_sales_team_access(doc, user):
        all_sps, owner_users = _get_sp_permission_context(user)
        if all_sps or owner_users:
            sp_set = set(all_sps)
            # Direct field
            if sales_person_field:
                sp_val = doc.get(sales_person_field)
                if sp_val and sp_val in sp_set:
                    return True
            if getattr(doc, "doctype", None) == "Opportunity":
                csp = doc.get("custom_sales_person")
                if csp and csp in sp_set:
                    return True
            # sales_team child rows
            for row in (_get_sales_team_members_for_doc(doc) or []):
                if row in sp_set:
                    return True
            # Owner-based resolution
            if owner_users and doc.get("owner") in set(owner_users):
                return True
        elif sales_person_field:
            # Fall back to hierarchy check (no explicit User Permission configured)
            sales_person = doc.get(sales_person_field)
            if sales_person and is_sales_user_or_team(sales_person, user):
                return True
            if getattr(doc, "doctype", None) == "Call List" and _get_sales_team_members_for_doc(doc):
                return True

    return False

 
def common_permission_query(user, doctype, sales_person_field=None):
 
    if "System Manager" in frappe.get_roles(user):
        return ""

    conditions = [
        f"`tab{doctype}`.owner = {frappe.db.escape(user)}",
        _assigned_to_exists_sql(doctype, user),
        _get_docshare_condition(doctype, user),
    ]
 
    # TECH SIDE (hierarchy based)
    if is_technical_hierarchy_user(user):
        tech_users = get_tech_team_users(user)
        if tech_users:
            tech_list_sql = ", ".join(frappe.db.escape(team_user) for team_user in tech_users)
            conditions.append(f"`tab{doctype}`.owner IN ({tech_list_sql})")

            if doctype == "Call List":
                assignment_condition = _assigned_to_exists_for_users_sql(doctype, tech_users)
                if assignment_condition:
                    conditions.append(assignment_condition)
                conditions.extend(_get_user_reference_conditions_for_users(doctype, tech_users))
 
    # SALES SIDE
    conditions.extend(_get_sales_access_conditions(doctype, user, sales_person_field=sales_person_field))

    # Any direct or child-table User link on the document
    conditions.extend(_get_user_reference_conditions(doctype, user))

    # Linked customer visibility (customer users, sales person, team lead)
    conditions.extend(_get_customer_access_conditions(doctype, user))

    deduped_conditions = list(dict.fromkeys(c for c in conditions if c))
    allow_clause = "(" + " OR ".join(deduped_conditions) + ")" if deduped_conditions else "1=0"

    restrictive_conditions = _get_strict_link_restriction_conditions(doctype, user, sales_person_field=sales_person_field)
    if restrictive_conditions and allow_clause != "1=0":
        allow_clause = f"({allow_clause}) AND " + " AND ".join(f"({cond})" for cond in restrictive_conditions)

    return allow_clause

 
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

        # User Permission: Allow Sales Person = X
        _, owner_users = _get_sp_permission_context(user)
        if owner_users and doc.get("owner") in set(owner_users):
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


def _get_sp_permission_context(user: str) -> tuple[list[str], list[str]]:
    """
    Resolve User Permissions (Allow Sales Person = X) into two lists:
      - all_sps: every Sales Person name the user is granted access to (including SP hierarchy children)
      - owner_users: Frappe user IDs linked to those Sales Persons via Employee
    """
    explicit_sps = list(_get_explicit_user_permission_values(user, "Sales Person"))
    if not explicit_sps:
        return [], []

    all_sps: set[str] = set()
    for sp in explicit_sps:
        all_sps.add(sp)
        bounds = frappe.db.get_value("Sales Person", sp, ["lft", "rgt"], as_dict=True)
        if bounds:
            children = frappe.get_all(
                "Sales Person",
                filters={"lft": (">=", bounds.lft), "rgt": ("<=", bounds.rgt)},
                pluck="name",
            )
            all_sps.update(children)

    owner_users: list[str] = []
    for sp in all_sps:
        emp = frappe.db.get_value("Sales Person", sp, "employee")
        if not emp:
            continue
        user_id = frappe.db.get_value("Employee", emp, "user_id")
        if user_id:
            owner_users.append(user_id)

    return (
        list(dict.fromkeys(filter(None, all_sps))),
        list(dict.fromkeys(filter(None, owner_users))),
    )


def _get_users_for_sales_persons(sales_persons: list[str]) -> list[str]:
    if not sales_persons:
        return []

    user_ids: list[str] = []
    for sales_person in sales_persons:
        employee = frappe.db.get_value("Sales Person", sales_person, "employee")
        if not employee:
            continue

        user_id = frappe.db.get_value("Employee", employee, "user_id")
        if user_id:
            user_ids.append(user_id)

    return list(dict.fromkeys(user_ids))


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
        checks = [f"`tab{doctype}`.`{sales_person_field}` IN ({sp_list_sql})"]
        if doctype == "Opportunity":
            checks.append(f"`tab{doctype}`.`custom_sales_person` IN ({sp_list_sql})")
        checks.append(f"""EXISTS (
            SELECT 1 FROM `tabSales Team` st_allow
            WHERE st_allow.parenttype = {frappe.db.escape(doctype)}
              AND st_allow.parent = `tab{doctype}`.name
              AND st_allow.sales_person IN ({sp_list_sql})
        )""")
        # Owner-based: doc created by the user whose Employee links to an allowed Sales Person
        sp_owner_users: list[str] = []
        for sales_person in sales_persons:
            emp = frappe.db.get_value("Sales Person", sales_person, "employee")
            if not emp:
                continue

            user_id = frappe.db.get_value("Employee", emp, "user_id")
            if user_id:
                sp_owner_users.append(user_id)

        sp_owner_users = list(dict.fromkeys(sp_owner_users))
        if sp_owner_users:
            sp_owners_sql = ", ".join(frappe.db.escape(u) for u in sp_owner_users)
            checks.append(f"`tab{doctype}`.owner IN ({sp_owners_sql})")
        conditions.append("(" + " OR ".join(checks) + ")")
        return conditions

    if doctype == "Call List":
        checks = []
        if sales_person_field:
            checks.append(f"`tab{doctype}`.`{sales_person_field}` IN ({sp_list_sql})")

        checks.append(f"""EXISTS (
            SELECT 1
            FROM `tabSales Team` st_allow
            WHERE st_allow.parenttype = {frappe.db.escape(doctype)}
              AND st_allow.parent = `tab{doctype}`.name
              AND st_allow.sales_person IN ({sp_list_sql})
        )""")

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


# -----------------------------
# OPPORTUNITY
# -----------------------------

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
                    "status": ("in", ["Open", "Pending", "Overdue"]),
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


def _is_read_only_team_lead_access(doc, user: str) -> bool:
    """Team lead can read docs owned by direct reports."""
    owner = getattr(doc, "owner", None)
    if not owner or owner == user:
        return False

    return owner in _get_direct_report_users(user)

def opportunity_has_permission(doc, ptype, user):
    ptype = (ptype or "read").lower()

    if not user:
        user = frappe.session.user

    # System Manager keeps full access.
    if "System Manager" in frappe.get_roles(user):
        return True

    # Owner / assigned user can read and edit.
    if _is_owner_or_assigned(doc, user):
        return True

    # DocShare-based visibility for explicitly shared opportunities.
    if _has_docshare_access(doc, user):
        return True

    # User Permission: Allow Sales Person = X grants read access to docs linked to that SP.
    all_sps, owner_users = _get_sp_permission_context(user)
    if ptype not in {"write", "create", "delete", "submit", "cancel", "amend"}:
        if owner_users and doc.get("owner") in set(owner_users):
            return True
        if all_sps:
            sp_set = set(all_sps)
            if doc.get("sales_person") in sp_set or doc.get("custom_sales_person") in sp_set:
                return True
            for row in (doc.get("sales_team") or []):
                row_sp = row.get("sales_person") if isinstance(row, dict) else getattr(row, "sales_person", None)
                if row_sp and row_sp in sp_set:
                    return True

    # Team lead access is read-only for direct-report docs.
    edit_ptypes = {"write", "create", "delete", "submit", "cancel", "amend"}
    if ptype in edit_ptypes:
        return False

    return _is_read_only_team_lead_access(doc, user)

def opportunity_permission_query(user):
    if "System Manager" in frappe.get_roles(user):
        return ""

    conditions = [f"`tabOpportunity`.owner = {frappe.db.escape(user)}"]

    # Keep assignment-based visibility for the logged-in user.
    conditions.append(_assigned_to_exists_sql("Opportunity", user))

    # Include opportunities shared explicitly with this user or shared for everyone.
    conditions.append(_get_docshare_condition("Opportunity", user))

    # Team lead can read docs owned by direct reports.
    team_users = _get_direct_report_users(user)
    if team_users:
        team_users_sql = ", ".join(frappe.db.escape(u) for u in team_users)
        conditions.append(f"`tabOpportunity`.owner IN ({team_users_sql})")

    # User Permission: Allow Sales Person = X grants read access to that SP's docs.
    all_sps, owner_users = _get_sp_permission_context(user)
    if owner_users:
        owner_users_sql = ", ".join(frappe.db.escape(u) for u in owner_users)
        conditions.append(f"`tabOpportunity`.owner IN ({owner_users_sql})")
    if all_sps:
        sps_sql = ", ".join(frappe.db.escape(sp) for sp in all_sps)
        conditions.append(f"`tabOpportunity`.`sales_person` IN ({sps_sql})")
        conditions.append(f"`tabOpportunity`.`custom_sales_person` IN ({sps_sql})")
        conditions.append(f"""EXISTS (
            SELECT 1 FROM `tabSales Team` st
            WHERE st.parenttype = 'Opportunity'
              AND st.parent = `tabOpportunity`.name
              AND st.sales_person IN ({sps_sql})
        )""")

    return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"


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

    # User Permission: Allow Sales Person = X grants access to docs owned by that SP's user
    _, owner_users = _get_sp_permission_context(user)
    if owner_users and getattr(doc, "owner", None) in set(owner_users):
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

    # User Permission: Allow Sales Person = X grants access to docs owned by that SP's user
    _, owner_users = _get_sp_permission_context(user)
    if owner_users:
        ou_sql = ", ".join(frappe.db.escape(u) for u in owner_users)
        conditions.append(f"`tabAppointment`.owner IN ({ou_sql})")

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



def quotation_has_permission(doc, ptype, user):
    ptype = (ptype or "read").lower()

    if not user:
        user = frappe.session.user

    # System Manager keeps full access.
    if "System Manager" in frappe.get_roles(user):
        return True

    # Owner / assigned user can read and edit.
    if _is_owner_or_assigned(doc, user):
        return True

    if _has_docshare_access(doc, user):
        return True

    # User Permission: Allow Sales Person = X grants read access to docs linked to that SP.
    all_sps, owner_users = _get_sp_permission_context(user)
    if ptype not in {"write", "create", "delete", "submit", "cancel", "amend"}:
        if owner_users and doc.get("owner") in set(owner_users):
            return True
        if all_sps:
            sp_set = set(all_sps)
            if doc.get("sales_person") in sp_set:
                return True
            for row in (doc.get("sales_team") or []):
                row_sp = row.get("sales_person") if isinstance(row, dict) else getattr(row, "sales_person", None)
                if row_sp and row_sp in sp_set:
                    return True

    # Team lead access is read-only for direct-report docs.
    edit_ptypes = {"write", "create", "delete", "submit", "cancel", "amend"}
    if ptype in edit_ptypes:
        return False

    return _is_read_only_team_lead_access(doc, user)
 
 
def quotation_permission_query(user):

    if not user:
        user = frappe.session.user

    if "System Manager" in frappe.get_roles(user):
        return ""

    conditions = [f"`tabQuotation`.owner = {frappe.db.escape(user)}"]

    # Keep assignment-based visibility for the logged-in user.
    #conditions.append(_assigned_to_exists_sql("Quotation", user))

    conditions.append(_get_docshare_condition("Quotation", user))

    # Team lead can read docs owned by direct reports.
    team_users = _get_direct_report_users(user)
    if team_users:
        team_users_sql = ", ".join(frappe.db.escape(u) for u in team_users)
        conditions.append(f"`tabQuotation`.owner IN ({team_users_sql})")

    # User Permission: Allow Sales Person = X grants read access to that SP's docs.
    all_sps, owner_users = _get_sp_permission_context(user)
    if owner_users:
        owner_users_sql = ", ".join(frappe.db.escape(u) for u in owner_users)
        conditions.append(f"`tabQuotation`.owner IN ({owner_users_sql})")
    if all_sps:
        sps_sql = ", ".join(frappe.db.escape(sp) for sp in all_sps)
        conditions.append(f"`tabQuotation`.`sales_person` IN ({sps_sql})")
        conditions.append(f"""EXISTS (
            SELECT 1 FROM `tabSales Team` st
            WHERE st.parenttype = 'Quotation'
              AND st.parent = `tabQuotation`.name
              AND st.sales_person IN ({sps_sql})
        )""")

    return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"
 
def cof_has_permission(doc, ptype, user):

    return has_common_permission(

        doc,

        user,

        sales_person_field="sales_person"

    )
 
 
def cof_permission_query(user):

    return common_permission_query(

        user,

        doctype="Customer Order Form",

        sales_person_field="sales_person"

    )

 
def orc_has_permission(doc, ptype, user):
    return has_common_permission(
        doc,
        user,
        sales_person_field="sales_person"
    )
 
 
def orc_permission_query(user):
    return common_permission_query(
        user,
        doctype="ORC List",
        sales_person_field="sales_person"
    )

import frappe

def get_allowed_customers(user):
    if not user:
        user = frappe.session.user

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
                WHERE parenttype = 'Customer'
                    AND sales_person IN ({sp_list})
    """, pluck="customer")

 
import frappe

from renewal_module.user_permissions import get_allowed_customers
 
def contact_has_permission(doc, ptype, user):
    if not user:
        user = frappe.session.user

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

    # Supplier-linked contacts are readable by all users
    if frappe.db.exists("Dynamic Link", {"parent": doc.name, "link_doctype": "Supplier"}):
        return True

    customers = get_allowed_customers(user)
    if not customers:
        # No customers via SP hierarchy, but check User Permission owner-based access
        _, owner_users = _get_sp_permission_context(user)
        if owner_users and doc.owner in set(owner_users):
            return True
        return False

    if frappe.db.exists(
        "Dynamic Link",
        {
            "parent": doc.name,
            "link_doctype": "Customer",
            "link_name": ("in", customers),
        },
    ):
        return True

    _, owner_users = _get_sp_permission_context(user)
    if owner_users and doc.owner in set(owner_users):
        return True

    return False

def contact_permission_query(user):
    if not user:
        user = frappe.session.user

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
    owner_clause_parts = [f"`tabContact`.owner = {frappe.db.escape(user)}"]
    _, owner_users = _get_sp_permission_context(user)
    if owner_users:
        ou_sql = ", ".join(frappe.db.escape(u) for u in owner_users)
        owner_clause_parts.append(f"`tabContact`.owner IN ({ou_sql})")
    owner_clause = " OR ".join(owner_clause_parts)

    if not customers:
        return f"({owner_clause})"

    cust_list = ", ".join(frappe.db.escape(c) for c in customers)

    return f"""
        ({owner_clause})
        OR EXISTS (
            SELECT 1 FROM `tabDynamic Link` dl
            WHERE dl.parent = `tabContact`.name
            AND dl.link_doctype = 'Supplier'
        )
        OR EXISTS (
            SELECT 1 FROM `tabDynamic Link` dl
            WHERE dl.parent = `tabContact`.name
            AND dl.link_doctype = 'Customer'
            AND dl.link_name IN ({cust_list})
        )
    """

 
import frappe

from renewal_module.user_permissions import get_allowed_customers
 
def address_has_permission(doc, ptype, user):
    if not user:
        user = frappe.session.user

    if "System Manager" in frappe.get_roles(user):

        return True
 
    if doc.owner == user:

        return True
 
    if doc._assign and user in frappe.parse_json(doc._assign):

        return True

    # Supplier-linked addresses are readable by all users
    if frappe.db.exists("Dynamic Link", {"parent": doc.name, "link_doctype": "Supplier"}):
        return True
 
    customers = get_allowed_customers(user)
    companies = list(_get_explicit_user_permission_values(user, "Company"))

    if not customers and not companies:
        _, owner_users = _get_sp_permission_context(user)
        if owner_users and doc.owner in set(owner_users):
            return True
        return False
 
    if customers and frappe.db.exists(
        "Dynamic Link",
        {
            "parent": doc.name,
            "link_doctype": "Customer",
            "link_name": ("in", customers)
        }
    ):
        return True

    if companies and frappe.db.exists(
        "Dynamic Link",
        {
            "parent": doc.name,
            "link_doctype": "Company",
            "link_name": ("in", companies)
        }
    ):
        return True

    _, owner_users = _get_sp_permission_context(user)
    if owner_users and doc.owner in set(owner_users):
        return True

    return False
 
 
def address_permission_query(user):
    if not user:
        user = frappe.session.user

    if "System Manager" in frappe.get_roles(user):

        return ""
 
    customers = get_allowed_customers(user)
    companies = list(_get_explicit_user_permission_values(user, "Company"))
    _, owner_users = _get_sp_permission_context(user)
    owner_clause_parts = [f"`tabAddress`.owner = {frappe.db.escape(user)}"]
    if owner_users:
        ou_sql = ", ".join(frappe.db.escape(u) for u in owner_users)
        owner_clause_parts.append(f"`tabAddress`.owner IN ({ou_sql})")
    owner_clause = " OR ".join(owner_clause_parts)

    if not customers and not companies:
        return f"({owner_clause})"
 
    link_checks = []
    # Supplier-linked addresses are visible to all users
    link_checks.append("""EXISTS (
            SELECT 1 FROM `tabDynamic Link` dl
            WHERE dl.parent = `tabAddress`.name
            AND dl.link_doctype = 'Supplier'
        )""")
    if customers:
        cust_list = ", ".join(frappe.db.escape(c) for c in customers)
        link_checks.append(f"""EXISTS (
            SELECT 1 FROM `tabDynamic Link` dl
            WHERE dl.parent = `tabAddress`.name
            AND dl.link_doctype = 'Customer'
            AND dl.link_name IN ({cust_list})
        )""")
    if companies:
        comp_list = ", ".join(frappe.db.escape(c) for c in companies)
        link_checks.append(f"""EXISTS (
            SELECT 1 FROM `tabDynamic Link` dl
            WHERE dl.parent = `tabAddress`.name
            AND dl.link_doctype = 'Company'
            AND dl.link_name IN ({comp_list})
        )""")

    return f"({owner_clause}) OR (" + " OR ".join(link_checks) + ")"


def _so_si_has_permission(doc, ptype, user, doctype_label):
    ptype = (ptype or "read").lower()
    if "System Manager" in frappe.get_roles(user):
        return True
    if _is_owner_or_assigned(doc, user):
        return True
    all_sps, owner_users = _get_sp_permission_context(user)
    if ptype not in {"write", "create", "delete", "submit", "cancel", "amend"}:
        if owner_users and doc.get("owner") in set(owner_users):
            return True
        if all_sps:
            sp_set = set(all_sps)
            if doc.get("sales_person") in sp_set:
                return True
            for row in (doc.get("sales_team") or []):
                row_sp = row.get("sales_person") if isinstance(row, dict) else getattr(row, "sales_person", None)
                if row_sp and row_sp in sp_set:
                    return True
    if ptype in {"write", "create", "delete", "submit", "cancel", "amend"}:
        return False
    return _is_read_only_team_lead_access(doc, user)


def _so_si_permission_query(user, doctype):
    if "System Manager" in frappe.get_roles(user):
        return ""
    tab = f"`tab{doctype}`"
    conditions = [
        f"{tab}.owner = {frappe.db.escape(user)}",
        _assigned_to_exists_sql(doctype, user),
    ]
    team_users = _get_direct_report_users(user)
    if team_users:
        team_sql = ", ".join(frappe.db.escape(u) for u in team_users)
        conditions.append(f"{tab}.owner IN ({team_sql})")
    all_sps, owner_users = _get_sp_permission_context(user)
    if owner_users:
        ou_sql = ", ".join(frappe.db.escape(u) for u in owner_users)
        conditions.append(f"{tab}.owner IN ({ou_sql})")
    if all_sps:
        sps_sql = ", ".join(frappe.db.escape(sp) for sp in all_sps)
        conditions.append(f"{tab}.`sales_person` IN ({sps_sql})")
        conditions.append(f"""EXISTS (
            SELECT 1 FROM `tabSales Team` st
            WHERE st.parenttype = {frappe.db.escape(doctype)}
              AND st.parent = {tab}.name
              AND st.sales_person IN ({sps_sql})
        )""")
    return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"


def sales_order_has_permission(doc, ptype, user):
    return _so_si_has_permission(doc, ptype, user, "Sales Order")


def sales_order_permission_query(user):
    return _so_si_permission_query(user, "Sales Order")


def sales_invoice_has_permission(doc, ptype, user):
    return _so_si_has_permission(doc, ptype, user, "Sales Invoice")


def sales_invoice_permission_query(user):
    return _so_si_permission_query(user, "Sales Invoice")
