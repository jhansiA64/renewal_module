import frappe
from frappe.utils import nowdate, getdate
from datetime import date

# ======================
# Main report execute
# ======================
def execute(filters=None):
    filters = filters or {}

    # Step 1: Get non-billing customers (primary dataset)
    customers = get_non_billing_customers(filters)

    if not customers:
        return get_columns(), [], None, {}, get_report_summary([])

    # Step 2: Get all details for these customers
    data = get_customer_details(customers)

    # Step 3: Apply filters in Python
    filtered_data = filter_customers(data, filters)

    # Step 4: Prepare report summary and chart
    report_summary = get_report_summary(filtered_data)
    chart = get_chart_data(filtered_data)

    return get_columns(), filtered_data, None, chart, report_summary


# ======================
# Step 1: Fetch non-billing customers
# ======================
def get_non_billing_customers(filters):
    billing_gap = filters.get("billing_gap")
    fy_start, fy_end = None, None

    if billing_gap and billing_gap != "Never":
        fy_start, fy_end = get_recent_fy_range(billing_gap)

    conditions = []

    if billing_gap == "Never":
        conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM `tabSales Invoice` si
                WHERE si.customer = c.name AND si.docstatus = 1
            )
        """)
    elif fy_start and fy_end:
        conditions.append(f"""
            NOT EXISTS (
                SELECT 1 FROM `tabSales Invoice` si
                WHERE si.customer = c.name
                  AND si.docstatus = 1
                  AND si.posting_date BETWEEN '{fy_start}' AND '{fy_end}'
            )
        """)

    # Add territory filter here if specified
    if filters.get("territory"):
        territory_list = "', '".join(filters.get("territory"))
        conditions.append(f"c.territory IN ('{territory_list}')")

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # Fetch distinct customer names
    customers = frappe.db.sql(f"""
        SELECT DISTINCT c.name AS customer
        FROM `tabCustomer` c
        WHERE {where_clause}
        ORDER BY c.name
    """, as_dict=True)

    return [c.customer for c in customers]


def get_recent_fy_range(billing_gap_label):
    today = getdate(nowdate())
    today_fy_start = today.year if today.month >= 4 else today.year - 1

    if billing_gap_label == "Never":
        return None, None

    if billing_gap_label.endswith("+ Years"):
        try:
            n = int(billing_gap_label.split("+")[0].strip())
        except Exception:
            return None, None
        start_fy = today_fy_start - (n - 1)
    else:
        try:
            n = int(billing_gap_label.split()[0])
        except Exception:
            return None, None
        start_fy = today_fy_start - (n - 1)

    start_date = date(start_fy, 4, 1).isoformat()
    end_date = date(today_fy_start + 1, 3, 31).isoformat()
    return start_date, end_date


# ======================
# Step 2: Fetch customer details for given customers
# ======================
def get_customer_details(customers):
    if not customers:
        return []

    data = frappe.db.sql("""
        SELECT
            c.name AS customer,
            c.owner,
            c.employees,
            c.gstin,
            c.industry,
            c.territory,
            (SELECT GROUP_CONCAT(sales_person)
             FROM `tabSales Team` st
             WHERE st.parent=c.name
            ) AS sales_person,
            (SELECT COUNT(*) FROM `tabRenewal List` r
             WHERE r.customer_name=c.name AND r.status='Active') AS active_renewals,
            (SELECT COUNT(*) FROM `tabDynamic Link` dl
             JOIN `tabContact` ct ON dl.parent=ct.name
             WHERE dl.link_doctype='Customer' AND dl.link_name=c.name) AS contacts_count
        FROM `tabCustomer` c
        WHERE c.name IN %(customers)s
        ORDER BY c.name
    """, {"customers": tuple(customers)}, as_dict=True)

    return data


# ======================
# Step 3: Filter in Python
# ======================
def filter_customers(data, filters):
    filtered_data = []

    for row in data:
        # Contacts filter
        contacts = filters.get("contacts")
        if contacts == "Customers With Contacts" and row.contacts_count == 0:
            continue
        if contacts == "Customers Without Contacts" and row.contacts_count > 0:
            continue

        # Renewals filter
        renewals = filters.get("renewals")
        if renewals == "Customers With Renewals" and row.active_renewals == 0:
            continue
        if renewals == "Customers Without Renewals" and row.active_renewals > 0:
            continue

        # Industry filter
        if filters.get("industry") and row.industry not in filters.get("industry"):
            continue

        # Sales person filter
        if filters.get("sales_person"):
            sp_list = (row.sales_person or "").split(",")
            if not any(sp in filters.get("sales_person") for sp in sp_list):
                continue

        # Starts with filter
        if filters.get("starts_with") and not any(row.customer.startswith(l) for l in filters.get("starts_with")):
            continue

        # Compute gap_years
        last_invoice = frappe.db.sql(
            "SELECT MAX(posting_date) FROM `tabSales Invoice` WHERE customer=%s AND docstatus=1",
            row.customer
        )
        last_invoice_date = last_invoice[0][0] if last_invoice and last_invoice[0][0] else None
        row["gap_years"] = get_financial_year_gap(last_invoice_date) if last_invoice_date else "Never"

        # Initialize select_row
        row["select_row"] = 0

        filtered_data.append(row)

    return filtered_data


def get_financial_year_gap(last_invoice_date):
    if not last_invoice_date:
        return None
    invoice_year = getdate(last_invoice_date).year
    invoice_month = getdate(last_invoice_date).month
    invoice_fy_start = invoice_year if invoice_month >= 4 else invoice_year - 1

    today = getdate(nowdate())
    today_fy_start = today.year if today.month >= 4 else today.year - 1

    return today_fy_start - invoice_fy_start


# ======================
# Columns, Summary, Chart
# ======================
def get_columns():
    return [
        {"label": "Select", "fieldname": "select_row", "fieldtype": "Check", "width": 60},
        {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 300},
        {"label": "Employees", "fieldname": "employees", "fieldtype": "Data", "width": 80},
        {"label": "Industry", "fieldname": "industry", "fieldtype": "Data", "width": 200},
        {"label": "Territory", "fieldname": "territory", "fieldtype": "Data", "width": 200},
        {"label": "Sales Person", "fieldname": "sales_person", "fieldtype": "Data", "width": 200},
        {"label": "Created By", "fieldname": "owner", "fieldtype": "Data", "width": 200},
        {"label": "Billing Gap (Years)", "fieldname": "gap_years", "fieldtype": "Data", "width": 130}
    ]


def get_report_summary(data):
    customer_count = len(data)
    return [{
        "value": f"{customer_count:,}",
        "indicator": "Green",
        "label": "Customer Count",
        "datatype": "Data"
    }]


def get_chart_data(data):
    customer_count = len(data)
    return {
        "data": {
            "labels": ["Customers Count"],
            "datasets": [{"values": [customer_count]}],
        },
        "type": "pie",
        "colors": ["#c80064"],
    }
