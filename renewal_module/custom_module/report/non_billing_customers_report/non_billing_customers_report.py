# Copyright (c) 2025, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe 
from frappe.utils import nowdate, getdate
from datetime import date


def execute(filters=None):    
    filters = filters or {}
    columns, data = get_customers_data(filters)    

    currency = filters.get("presentation_currency") or frappe.get_cached_value(
        "Company", filters.get("company"), "default_currency"
    )

    # Initialize select_row to 0 for all rows
    for row in data:
        row["select_row"] = 0
        # ensure gap_years is string for display
        if "gap_years" in row and row["gap_years"] is None:
            row["gap_years"] = "Never"
        elif "gap_years" in row:
            row["gap_years"] = str(row["gap_years"]) if row["gap_years"] is not None else "Never"
        
    report_summary = get_report_summary(filters,columns, currency, data)
    chart = get_chart_data(filters, columns, data)

    # return in ERPNext report format
    return columns, data, None, chart, report_summary


def get_customers_data(filters):
    # Build SQL conditions from other filters
    conditions, values = get_conditions(filters)
    sub_conditions = []

    # Contacts filter (existing behavior)
    if filters.get("contacts") == "Customers With Contacts":
        sub_conditions.append("""
            EXISTS (
                SELECT 1 FROM `tabDynamic Link` tdl
                JOIN tabContact c ON tdl.parent = c.name
                WHERE tdl.link_doctype = 'Customer' AND tdl.link_name = tc.name
            )
        """)
    elif filters.get("contacts") == "Customers Without Contacts":
        sub_conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM `tabDynamic Link` tdl
                JOIN tabContact c ON tdl.parent = c.name
                WHERE tdl.link_doctype = 'Customer' AND tdl.link_name = tc.name
            )
        """)

    if filters.get("renewals") == "Customers With Renewals":
        sub_conditions.append("""
            EXISTS (
                SELECT 1 FROM `tabRenewal List` r
                WHERE r.customer_name = tc.name and r.status = "Active"
            )
        """)
    elif filters.get("renewals") == "Customers Without Renewals":
        sub_conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM `tabRenewal List` r
                WHERE r.customer_name = tc.name
            )
        """)

    # Billing gap handling (OPTION 1): select customers who have NOT been invoiced
    # in the specified *recent* N financial years (including current FY).
    billing_gap = filters.get("billing_gap")
    if billing_gap:
        fy_start, fy_end = get_recent_fy_range(billing_gap)
        if fy_start and fy_end:
            # we will add a NOT EXISTS sub-condition to exclude customers
            # who have any submitted Sales Invoice (docstatus=1) in that period
            sub_conditions.append(f"""
                NOT EXISTS (
                    SELECT 1 FROM `tabSales Invoice` si
                    WHERE si.customer = tc.name
                    AND si.docstatus = 1
                    AND si.posting_date BETWEEN '{fy_start}' AND '{fy_end}'
                )
            """)
        elif billing_gap == "Never":
            # customers who never had an invoice
            sub_conditions.append("""
                NOT EXISTS (
                    SELECT 1 FROM `tabSales Invoice` si
                    WHERE si.customer = tc.name
                    AND si.docstatus = 1
                )
            """)

    final_conditions = " AND ".join(sub_conditions)
    if final_conditions:
        conditions += f" AND {final_conditions}"

    where_clause = f"1=1 {conditions}"

    
    # Fetch customers and basic fields
    data = frappe.db.sql(f"""
    SELECT
        0 AS select_row,
        tc.name AS customer,
        tc.owner AS owner,
        GROUP_CONCAT(DISTINCT tst.sales_person) AS sales_person,
        tc.employees,
        tc.gstin,
        tc.industry,
        tc.territory
    FROM `tabCustomer` tc
    LEFT JOIN `tabSales Team` tst ON tst.parent = tc.name
    WHERE {where_clause}
    GROUP BY tc.name
    ORDER BY tc.name
    
    """, values, as_dict=True)

    # Compute gap_years (years since last invoice) for display *only* (we don't use
    # last invoice date to filter — filtering was done in SQL via NOT EXISTS above)
    for row in data:
        last_invoice = frappe.db.sql(
            """
            SELECT MAX(posting_date) FROM `tabSales Invoice`
            WHERE customer=%s AND docstatus=1
            """,
            row.customer
        )
        last_invoice_date = last_invoice[0][0] if last_invoice and last_invoice[0][0] else None

        if last_invoice_date:
            row["gap_years"] = get_financial_year_gap(last_invoice_date)
        else:
            row["gap_years"] = None

    return get_columns(), data


def get_recent_fy_range(billing_gap_label):
    """Return a (start_date, end_date) string tuple for the period we want to check
    for invoices. For labels like '1 Year', '2 Years', '3+ Years' we return the range
    covering the most recent N financial years (including current FY).
    For 'Never' return (None, None) because we handle it separately.
    Dates are returned as 'YYYY-MM-DD' strings.
    """
    today = getdate(nowdate())
    today_fy_start = today.year if today.month >= 4 else today.year - 1

    if billing_gap_label == "Never":
        return None, None

    # handle labels like '3+ Years'
    if billing_gap_label.endswith("+ Years"):
        try:
            n = int(billing_gap_label.split("+")[0].strip())
        except Exception:
            n = None
        if n is None:
            return None, None
        # start from fy_start of (today_fy_start - (n-1)) to end of current FY
        start_fy = today_fy_start - (n - 1)
    else:
        # expected format 'X Year' or 'X Years'
        try:
            n = int(billing_gap_label.split()[0])
        except Exception:
            return None, None
        start_fy = today_fy_start - (n - 1)

    start_date = date(start_fy, 4, 1).isoformat()
    end_date = date(today_fy_start + 1, 3, 31).isoformat()
    return start_date, end_date


def match_gap_filter(filter_value, gap_years):
    # kept for backward compatibility if other code paths call it
    if gap_years is None:
        return filter_value in ["5 Years", "5+ Years", "Never"]

    if filter_value.endswith("Years") or filter_value.endswith("Year"):
        try:
            num = int(filter_value.split(" ")[0])
            return gap_years == num
        except:
            pass

    if filter_value.endswith("+ Years"):
        try:
            num = int(filter_value.split("+")[0])
            return gap_years >= num
        except:
            pass

    return True


def get_financial_year_gap(last_invoice_date):
    if not last_invoice_date:
        return None

    invoice_year = getdate(last_invoice_date).year
    invoice_month = getdate(last_invoice_date).month

    invoice_fy_start = invoice_year if invoice_month >= 4 else invoice_year - 1

    today = getdate(nowdate())
    today_fy_start = today.year if today.month >= 4 else today.year - 1

    return today_fy_start - invoice_fy_start


def get_columns():
    return [
        {"label": "Select", "fieldname": "select_row", "fieldtype": "Check", "width": 60},
        {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 300},
        {"label": "Employees", "fieldname": "employees", "fieldtype": "Data", "width": 80},
        {"label": "Industry", "fieldname": "industry", "fieldtype": "Data", "width": 200},
        {"label": "Territory", "fieldname": "territory", "fieldtype": "Data", "width": 200},
        {"label": "Sales Person", "fieldname": "sales_person", "fieldtype": "Data", "width": 200},
        {"label": "Created By", "fieldname": "owner", "fieldtype": "Data", "width": 200},
        {"label": "Amount", "fieldname": "amount", "fieldtype": "Currency", "width": 200},
        {"label": "Billing Gap (Years)", "fieldname": "gap_years", "fieldtype": "Data", "width": 130}
    ]


def get_allowed_sales_persons(user):
    if user == "Administrator" or "System Manager" in frappe.get_roles(user):
        return None  # Means unrestricted access (show all)
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return []
    sales_person_doc = frappe.get_all("Sales Person", filters={"employee": employee}, fields=["name", "is_group"])
    if not sales_person_doc:
        return []
    sales_person = sales_person_doc[0]["name"]
    is_group = sales_person_doc[0]["is_group"]
    if is_group:
        children = frappe.get_all("Sales Person", filters={"parent_sales_person": sales_person}, pluck="name")
        return [sales_person] + children
    else:
        return [sales_person]


def get_conditions(filters):
    conditions = []
    values = {}

    user = frappe.session.user
    selected_sales_persons = filters.get("sales_person")

    if not selected_sales_persons:
        allowed_salespersons = get_allowed_sales_persons(user)
        if allowed_salespersons is not None:
            conditions.append("tst.sales_person IN %(allowed_sales_persons)s")
            values["allowed_sales_persons"] = tuple(allowed_salespersons)
    else:
        conditions.append("tst.sales_person IN %(sales_person)s")
        values["sales_person"] = tuple(selected_sales_persons)
    
    if filters.get("territory"):
        conditions.append("tc.territory IN %(territory)s")
        values["territory"] = tuple(filters.get("territory"))

    if filters.get("industry"):
        conditions.append("tc.industry IN %(industry)s")
        values["industry"] = tuple(filters.get("industry"))

    if filters.get("created_by"):
        conditions.append("tc.owner IN %(created_by)s")
        values["created_by"] = tuple(filters.get("created_by"))

    if filters.get("starts_with"):
        letters = filters.get("starts_with")
        like_conditions = []
        for i, letter in enumerate(letters):
            key = f"starts_with_{i}"
            like_conditions.append(f"tc.name LIKE %({key})s")
            values[key] = f"{letter}%"
        if like_conditions:
            conditions.append("(" + " OR ".join(like_conditions) + ")")

    return (" AND " + " AND ".join(conditions)) if conditions else "", values


def get_report_summary(filters,columns, currency, data):
    customer_count = 0
    customer_list = []
    if data:
        for period in data:
            if period.customer not in customer_list :
                customer_list.append(period.customer)
                customer_count += 1        

    return [
        {
            "value": f"{customer_count:,}",
            "indicator": "Green",
            "label": "Customer Count",
            "datatype": "Data"
        }
    ]


def get_chart_data(filters, columns, data):
    customer_count = 0
    if data:
        for period in data:
            if period.customer:
                customer_count += 1

    return {
        "data": {
            "labels": ["Customers Count"],
            "datasets": [{"values": [customer_count]}],
        },
        "type": "pie",
        "colors": ["#c80064"],
    }
