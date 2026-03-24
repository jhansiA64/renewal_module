import frappe

SUPPORT_ROLES = {"L1 - Tech Support", "L2 - Tech Support", "L3 - Tech Support", "Tech Support"}


def appointment_permission_query(user):
	if not user:
		user = frappe.session.user

	roles = frappe.get_roles(user)
	if "System Manager" in roles or user == "Administrator":
		return ""

	# if not any(role in SUPPORT_ROLES for role in roles):
	# 	return ""

	users = get_all_child_users(user)
	if not users:
		users = [user]

	user_placeholders = ", ".join([frappe.db.escape(u) for u in users])

	assign_conditions = []
	for u in users:
		escaped_user = frappe.db.escape(u)
		assign_conditions.append(f"INSTR(`tabAppointment`.`_assign`, {escaped_user}) > 0")

	assign_clause = " OR ".join(assign_conditions) if assign_conditions else "0=1"

	return f"""(
		`tabAppointment`.`owner` IN ({user_placeholders})
		OR {assign_clause}
		OR EXISTS (
			SELECT 1
			FROM `tabMultiselect Users` mu
			WHERE mu.parent = `tabAppointment`.name
			  AND mu.parentfield = 'custom_participants'
			  AND mu.user IN ({user_placeholders})
		)
	)"""

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