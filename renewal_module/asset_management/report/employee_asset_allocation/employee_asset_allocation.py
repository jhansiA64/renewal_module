import frappe

def execute(filters=None):
    if not filters:
        filters = {}

    columns = get_columns()
    data = get_data(filters)

    return columns, data


def get_columns():
    return [
        {"label": "Employee", "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 150},
        {"label": "Employee Name", "fieldname": "employee_name", "fieldtype": "Data", "width": 200},
        {"label": "Asset", "fieldname": "asset", "fieldtype": "Link", "options": "Company Asset", "width": 200},
        {"label": "Asset Name", "fieldname": "asset_name", "fieldtype": "Data", "width": 200},
        {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 120},
        {"label": "Issue Date", "fieldname": "issue_date", "fieldtype": "Date", "width": 120},
        {"label": "Return Date", "fieldname": "return_date", "fieldtype": "Date", "width": 120},
    ]


def get_data(filters):
    conditions = []
    values = {}

    if filters.get("employee"):
        conditions.append("ea.parent = %(employee)s")
        values["employee"] = filters.get("employee")

    if filters.get("status"):
        conditions.append("ca.status = %(status)s")
        values["status"] = filters.get("status")
    
    if filters.get("asset"):
        conditions.append("ca.name = %(asset)s")
        values["asset"] = filters.get("asset")    

    if filters.get("issue_date"):
        conditions.append("ea.issue_date >= %(issue_date)s")
        values["issue_date"] = filters.get("issue_date")

    if filters.get("to_date"):
        conditions.append("ea.issue_date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    condition_str = " AND ".join(conditions)
    if condition_str:
        condition_str = " AND " + condition_str

    query = f"""
        SELECT
            ea.parent as employee,
            e.employee_name,
            ea.asset,
            ca.asset_name,
            ca.status,
            ea.issue_date,
            ea.return_date
        FROM `tabEmployee Asset Allocation` ea
        LEFT JOIN `tabEmployee` e ON e.name = ea.parent
        LEFT JOIN `tabCompany Asset` ca ON ca.name = ea.asset
        WHERE 1=1 {condition_str}
        ORDER BY ea.issue_date DESC
    """

    return frappe.db.sql(query, values, as_dict=True)
