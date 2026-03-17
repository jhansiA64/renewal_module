from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from dateutil import relativedelta
from renewal_module.renewal_module.report.sales_data_based_on_invoice.sales_data_based_on_invoice import (
	get_data,
)
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from erpnext.accounts.utils import get_fiscal_year

from erpnext.accounts.report.utils import convert
from renewal_module.custom_module.report.target_details___invoice.target_details___invoice import (
    get_target_data, get_columns)


@frappe.whitelist()
def get_target_data1(sales_person=None):
    filters_data = {
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "timespan": "this year",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns(filters_data)	
    sales_data = get_data(filters_data)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_data)))
    data = get_target_data(filters_data, sales_data)
    months = []
    amounts = [] 
    counts = []
    sum =0.0
    frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    if data:
        for i in data:
            months.append(i.month[:3])
            amounts.append(flt(i.get("amount")))
            counts.append(i.qty)

    return {"months": months, "amounts": amounts, "counts": counts}


#new

@frappe.whitelist()
def target_category_wise_chart(sales_person=None):
    conditions = ""
    values = []

    if sales_person:
        conditions = "WHERE st.sales_person = %s"
        values.append(sales_person)

    result = frappe.db.sql(f"""
        SELECT 
            std.category,
            SUM(std.bottomline_target) AS bottomline_target, 
            SUM(std.topline_target) AS topline_target, 
            SUM(std.target_amount) AS target_amount 
        FROM `tabSub Target Details List` AS std 
        LEFT JOIN `tabSales Target` AS st ON st.name = std.parent 
        {conditions}
        GROUP BY std.category
    """, values, as_dict=True)

    # Transform the result into a format suitable for the frontend
    response = {
        "categories": [],  # X-axis labels (category types)
        "bottomline_target": [],
        "topline_target": [],
        "target_amount": []
    }

    for row in result:
        if row["category"]:  # Ensure category is not None
            response["categories"].append(row["category"])
        else:
            response["categories"].append("")  # Replace NULL with 'Unknown'
        response["bottomline_target"].append(row["bottomline_target"] or 0)
            # Ensure valid values for Topline and Target Amount
        response["topline_target"].append(row["topline_target"] if row["topline_target"] else 10000000)
        response["target_amount"].append(row["target_amount"] if row["target_amount"] else 10000000)

    return response


@frappe.whitelist()
def get_salesperson_performance(sales_person=None):
    start_date = "2024-04-01"
    end_date = "2025-03-31"

    if sales_person:
        # Fetch total sales for the specific salesperson
        total_sales = frappe.db.sql("""
            SELECT SUM(si.base_grand_total) 
            FROM `tabSales Invoice` si
            JOIN `tabSales Team` st ON si.name = st.parent
            WHERE st.sales_person = %s 
            AND si.docstatus = 1
            AND si.posting_date BETWEEN %s AND %s
        """, (sales_person, start_date, end_date), as_list=True)[0][0] or 0

        # Fetch sales target for the specific salesperson
        sales_target = frappe.db.get_value("Sales Target", 
            {"sales_person": sales_person, "fiscal_year": "2024-2025"}, 
            "target_amount"
        ) or 100000000  # Default 100M if no target found

    else:
        # Fetch total sales for all salespersons
        total_sales = frappe.db.sql("""
            SELECT SUM(si.base_grand_total) 
            FROM `tabSales Invoice` si
            JOIN `tabSales Team` st ON si.name = st.parent
            WHERE si.docstatus = 1
            AND si.posting_date BETWEEN %s AND %s
        """, (start_date, end_date), as_list=True)[0][0] or 0

        # Fetch total sales target for all salespersons
        sales_target = frappe.db.sql("""
            SELECT SUM(target_amount) FROM `tabSales Target`
            WHERE fiscal_year = '2024-2025'
        """, as_list=True)[0][0] or 100000000  # Default 100M if no target found

    # Calculate performance percentage and cap at 100%
    performance = (total_sales / sales_target) * 100 if sales_target > 0 else 0
    performance = min(performance, 100)  # Ensure max is 100%

    return {"total_sales": total_sales, "sales_target": sales_target, "performance": round(performance, 2)}




@frappe.whitelist()
def get_sales_target_category_tm(sales_person=None):
    conditions = ""
    values = []

    if sales_person:
        conditions = "WHERE st.sales_person = %s"
        values.append(sales_person)

    result = frappe.db.sql(f"""
        SELECT 
            COALESCE(std.category, '') AS category,  -- Replace NULL with 'Unknown'
            SUM(std.topline_target) AS topline_target, 
            SUM(std.target_amount) AS target_amount 
        FROM `tabSub Target Details List` AS std 
        LEFT JOIN `tabSales Target` AS st ON st.name = std.parent 
        {conditions}
        GROUP BY std.category
    """, values, as_dict=True)

    response = []

    for row in result:
        response.append({
            "category": row["category"],
            "topline_target": row["topline_target"] if row["topline_target"] else 10000000,
            "target_amount": row["target_amount"] if row["target_amount"] else 10000000,
        })

    return response


@frappe.whitelist()
def get_sales_target_category_bt_tm(sales_person=None):
    conditions = ""
    values = []

    if sales_person:
        conditions = "WHERE st.sales_person = %s"
        values.append(sales_person)

    result = frappe.db.sql(f"""
        SELECT 
            COALESCE(std.category, '') AS category,  -- Replace NULL with 'Unknown'
            SUM(std.bottomline_target) AS bottomline_target, 
            SUM(std.topline_target) AS topline_target, 
            SUM(std.target_amount) AS target_amount 
        FROM `tabSub Target Details List` AS std 
        LEFT JOIN `tabSales Target` AS st ON st.name = std.parent 
        {conditions}
        GROUP BY std.category
    """, values, as_dict=True)

    response = []

    for row in result:
        response.append({
            "category": row["category"],
            "bottomline_target": row["bottomline_target"] or 0,
            "topline_target": row["topline_target"] if row["topline_target"] else 10000000,
            "target_amount": row["target_amount"] if row["target_amount"] else 10000000,
        })

    return response

#new sales target dashboard

@frappe.whitelist()
def get_sales_target(sales_person=None):
    conditions = ""
    values = []

    if sales_person:
        conditions = "WHERE sales_person = %s"
        values.append(sales_person)

    result = frappe.db.sql(f"""
        SELECT 
            SUM(bottomline_target) AS bottom, 
            SUM(topline_target) AS top, 
            SUM(target_qty) AS qty 
        FROM `tabSales Target` 
        {conditions}
    """, values, as_dict=True)

    if result and result[0]:
        return {
            "bottomline_target": result[0].get("bottom", 0),
            "topline_target": result[0].get("top", 0),
            "target_qty": result[0].get("qty", 0)
        }
    return {"bottomline_target": 0, "topline_target": 0, "target_qty": 0}



from datetime import datetime
@frappe.whitelist()
def get_sales_target_data(sales_person=None):
    conditions = ""
    values = []
    if sales_person:
        conditions = "AND tsop.sales_person = %s"
        values.append(sales_person)
    # Get the current fiscal year
    current_date = datetime.today().date()
    current_fiscal_year = frappe.db.get_value(
        "Fiscal Year", 
        {"year_start_date": ["<=", current_date], "year_end_date": [">=", current_date]}, 
        "name"
    )
    if not current_fiscal_year:
        return []  # Return empty if no fiscal year is found
    values.append(current_fiscal_year)
    # Define fiscal months
    fiscal_months = [
        (1, "Apr"), (2, "May"), (3, "Jun"), (4, "Jul"), (5, "Aug"), (6, "Sep"),
        (7, "Oct"), (8, "Nov"), (9, "Dec"), (10, "Jan"), (11, "Feb"), (12, "Mar")
    ]
    # Fetch actual data
    raw_data = frappe.db.sql(f'''
        SELECT
            tsop.fiscal_year,
            CASE
                WHEN MONTH(tsop.transaction_date) >= MONTH(tsop.year_start_date)
                THEN MONTH(tsop.transaction_date) - MONTH(tsop.year_start_date) + 1
                ELSE 12 - (MONTH(tsop.year_start_date) - MONTH(tsop.transaction_date)) + 1
            END AS fiscal_month,
            COALESCE((SUM(DISTINCT bottomline_target) * COUNT(DISTINCT `tabSales Target`.sales_person)) / 
                     (12 * NULLIF(COUNT(DISTINCT bottomline_target), 0)), 0) AS `Bottomline Target`,
            COALESCE(SUM(tsop.net_profit), 0) AS `Achieved`,
            (COALESCE((SUM(DISTINCT bottomline_target) * COUNT(DISTINCT `tabSales Target`.sales_person)) / 
                     (12 * NULLIF(COUNT(DISTINCT bottomline_target), 0)), 0) 
            - COALESCE(SUM(tsop.net_profit), 0)) AS Variance,
            COALESCE(AVG(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year), 0) AS Average,
            COALESCE(MAX(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year), 0) AS Max_Achieved,
            COALESCE(MIN(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year), 0) AS Min_Achieved
        FROM
            `tabSales Target`
        INNER JOIN (
            SELECT
                `tabSales Order Item`.parent,
                `tabSales Order`.transaction_date,
                `tabFiscal Year`.name AS fiscal_year,
                `tabFiscal Year`.year_start_date AS year_start_date,
                `tabSales Team`.sales_person,
                `tabSales Order Item`.base_net_amount - COALESCE(tcofi.purchase_amount, 0) AS net_profit
            FROM 
                `tabSales Order`
            INNER JOIN `tabSales Order Item` ON `tabSales Order Item`.parent = `tabSales Order`.name
            LEFT JOIN `tabCustomer Order Form Item` tcofi ON `tabSales Order`.cof_id = tcofi.parent 
            LEFT JOIN `tabSales Team` ON `tabSales Order Item`.parent = `tabSales Team`.parent
            LEFT JOIN `tabFiscal Year` ON `tabFiscal Year`.year_start_date <= `tabSales Order`.transaction_date  
                AND `tabSales Order`.transaction_date <= `tabFiscal Year`.year_end_date
            WHERE `tabSales Order`.docstatus=1
            {f'AND `tabSales Team`.sales_person = %s' if sales_person else ''}
        ) AS tsop 
        ON `tabSales Target`.sales_person = tsop.sales_person 
        AND `tabSales Target`.fiscal_year = tsop.fiscal_year
        WHERE tsop.fiscal_year = %s
        GROUP BY tsop.fiscal_year, fiscal_month
    ''', values, as_dict=True)
    
    data_dict = {row['fiscal_month']: row for row in raw_data}
    
    result = []

    for month_no, month_name in fiscal_months:
        row = data_dict.get(month_no, {})
        bottomline_target = round(row.get("Bottomline Target", 100000))
        achieved = round(row.get("Achieved", 90000))
        
        result.append({
            "fiscal_year": current_fiscal_year,
            "fiscal_month": month_no,
            "Month": month_name,
            "Bottomline Target": bottomline_target,
            "Achieved": achieved,
            "Variance": abs(bottomline_target - achieved)  # Corrected ABS usage
        })

    return result 

@frappe.whitelist()
def get_sales_target_tm(sales_person=None):
    conditions = ""
    values = []

    if sales_person:
        conditions = "WHERE sales_person = %s"
        values.append(sales_person)

    result = frappe.db.sql(f"""
        SELECT 
            SUM(bottomline_target) AS bottom, 
            SUM(topline_target) AS top, 
            SUM(target_qty) AS qty 
        FROM `tabSales Target` 
        {conditions}
    """, values, as_dict=True)

    if result and result[0]:
        return {
            "bottomline_target": result[0].get("bottom", 0),
            "topline_target": result[0].get("top", 0),
            "target_qty": result[0].get("qty", 0)
        }
    return {"bottomline_target": 0, "topline_target": 0, "target_qty": 0}

@frappe.whitelist()
def get_sales_target_tq(sales_person=None):
    conditions = ""
    values = []

    if sales_person:
        conditions = "WHERE sales_person = %s"
        values.append(sales_person)

    result = frappe.db.sql(f"""
        SELECT 
            SUM(bottomline_target) AS bottom, 
            SUM(topline_target) AS top, 
            SUM(target_qty) AS qty 
        FROM `tabSales Target` 
        {conditions}
    """, values, as_dict=True)

    if result and result[0]:
        return {
            "bottomline_target": result[0].get("bottom", 0),
            "topline_target": result[0].get("top", 0),
            "target_qty": result[0].get("qty", 0)
        }
    return {"bottomline_target": 0, "topline_target": 0, "target_qty": 0}


@frappe.whitelist()
def get_sales_target_ty(sales_person=None):
    conditions = ""
    values = []

    if sales_person:
        conditions = "WHERE sales_person = %s"
        values.append(sales_person)

    result = frappe.db.sql(f"""
        SELECT 
            SUM(bottomline_target) AS bottom, 
            SUM(topline_target) AS top, 
            SUM(target_qty) AS qty 
        FROM `tabSales Target` 
        {conditions}
    """, values, as_dict=True)

    if result and result[0]:
        return {
            "bottomline_target": result[0].get("bottom", 0),
            "topline_target": result[0].get("top", 0),
            "target_qty": result[0].get("qty", 0)
        }
    return {"bottomline_target": 0, "topline_target": 0, "target_qty": 0}        
