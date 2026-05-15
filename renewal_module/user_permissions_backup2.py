import frappe
def is_tech_user_or_team(owner, user):
    owner_emp = frappe.db.get_value("Employee", {"user_id": owner}, "name")
    user_emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
 
    if not owner_emp or not user_emp:

        return False
 
    # Team lead
    owner_lead = frappe.db.get_value("Employee", owner_emp, "reports_to")
    if owner_lead:
        lead_user = frappe.db.get_value("Employee", owner_lead, "user_id")
        if lead_user == user:
            return True
 
    # Team members under same lead

    if owner_lead:
        siblings = frappe.db.get_all(
            "Employee",
            filters={"reports_to": owner_lead},
            pluck="user_id"
        )

        if user in siblings:
            return True
    return False

 
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
    emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not emp:
        return list(users)
 
    lead = frappe.db.get_value("Employee", emp, "reports_to")
 
    if lead:
        # Team lead
        lead_user = frappe.db.get_value("Employee", lead, "user_id")
        if lead_user:
            users.add(lead_user)
        # Team members

        team = frappe.db.get_all(
            "Employee",
            filters={"reports_to": lead},
            pluck="user_id"
        )

        users.update(team)
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

 


import frappe
 
# ---------------------------------------------------------

# GENERIC HAS PERMISSION

# ---------------------------------------------------------

def has_common_permission(doc, user, sales_person_field=None):

    # System Manager → full access

    if "System Manager" in frappe.get_roles(user):

        return True
 
    # Creator

    if doc.owner == user:

        return True
 
    # TECH SIDE

    if is_tech_user_or_team(doc.owner, user):

        return True
 
    # SALES SIDE

    if sales_person_field:

        sales_person = doc.get(sales_person_field)

        if sales_person and is_sales_user_or_team(sales_person, user):

            return True
 
    # Assigned user

    if doc._assign and user in frappe.parse_json(doc._assign):

        return True
 
    return False

 
def common_permission_query(user, doctype, sales_person_field=None):
 
    if "System Manager" in frappe.get_roles(user):

        return ""
 
    conditions = []
 
    # TECH SIDE (creator based)

    conditions.append(f"`tab{doctype}`.owner = '{user}'")
 
    tech_users = get_tech_team_users(user)

    if tech_users:

        tech_list = "', '".join(tech_users)

        conditions.append(f"`tab{doctype}`.owner IN ('{tech_list}')")
 
    # SALES SIDE

    if sales_person_field:

        sales_persons = get_visible_sales_persons(user)

        if sales_persons:

            sp_list = "', '".join(sales_persons)

            conditions.append(

                f"`tab{doctype}`.{sales_person_field} IN ('{sp_list}')"

            )
 
    return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"

 
def calllist_has_permission(doc, ptype, user):

    return has_common_permission(

        doc,

        user,

        sales_person_field="custom_sales_person"

    )
 
 
def calllist_permission_query(user):

    return common_permission_query(

        user,

        doctype="Call List",

        sales_person_field="custom_sales_person"

    )

 
# def opportunity_has_permission(doc, ptype, user):

#     return has_common_permission(

#         doc,

#         user,

#         sales_person_field="sales_person"

#     )
 
 
# def opportunity_permission_query(user):

#     return common_permission_query(

#         user,

#         doctype="Opportunity",

#         sales_person_field="sales_person"

#     )






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
        pluck="parent"  # parent is the Team name
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
    )
    return [u for u in users if u]


def _is_owner_or_assigned(doc, user: str) -> bool:
    if getattr(doc, "owner", None) == user:
        return True

    try:
        assigns = frappe.parse_json(getattr(doc, "_assign", "[]") or "[]")
    except Exception:
        assigns = []
    return isinstance(assigns, list) and user in assigns


def _is_read_only_team_lead_access(doc, user: str) -> bool:
    """Team lead can read docs owned by direct reports."""
    owner = getattr(doc, "owner", None)
    if not owner or owner == user:
        return False

    return owner in _get_direct_report_users(user)

def opportunity_has_permission(doc, ptype, user):
    ptype = (ptype or "read").lower()

    # System Manager keeps full access.
    if "System Manager" in frappe.get_roles(user):
        return True

    # Owner / assigned user can read and edit.
    if _is_owner_or_assigned(doc, user):
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

    # Team lead can read docs owned by direct reports.
    team_users = _get_direct_report_users(user)
    if team_users:
        team_users_sql = ", ".join(frappe.db.escape(u) for u in team_users)
        conditions.append(f"`tabOpportunity`.owner IN ({team_users_sql})")

    return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"


# def _get_appointment_custom_participants(doc):
#     users = set()
#     for row in getattr(doc, "custom_participants", []) or []:
#         if not row:
#             continue

#         if isinstance(row, dict):
#             user_id = row.get("user") or row.get("participant_name")
#         else:
#             user_id = getattr(row, "user", None) or getattr(row, "participant_name", None)

#         if user_id:
#             users.add(user_id)
#     return users


# def _has_docshare_for_appointment(doc, user):
#     if not doc or not getattr(doc, "name", None):
#         return False

#     return frappe.db.exists(
#         "DocShare",
#         {
#             "user": user,
#             "share_doctype": "Appointment",
#             "share_name": doc.name,
#         },
#     )


# def appointment_has_permission(doc, ptype, user):
#     if not user:
#         user = frappe.session.user

#     if "System Manager" in frappe.get_roles(user):
#         return True

#     if doc.owner == user:
#         return True

#     if _is_owner_or_assigned(doc, user):
#         return True

#     if user in _get_appointment_custom_participants(doc):
#         return True

#     if _has_docshare_for_appointment(doc, user):
#         return True

#     return False


# def appointment_permission_query(user):
#     if "System Manager" in frappe.get_roles(user):
#         return ""

#     user_esc = frappe.db.escape(user).strip("'")

#     conditions = [
#         f"`tabAppointment`.owner = {frappe.db.escape(user)}",
#         _assigned_to_exists_sql("Appointment", user),
#         f"`tabAppointment`._assign LIKE '%\"{user_esc}\"%'",
#         f"EXISTS (SELECT 1 FROM `tabMultiselect Users` mu WHERE mu.parenttype = 'Appointment' AND mu.parent = `tabAppointment`.name AND mu.parentfield = 'custom_participants' AND mu.user = {frappe.db.escape(user)})",
#         f"EXISTS (SELECT 1 FROM `tabDocShare` ds WHERE ds.user = {frappe.db.escape(user)} AND ds.share_doctype = 'Appointment' AND ds.share_name = `tabAppointment`.name)",
#     ]

#     return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"


# def quotation_has_permission(doc, ptype, user):
#     return has_common_permission(
#         doc,
#         user,
#         sales_person_field="sales_person"
#     )
 
 
# def quotation_permission_query(user):
#     return common_permission_query(
#         user,
#         doctype="Quotation",
#         sales_person_field="sales_person"
#     )

def quotation_has_permission(doc, ptype, user):
    ptype = (ptype or "read").lower()

    # System Manager keeps full access.
    if "System Manager" in frappe.get_roles(user):
        return True

    # Owner / assigned user can read and edit.
    if _is_owner_or_assigned(doc, user):
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
    conditions.append(_assigned_to_exists_sql("Quotation", user))

    # Team lead can read docs owned by direct reports.
    team_users = _get_direct_report_users(user)
    if team_users:
        team_users_sql = ", ".join(frappe.db.escape(u) for u in team_users)
        conditions.append(f"`tabQuotation`.owner IN ({team_users_sql})")

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

 
# def orc_has_permission(doc, ptype, user):
#     return has_common_permission(
#         doc,
#         user,
#         sales_person_field="sales_person"
#     )
 
 
# def orc_permission_query(user):
#     return common_permission_query(
#         user,
#         doctype="ORC List",
#         sales_person_field="sales_person"
#     )

import frappe
 
# def get_allowed_customers(user):

#     # System Manager → all customers

#     if "System Manager" in frappe.get_roles(user):

#         return []
 
#     from renewal_module.user_permissions import calllist_permission_query
 
#     condition = calllist_permission_query(user)

#     if not condition:

#         return []
 
#     customers = frappe.db.sql(f"""

#         SELECT DISTINCT name1

#         FROM `tabCall List`

#         WHERE {condition}

#         AND name1 IS NOT NULL

#     """, pluck="name1")
 
#     return list(set(filter(None, customers)))


def get_allowed_customers(user):
    roles = frappe.get_roles(user)

    tech_roles = [
        "L1 - Tech Support",
        "Tech Support",
        "L2 - Tech Support",
        "L3 - Tech Support"
    ]

    # TECH → ALL CUSTOMERS
    if any(r in roles for r in tech_roles):
        return []  # empty list = no restriction

    # SYSTEM MANAGER → ALL
    if "System Manager" in roles:
        return []

    # SALES → restricted
    sales_persons = get_visible_sales_persons(user)
    if not sales_persons:
        return []

    sp_list = ", ".join(frappe.db.escape(sp) for sp in sales_persons)

    return frappe.db.sql(f"""
        SELECT DISTINCT parent as customer  
        FROM `tabSales Team`
        WHERE sales_person IN ({sp_list})
    """, pluck="customer")

 
import frappe

from renewal_module.user_permissions import get_allowed_customers
 
# def contact_has_permission(doc, ptype, user):

#     # Admin

#     if "System Manager" in frappe.get_roles(user):

#         return True
 
#     # Owner

#     if doc.owner == user:

#         return True
 
#     # Assigned

#     if doc._assign and user in frappe.parse_json(doc._assign):

#         return True
 
#     customers = get_allowed_customers(user)

#     if not customers:

#         return False
 
#     # Link exists → allow

#     return frappe.db.exists(

#         "Dynamic Link",

#         {

#             "parent": doc.name,

#             "link_doctype": "Customer",

#             "link_name": ("in", customers)

#         }

#     )


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

 
# def contact_permission_query(user):

#     if "System Manager" in frappe.get_roles(user):

#         return ""
 
#     customers = get_allowed_customers(user)

#     if not customers:

#         return f"`tabContact`.owner = '{user}'"
 
#     #cust_list = "', '".join(customers)
#     cust_list = ", ".join(frappe.db.escape(c) for c in customers)
 
#     return f"""

#         `tabContact`.owner = '{user}'

#         OR EXISTS (

#             SELECT 1 FROM `tabDynamic Link` dl

#             WHERE dl.parent = `tabContact`.name

#             AND dl.link_doctype = 'Customer'

#             AND dl.link_name IN ({cust_list})

#         )

#     """

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

from renewal_module.user_permissions import get_allowed_customers
 
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

 