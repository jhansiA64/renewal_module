
import frappe

def issue_has_permission(doc, ptype, user):

    # System Manager → full access
    # Check if user has at least one of these roles
    user_roles = frappe.get_roles(user)
    if any(role in user_roles for role in ["System Manager", "Arya - Accounts Manager", "Renewal Manager"]):
        return True

    # Direct user match on key fields
    if doc.owner == user:
        return True

    if doc.working_agent == user:
        return True

    if doc._assign and user in frappe.parse_json(doc._assign):
        return True

    # Sales person match - check both sales person name AND direct user match
    if hasattr(doc, 'sales_person') and doc.sales_person:
        # Check 1: Does sales_person field contain the user directly?
        if doc.sales_person == user:
            return True
        
        # Check 2: Does sales_person field match user's linked Sales Person record?
        user_employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
        if user_employee:
            user_sales_person = frappe.db.get_value(
                "Sales Person",
                {"employee": user_employee},
                "name"
            )
            if user_sales_person and doc.sales_person == user_sales_person:
                return True

    # ============================================================
    # ✅ COMPREHENSIVE TEAM LEAD CHECK - Check ALL fields
    # ============================================================
    # Get all users under this team lead
    team_lead_users = get_all_child_users(user)
    
    if team_lead_users:
        # Check 1: Owner is a child user
        if doc.owner in team_lead_users:
            return True
        
        # Check 2: Working agent is a child user
        if doc.working_agent and doc.working_agent in team_lead_users:
            return True
        
        # Check 3: Assigned user is a child user
        if doc._assign:
            try:
                assigned_users = frappe.parse_json(doc._assign)
                for assigned_user in assigned_users:
                    if assigned_user in team_lead_users:
                        return True
            except Exception:
                pass
        
        # Check 4: Sales person belongs to a child user
        if hasattr(doc, 'sales_person') and doc.sales_person:
            # Get employee for each child user and check their sales person
            for child_user in team_lead_users:
                child_employee = frappe.db.get_value(
                    "Employee",
                    {"user_id": child_user},
                    "name"
                )
                if child_employee:
                    child_sales_person = frappe.db.get_value(
                        "Sales Person",
                        {"employee": child_employee},
                        "name"
                    )
                    if child_sales_person and doc.sales_person == child_sales_person:
                        return True

    return False


# ---------------------------------------------------------
# LIST VIEW PERMISSION (FILTER ISSUES)
# ---------------------------------------------------------
def issue_permission_query(user):
    """
    Returns WHERE clause string only (as Frappe expects).
    Checks ALL fields: owner, working_agent, sales_person, _assign
    If ANY field contains a child user, parent team lead can see it.
    Uses safe parameterization with frappe.db.escape().
    """

    # System Manager → no restriction
    # if "System Manager" in frappe.get_roles(user):
    #     return ""
    user_roles = frappe.get_roles(user)
    if any(role in user_roles for role in ["System Manager", "Arya - Accounts Manager", "Renewal Manager"]):
        return ""

    # Get employee from user
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        "name"
    )

    if not employee:
        return "1=0"

    # Get sales person
    sales_person = frappe.db.get_value(
        "Sales Person",
        {"employee": employee},
        ["name", "is_group", "lft", "rgt"],
        as_dict=True
    )

    conditions = []

    # ============================================================
    # TEAM LEAD CASE - CHECK ALL FIELDS FOR CHILD USERS AND TEAM LEAD
    # Uses BOTH Employee.reports_to AND Sales Person hierarchy
    # ============================================================
    
    # Get all child users using the helper function (includes team lead themselves)
    users = get_all_child_users(user)
    
    # If user has subordinates (via Employee or Sales Person hierarchy)
    if users:
        # Get employee names for sales person lookup
        child_employees = frappe.db.get_all(
            "Employee",
            filters={"user_id": ("in", users)},
            pluck="name"
        )

        if users:
            user_placeholders = ", ".join([frappe.db.escape(u) for u in users])
            
            # ✅ Condition 1: Owner is any team member
            conditions.append(f"`tabIssue`.`owner` IN ({user_placeholders})")
            
            # ✅ Condition 2: Working agent is any team member (including NULL)
            conditions.append(f"`tabIssue`.`working_agent` IN ({user_placeholders})")
            
            # ✅ Condition 3: Assigned to any team member
            assign_conditions = []
            for u in users:
                escaped_user = frappe.db.escape(u)
                assign_conditions.append(f"INSTR(`tabIssue`.`_assign`, {escaped_user}) > 0")
            
            if assign_conditions:
                conditions.append("(" + " OR ".join(assign_conditions) + ")")
            
            # ✅ Condition 4: Sales person belongs to any team member (including team lead themselves)
            # Get all sales persons for team members
            if child_employees:
                child_sales_persons = frappe.db.get_all(
                    "Sales Person",
                    filters={"employee": ("in", child_employees)},
                    pluck="name"
                )
                
                if child_sales_persons:
                    sp_placeholders = ", ".join([frappe.db.escape(sp) for sp in child_sales_persons])
                    conditions.append(f"`tabIssue`.`sales_person` IN ({sp_placeholders})")
            
            # ✅ Condition 5: Sales person matches team lead OR child users directly
            conditions.append(f"`tabIssue`.`sales_person` IN ({user_placeholders})")

        return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"

    # ============================================================
    # NORMAL USER CASE - Can only see their own tickets
    # ============================================================
    user_escaped = frappe.db.escape(user)
    
    # User can see issues where they are:
    conditions.append(f"(`tabIssue`.`working_agent` = {user_escaped} OR (`tabIssue`.`working_agent` IS NULL AND `tabIssue`.`owner` = {user_escaped}))")
    conditions.append(f"`tabIssue`.`owner` = {user_escaped}")
    conditions.append(f"INSTR(`tabIssue`.`_assign`, {user_escaped}) > 0")
    
    # Check if user is linked as sales_person (by name OR by user ID)
    sales_person_name = frappe.db.get_value(
        "Sales Person",
        {"employee": employee},
        "name"
    )
    
    # Add condition: sales_person equals user directly OR equals sales person name
    if sales_person_name:
        sp_escaped = frappe.db.escape(sales_person_name)
        conditions.append(f"(`tabIssue`.`sales_person` = {sp_escaped} OR `tabIssue`.`sales_person` = {user_escaped})")
    else:
        # If no sales person name found, still check if sales_person field contains user ID
        conditions.append(f"`tabIssue`.`sales_person` = {user_escaped}")
    
    return "(" + " OR ".join(conditions) + ")"


# ---------------------------------------------------------
# LEGACY FUNCTION - KEPT FOR BACKWARD COMPATIBILITY
# ---------------------------------------------------------
def issue_permission_query_legacy(user):
    """
    Legacy version returning raw SQL string.
    Use issue_permission_query() for new code instead.
    """

    # System Manager → no restriction
    if "System Manager" in frappe.get_roles(user):
        return ""

    # Get employee from user
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        "name"
    )

    if not employee:
        return "1=0"

    # Get sales person
    sales_person = frappe.db.get_value(
        "Sales Person",
        {"employee": employee},
        ["name", "is_group", "lft", "rgt"],
        as_dict=True
    )

    conditions = []

    # TEAM LEAD
    if sales_person and sales_person.is_group:

        # Get child sales persons' employees
        child_employees = frappe.db.get_all(
            "Sales Person",
            filters={
                "lft": (">", sales_person.lft),
                "rgt": ("<", sales_person.rgt),
                "is_group": 0
            },
            pluck="employee"
        )

        # Include team lead himself
        child_employees.append(employee)
        child_employees = list(set(child_employees))

        # Convert employees → users
        users = frappe.db.get_all(
            "Employee",
            filters={"name": ("in", child_employees)},
            pluck="user_id"
        )

        if users:
            user_list = "', '".join(users)

            # 1. Working agent under team
            conditions.append(
                f"`tabIssue`.working_agent IN ('{user_list}')"
            )
            
            # 2. Owner (created) is any team member
            conditions.append(
                f"`tabIssue`.owner IN ('{user_list}')"
            )

            # 3. Assigned to team members
            conditions.append(
                f"`tabIssue`._assign LIKE '%{user}%'"
            )

        return "(" + " OR ".join(conditions) + ")" if conditions else "1=0"

    # NORMAL USER
    conditions.append(f"`tabIssue`.working_agent = '{user}'")
    conditions.append(f"`tabIssue`.owner = '{user}'")
    conditions.append(f"`tabIssue`._assign LIKE '%{user}%'")
    
    # Get sales person of the user
    sales_person_name = frappe.db.get_value(
        "Sales Person",
        {"employee": employee},
        "name"
    )
    
    if sales_person_name:
        conditions.append(f"`tabIssue`.sales_person = '{sales_person_name}'")

    return "(" + " OR ".join(conditions) + ")"


# ---------------------------------------------------------
# HELPER: GET ALL CHILD USERS UNDER A TEAM LEAD
# ---------------------------------------------------------
def get_all_child_users(user):
    """
    Returns list of all users under this team lead (including the team lead themselves).
    Checks BOTH Employee.reports_to hierarchy AND Sales Person hierarchy.
    Returns empty list if user is not a team lead.
    """
    
    # Get employee from user
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        "name"
    )
    
    if not employee:
        return []
    
    all_child_users = set()
    
    # ============================================================
    # METHOD 1: Employee.reports_to hierarchy (recursive)
    # ============================================================
    def get_employee_subordinates(emp_id):
        """Recursively get all subordinates via reports_to field"""
        subordinates = []
        
        # Get direct reports
        direct_reports = frappe.db.get_all(
            "Employee",
            filters={"reports_to": emp_id},
            pluck="name"
        )
        
        for subordinate in direct_reports:
            subordinates.append(subordinate)
            # Recursively get their subordinates
            subordinates.extend(get_employee_subordinates(subordinate))
        
        return subordinates
    
    # Get all subordinates via Employee hierarchy
    employee_subordinates = get_employee_subordinates(employee)
    
    # Include the manager themselves
    employee_subordinates.append(employee)
    
    # Convert employees to users
    if employee_subordinates:
        emp_users = frappe.db.get_all(
            "Employee",
            filters={"name": ("in", employee_subordinates)},
            pluck="user_id"
        )
        all_child_users.update([u for u in emp_users if u])
    
    # ============================================================
    # METHOD 2: Sales Person hierarchy (nested set)
    # ============================================================
    sales_person = frappe.db.get_value(
        "Sales Person",
        {"employee": employee},
        ["name", "is_group", "lft", "rgt"],
        as_dict=True
    )
    
    if sales_person and sales_person.is_group:
        # Get all child sales persons
        child_employees = frappe.db.get_all(
            "Sales Person",
            filters={
                "lft": (">", sales_person.lft),
                "rgt": ("<", sales_person.rgt),
                "is_group": 0
            },
            pluck="employee"
        )
        
        # Include team lead himself
        child_employees.append(employee)
        child_employees = list(set(child_employees))
        
        # Convert employees → users
        sp_users = frappe.db.get_all(
            "Employee",
            filters={"name": ("in", child_employees)},
            pluck="user_id"
        )
        all_child_users.update([u for u in sp_users if u])
    
    # Return combined list from both hierarchies
    return list(all_child_users)


# ---------------------------------------------------------
# HELPER: GET TEAM LEAD USER FROM WORKING AGENT
# ---------------------------------------------------------
def get_team_lead_user(user):

    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        "name"
    )

    if not employee:
        return None

    sales_person = frappe.db.get_value(
        "Sales Person",
        {"employee": employee},
        ["parent_sales_person"],
        as_dict=True
    )

    if not sales_person or not sales_person.parent_sales_person:
        return None

    parent_employee = frappe.db.get_value(
        "Sales Person",
        sales_person.parent_sales_person,
        "employee"
    )

    if not parent_employee:
        return None

    return frappe.db.get_value(
        "Employee",
        parent_employee,
        "user_id"
    )


# ---------------------------------------------------------
# HELPER: CHECK IF USER IS TEAM LEAD WITH CHILD USER
# ---------------------------------------------------------
def is_team_lead_with_child_user(team_lead_user, child_user):
    """
    Check if team_lead_user is a team lead and child_user is their child employee.
    Returns True if team_lead_user can see issues of child_user.
    """
    
    if not team_lead_user or not child_user:
        return False
    
    # Get team lead's employee record
    team_lead_employee = frappe.db.get_value(
        "Employee",
        {"user_id": team_lead_user},
        "name"
    )
    
    if not team_lead_employee:
        return False
    
    # Get team lead's sales person (must be a group)
    team_lead_sp = frappe.db.get_value(
        "Sales Person",
        {"employee": team_lead_employee},
        ["name", "is_group", "lft", "rgt"],
        as_dict=True
    )
    
    if not team_lead_sp or not team_lead_sp.is_group:
        return False
    
    # Get child user's employee record
    child_employee = frappe.db.get_value(
        "Employee",
        {"user_id": child_user},
        "name"
    )
    
    if not child_employee:
        return False
    
    # Get child user's sales person
    child_sp = frappe.db.get_value(
        "Sales Person",
        {"employee": child_employee},
        ["name", "lft", "rgt"],
        as_dict=True
    )
    
    if not child_sp:
        return False
    
    # Check if child sales person is under team lead's hierarchy
    # (child is between team lead's lft and rgt)
    if (child_sp.lft > team_lead_sp.lft and 
        child_sp.rgt < team_lead_sp.rgt):
        return True
    
    return False
