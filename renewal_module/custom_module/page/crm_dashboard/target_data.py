from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate
from datetime import date

from dateutil import relativedelta
from renewal_module.renewal_module.report.sales_data_based_on_invoice.sales_data_based_on_invoice import (
	get_data,
)
from frappe.utils import cint, flt, formatdate
from frappe.utils import get_timespan_date_range

from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from erpnext.accounts.utils import get_fiscal_year

from erpnext.accounts.report.utils import convert

from renewal_module.renewal_module.report.sales_target_based_on_invoice.sales_target_based_on_invoice import (
    get_category_target_data, get_columns)

from frappe.utils import getdate, formatdate


from datetime import datetime

@frappe.whitelist()
def get_target_data(sales_person=None):
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json("hello")))
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Team`.sales_person = '{sales_person}'"
    
    
    # Get the current date
    current_date = date.today()

    # Get the current fiscal year
    current_fiscal_year = frappe.get_all('Fiscal Year', filters={'year_start_date': ['<=', current_date], 'year_end_date': ['>=', current_date]}, fields=['name'])
    fiscal_year1 = current_fiscal_year[0]['name']
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(fiscal_year1)))
    # Fetch actual data
    
    sales_data = frappe.db.sql(f"""
        select 
            tsop.fiscal_year,  
            CASE
                WHEN MONTH(tsop.transaction_date) >= MONTH(tsop.year_start_date)
                THEN MONTH(tsop.transaction_date) - MONTH(tsop.year_start_date) + 1
                ELSE MONTH(tsop.transaction_date) + 12 - MONTH(tsop.year_start_date) + 1
            END AS fiscal_month,
            CASE
                WHEN MONTH(tsop.transaction_date) >= MONTH(tsop.year_start_date)
                THEN
                CASE MONTH(tsop.transaction_date) - MONTH(tsop.year_start_date) + 1
                    WHEN 1 THEN CONCAT('Apr ', YEAR(tsop.year_start_date))
                    WHEN 2 THEN CONCAT('May ', YEAR(tsop.year_start_date))
                    WHEN 3 THEN CONCAT('Jun ', YEAR(tsop.year_start_date))
                    WHEN 4 THEN CONCAT('Jul ', YEAR(tsop.year_start_date))
                    WHEN 5 THEN CONCAT('Aug ', YEAR(tsop.year_start_date))
                    WHEN 6 THEN CONCAT('Sep ', YEAR(tsop.year_start_date))
                    WHEN 7 THEN CONCAT('Oct ', YEAR(tsop.year_start_date))
                    WHEN 8 THEN CONCAT('Nov ', YEAR(tsop.year_start_date))
                    WHEN 9 THEN CONCAT('Dec ', YEAR(tsop.year_start_date))
                    WHEN 10 THEN CONCAT('Jan ', YEAR(tsop.year_start_date) + 1) -- For the next year
                    WHEN 11 THEN CONCAT('Feb ', YEAR(tsop.year_start_date) + 1)
                    WHEN 12 THEN CONCAT('Mar ', YEAR(tsop.year_start_date) + 1)
                END
                ELSE
                    CASE MONTH(tsop.transaction_date) + 12 - MONTH(tsop.year_start_date) + 1
                        WHEN 1 THEN CONCAT('Apr ', YEAR(tsop.year_start_date))
                        WHEN 2 THEN CONCAT('May ', YEAR(tsop.year_start_date))
                        WHEN 3 THEN CONCAT('Jun ', YEAR(tsop.year_start_date))
                        WHEN 4 THEN CONCAT('Jul ', YEAR(tsop.year_start_date))
                        WHEN 5 THEN CONCAT('Aug ', YEAR(tsop.year_start_date))
                        WHEN 6 THEN CONCAT('Sep ', YEAR(tsop.year_start_date))
                        WHEN 7 THEN CONCAT('Oct ', YEAR(tsop.year_start_date))
                        WHEN 8 THEN CONCAT('Nov ', YEAR(tsop.year_start_date))
                        WHEN 9 THEN CONCAT('Dec ', YEAR(tsop.year_start_date))
                        WHEN 10 THEN CONCAT('Jan ', YEAR(tsop.year_start_date) + 1) -- For the next year
                        WHEN 11 THEN CONCAT('Feb ', YEAR(tsop.year_start_date) + 1)
                        WHEN 12 THEN CONCAT('Mar ', YEAR(tsop.year_start_date) + 1)
                    END
            END AS Month,
            (SUM(DISTINCT `bottomline_target`)* COUNT(DISTINCT `tabSales Target`.`sales_person`))/(12*COUNT(DISTINCT `bottomline_target`))  AS `Bottomline Target`,
             SUM(tsop.net_profit) AS `Achieved`,
                ((SUM(DISTINCT `bottomline_target`)* COUNT(DISTINCT `tabSales Target`.`sales_person`))/(12*COUNT(DISTINCT `bottomline_target`)) - SUM(tsop.net_profit)) as Variance,
                AVG(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Average,
                MAX(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Max_Achieved,
                MIN(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Min_Achieved
            from
            `tabSales Target`
            INNER join
            (
            select
				`tabSales Order Item`.parent,
				`tabSales Order`.transaction_date,
				`tabFiscal Year`.name as fiscal_year,
				`tabFiscal Year`.year_start_date as year_start_date,
				`tabFiscal Year`.year_end_date as year_end_date,
				`tabSales Order`.project, 
				`tabSales Order`.customer, `tabSales Order`.customer_group,
				`tabSales Order`.territory, `tabSales Order Item`.item_code,
				`tabSales Order Item`.item_name, `tabSales Order Item`.description,
				`tabSales Order Item`.warehouse, `tabSales Order Item`.item_group,
				`tabSales Order Item`.brand, 
				`tabSales Order Item`.stock_qty as qty,
				`tabSales Order Item`.base_net_rate, `tabSales Order Item`.base_net_amount,
				(CASE when top.p_qty IS NULL  then 0 
				else top.p_qty END )as purchase_qty ,
				(CASE when top.p_rate IS NULL  then 0 
				when top.p_rate IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.purchase_rate
				else top.p_rate END )as buying_rate,
				(CASE when top.p_amount IS NULL and `tabSales Order`.cof_id is NULL then 0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.purchase_amount 
				else top.p_amount END )as buying_amount,
				(CASE when top.p_amount IS NULL and `tabSales Order`.cof_id is NULL  then  0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL and tcofi.purchase_amount = 0  then  0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL and tcofi.purchase_amount > 0 then  `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
				else `tabSales Order Item`.base_net_amount - top.p_amount END )as margin,
				(CASE when top.orc = 1 then torc.commission_amount
				else 0 END) as orc,
				(CASE 
				when top.p_amount  IS NULL and torc.commission_amount IS not NULL  then `tabSales Order Item`.amount - torc.commission_amount
				when top.p_amount  IS NULL and torc.commission_amount IS NULL  then 0
				WHEN top.p_amount is not NULL and torc.commission_amount IS not NULL then (`tabSales Order Item`.amount - top.p_amount) - torc.commission_amount
				WHEN top.p_amount is not NULL and torc.commission_amount IS NULL then `tabSales Order Item`.amount - top.p_amount
				else 0  END )as profit ,
				(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END )* 0.1 as support,
				(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END) * 0.1 as MDF,
				(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END ) -( (CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END )*0.1 +(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END )* 0.1) as net_profit,
				`tabSales Team`.sales_person,
				(CASE when top.supplier IS NULL and `tabSales Order`.cof_id is not NULL  then Null
				when top.supplier IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.supplier
				else top.supplier END )as supplier,
				(CASE when top.sq_name IS NULL and `tabSales Order`.cof_id is not NULL  then Null
				when top.sq_name IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.supplier_quotation
				else top.sq_name END )as supplier_quotation,
				tu.full_name as user
	from
			    `tabSales Order` inner join `tabSales Order Item` on `tabSales Order Item`.parent = `tabSales Order`.name
				LEFT JOIN `tabCustomer Order Form Item` tcofi on `tabSales Order`.cof_id = tcofi.parent and tcofi.item_code =`tabSales Order Item`.item_code
				and `tabSales Order Item`.rate = tcofi.rate and `tabSales Order Item`.qty = tcofi.qty and `tabSales Order Item`.description = tcofi.description 
				Left join `tabQuotation Item` tqi on `tabSales Order Item`.prevdoc_docname = tqi.parent 
				and `tabSales Order Item`.item_code = tqi.item_code and `tabSales Order Item`.qty = tqi.qty and `tabSales Order Item`.rate = tqi.rate
				left join (SELECT toi.parent as opportunity,toi.name , toi.item_code as s_item_code , toi.qty as s_qty ,
				tpq.name as sq_name, tpq.supplier as supplier,tpq.item_code as sq_item_code,
				toi.rate as s_rate , tpq.rate as p_rate ,tpq.qty as p_qty, tpq.amount as p_amount, toi.orc as orc, toi.description as description 
				from 
				`tabOpportunity Item` toi
				left join (SELECT tsq.name as name, tsq.supplier as supplier  , tsqi.item_code as item_code , tsqi.rate as rate ,
				 tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity, tsqi.description as description
				from `tabSupplier Quotation` tsq 
				left join (SELECT parent , item_code , rate, qty, amount, description   FROM `tabSupplier Quotation Item`  WHERE recommended_ =1
				) as tsqi on tsqi.parent = tsq.name 
				) as tpq on tpq.opportunity = toi.parent and toi.item_code = tpq.item_code and toi.qty = tpq.qty and tpq.description = toi.description
				) as top on top.opportunity = tqi.prevdoc_docname and top.s_item_code = tqi.item_code and top.s_qty = tqi.qty and top.description = tqi.description
				LEFT JOIN 
				(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id,
				toi2.item_code as item_code , toi2.qty as qty ,
				toi2.rate as rate , toi2.description as description 
				FROM `tabORC Item` toi2 
				left join `tabORC List` tol on toi2.parent = tol.name
				WHERE tol.docstatus  = 1) as torc on  torc.opportunity_id = top.opportunity and top.s_item_code = torc.item_code 
				and top.s_qty = torc.qty and top.s_rate = torc.rate and top.description = torc.description
				LEFT JOIN `tabSales Team` on `tabSales Order Item`.parent = `tabSales Team`.parent
				LEFT JOIN `tabUser` tu on `tabSales Team`.sales_person = tu.full_name
				LEFT JOIN `tabFiscal Year`  on `tabFiscal Year`.year_start_date <= `tabSales Order`.transaction_date  and `tabSales Order`.transaction_date <= `tabFiscal Year`.year_end_date
        where
                    `tabSales Order`.docstatus=1  and `tabFiscal Year`.name = '{fiscal_year1}' {condition}
                GROUP BY
                        `tabSales Order Item`.name
                order by
                    `tabSales Order`.name desc) as tsop on `tabSales Target`.sales_person = tsop.sales_person and
                    `tabSales Target`.fiscal_year= tsop.fiscal_year
        GROUP BY
        tsop.fiscal_year, Month
        
    ORDER BY
        tsop.fiscal_year DESC, fiscal_month ASC;
	
    """, as_dict=True)

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_data)))
    
    
    result = []

    for data in sales_data:
        
        
        
        result.append({
            "fiscal_year": data.fiscal_year,
            "fiscal_month": data.month,
            "Month": data.month,
            "Bottomline Target": data.bottomline_target,
            "Achieved": data.achieved,
            "Variance": data.variance  # Corrected ABS usage
        })
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(result)))    

    return sales_data   



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
def target_category_wise_overall_chart(sales_person=None):
    from_date, to_date = get_timespan_date_range("this year")
    conditions = ""
    values = []
    condition  = ""
    condition1 = ""
    if sales_person:
        condition = f"and `tabSales Team`.sales_person = '{sales_person}'"
        condition1 = f"and tst.sales_person = '{sales_person}'"

    filters_data = {
    "company": "64 Network Security Pvt Ltd - TG",
    "doctype":"Sales Invoice",
    "from_date": "2025-02-28",
    "timespan": "this year",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]    
    
    
    # Get the current date
    # current_date = date.today()

    # # Get the current fiscal year
    # current_fiscal_year = frappe.get_all('Fiscal Year', filters={'year_start_date': ['<=', current_date], 'year_end_date': ['>=', current_date]}, fields=['name'])
    # fiscal_year1 = current_fiscal_year[0]['name']



    

    
    

    
    sales_data = get_data(filters_data)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters_data)))
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_data)))
    data = []
    rows = get_category_target_data(filters_data, sales_data)

    if rows:
        for key, value in rows.items():
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(key)))
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(value)))
            value.update({"sales_person": key[0], "category_type": key[1], "category":key[2],"target_uom":key[3]})

            data.append(value)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    sum_of_category={}
    for each in data:
        # frappe.msgprint(each)
        category = each.get("category", "Unknown")
        target = each.get("bottomline_target", 0.0)
        achieved = each.get("achieved_value",0.0)
        variance = each.get("shortfall",0.0)


        if category not in sum_of_category:
            sum_of_category[category] = {
                "bottomline_target": 0.0,
                "achieved": 0.0,
                "variance": 0.0
            }

        sum_of_category[category]["bottomline_target"] += target
        sum_of_category[category]["achieved"] += achieved
        sum_of_category[category]["variance"] += variance
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sum_of_category)))

    # Transform the result into a format suitable for the frontend
    response = {
        "categories": [],  # X-axis labels (category types)
        "bottomline_target": [],
        "topline_target": [],
        "target_amount": []
    }

    # for row in result:
    #     if row["category"]:  # Ensure category is not None
    #         response["categories"].append(row["category"])
    #     else:
    #         response["categories"].append("")  # Replace NULL with 'Unknown'
    #     response["bottomline_target"].append(row["bottomline_target"] or 0)
    #         # Ensure valid values for Topline and Target Amount
    #     response["topline_target"].append(row["topline_target"] if row["topline_target"] else 10000000)
    #     response["target_amount"].append(row["target_amount"] if row["target_amount"] else 10000000)

    return sum_of_category




@frappe.whitelist()
def target_category_wise_chart_tm(sales_person=None):
    
    filters_data = {
    "company": "64 Network Security Pvt Ltd - TG",
    "doctype":"Sales Invoice",
    "from_date": "2025-02-28",
    "timespan": "this month",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]    
    
    sales_data = get_data(filters_data)
    
    data = []
    rows = get_category_target_data(filters_data, sales_data)

    if rows:
        for key, value in rows.items():
            value.update({"sales_person": key[0], "category_type": key[1], "category":key[2],"target_uom":key[3]})

            data.append(value)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    sum_of_category={}
    for each in data:
        # frappe.msgprint(each)
        category = each.get("category", "Unknown")
        target = each.get("bottomline_target", 0)
        achieved = each.get("achieved_value",0)
        variance = each.get("shortfall",0)


        if category not in sum_of_category:
            sum_of_category[category] = {
                "bottomline_target": 0,
                "achieved": 0,
                "variance": 0
            }

        sum_of_category[category]["bottomline_target"] += target
        sum_of_category[category]["achieved"] += achieved
        sum_of_category[category]["variance"] += variance
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sum_of_category)))

    # Transform the result into a format suitable for the frontend
    response = {
        "categories": [],  # X-axis labels (category types)
        "bottomline_target": [],
        "topline_target": [],
        "target_amount": []
    }
    return sum_of_category




# @frappe.whitelist()
# def target_category_wise_chart(sales_person=None):
#     conditions = ""
#     values = []

#     if sales_person:
#         conditions = "WHERE st.sales_person = %s"
#         values.append(sales_person)

#     result = frappe.db.sql(f"""
#         SELECT 
#             std.category,
#             SUM(std.bottomline_target) AS bottomline_target, 
#             SUM(std.topline_target) AS topline_target, 
#             SUM(std.target_amount) AS target_amount 
#         FROM `tabSub Target Details List` AS std 
#         LEFT JOIN `tabSales Target` AS st ON st.name = std.parent 
#         {conditions}
#         GROUP BY std.category
#     """, values, as_dict=True)

#     # Transform the result into a format suitable for the frontend
#     response = {
#         "categories": [],  # X-axis labels (category types)
#         "bottomline_target": [],
#         "topline_target": [],
#         "target_amount": []
#     }

#     for row in result:
#         if row["category"]:  # Ensure category is not None
#             response["categories"].append(row["category"])
#         else:
#             response["categories"].append("")  # Replace NULL with 'Unknown'
#         response["bottomline_target"].append(row["bottomline_target"] or 0)
#             # Ensure valid values for Topline and Target Amount
#         response["topline_target"].append(row["topline_target"] if row["topline_target"] else 10000000)
#         response["target_amount"].append(row["target_amount"] if row["target_amount"] else 10000000)

#     return response




@frappe.whitelist()
def get_sales_target_tm(sales_person=None):
    condition  = ""
    condition1 = ""
    if sales_person:
        condition = f"and `tabSales Team`.sales_person = '{sales_person}'"
        condition1 = f"and tst.sales_person = '{sales_person}'"
    
    
    # Get the current date
    current_date = date.today()

    # Get the current fiscal year
    current_fiscal_year = frappe.get_all('Fiscal Year', filters={'year_start_date': ['<=', current_date], 'year_end_date': ['>=', current_date]}, fields=['name'])
    fiscal_year1 = current_fiscal_year[0]['name']

    target = frappe.db.sql(f"""
            SELECT SUM(bottomline_target)/12 FROM `tabSales Target` tst 
            WHERE fiscal_year = '{fiscal_year1}' {condition1}

            """)[0][0]

    result = frappe.db.sql(f"""
                SELECT sum(tsid.net_profit) as achieved
            From(
            SELECT			
                           `tabSales Invoice`.posting_date ,
			`tabSales Invoice`.name ,
			`tabSales Invoice`.customer ,
			top.supplier,
			tsoi.item_code ,
			tsoi.item_group ,
            tsoi.brand ,
			tsoi.qty as sales_qty,
			tsoi.rate as sales_rate ,
			tsoi.amount as sales_amount,
			(CASE when top.p_qty IS NULL  then 0 
			else top.p_qty END )as purchase_qty ,
			(CASE when top.p_rate IS NULL  then 0 
			else top.p_rate END )as purchase_rate,
			(CASE when top.p_amount IS NULL  and tso.cof_id is NULL then 0
				when top.p_amount IS NULL and tso.cof_id is not NULL then tcofi.purchase_amount
			else top.p_amount END )as purchase_amount,
			(CASE when top.orc = 1 then torc.commission_amount
			else 0 END) as orc_amount,
			(CASE 
			when top.p_amount  IS NULL and torc.commission_amount IS not NULL and tso.cof_id is NULL  then tsoi.amount - torc.commission_amount
			when top.p_amount  IS NULL and torc.commission_amount IS not NULL and tso.cof_id is Not NULL  then tsoi.amount - (tcofi.purchase_amount - torc.commission_amount)
			when top.p_amount  IS NULL and torc.commission_amount IS NULL and tso.cof_id is NULL  then 0
			when top.p_amount  IS NULL and torc.commission_amount IS NULL and tso.cof_id is not NULL  then tsoi.amount - tcofi.purchase_amount
			WHEN top.p_amount is not NULL and torc.commission_amount IS not NULL then (tsoi.amount - top.p_amount) - torc.commission_amount
			WHEN top.p_amount is not NULL and torc.commission_amount IS NULL then tsoi.amount - top.p_amount
			else 0  END )as profit ,
			(CASE WHEN top.p_amount IS NULL AND tso.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN tsoi.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE tsoi.base_net_amount - top.p_amount END )as profit1 ,
				(CASE WHEN top.p_amount IS NULL AND tso.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN tsoi.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE tsoi.base_net_amount - top.p_amount END )* 0.1 as support,
				(CASE WHEN top.p_amount IS NULL AND tso.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN tsoi.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE tsoi.base_net_amount - top.p_amount END ) * 0.1 as MDF,
				(CASE WHEN top.p_amount IS NULL AND tso.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN tsoi.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE tsoi.base_net_amount - top.p_amount END ) -( 2*(CASE WHEN top.p_amount IS NULL AND tso.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND tso.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN tsoi.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN tsoi.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE tsoi.base_net_amount - top.p_amount END)*0.1 ) as net_profit,
			`tabSales Team`.sales_person,
			tu.full_name as user
		FROM
			`tabSales Invoice Item` tsii
			INNER JOIN `tabSales Invoice`  on `tabSales Invoice`.name = tsii.parent
			Left JOIN `tabSales Order Item` tsoi on tsii.so_detail = tsoi.name and tsoi.parent = tsii.sales_order 
			left join `tabSales Order` tso on tsoi.parent = tso.name and tso.name = tsii.sales_order
			LEFT JOIN `tabCustomer Order Form Item` tcofi on tso.cof_id = tcofi.parent and tcofi.item_code =tsoi.item_code
				and tsoi.rate = tcofi.rate and tsoi.qty = tcofi.qty and tsoi.description = tcofi.description 
			INNER JOIN `tabQuotation Item` tqi on tsoi.prevdoc_docname = tqi.parent and tsoi.description = tqi.description and tsoi.item_code = tqi.item_code 
			left join (SELECT toi.parent as opportunity,toi.name , toi.item_code as s_item_code , toi.qty as s_qty ,tpq.name as sq_name, tpq.supplier as supplier,tpq.item_code as sq_item_code,
			toi.rate as s_rate , tpq.rate as p_rate ,tpq.qty as p_qty, tpq.amount as p_amount, toi.orc as orc, toi.description as description 
			from 
			`tabOpportunity Item` toi
			left join (SELECT tsq.name as name, tsq.supplier as supplier  , tsqi.item_code as item_code , tsqi.rate as rate , tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity
			from `tabSupplier Quotation` tsq 
			left join (SELECT parent , item_code , rate, qty, amount   FROM `tabSupplier Quotation Item`  WHERE recommended_ =1) as tsqi on tsqi.parent = tsq.name 
			) as tpq on tpq.opportunity = toi.parent and toi.item_code = tpq.item_code and toi.qty = tpq.qty) as top on top.opportunity = tqi.prevdoc_docname and top.s_item_code = tqi.item_code and top.s_qty = tqi.qty
			LEFT JOIN 
			(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id, toi2.item_code as item_code , toi2.qty as qty ,
			toi2.rate as rate , toi2.description as description 
			FROM `tabORC Item` toi2 
			left join `tabORC List` tol on toi2.parent = tol.name
			WHERE tol.docstatus  = 1) as torc on  torc.opportunity_id = top.opportunity and top.s_item_code = torc.item_code 
			and top.s_qty = torc.qty and top.s_rate = torc.rate and top.description = torc.description
			LEFT JOIN `tabSales Team`  on tsoi.parent = `tabSales Team`.parent
			LEFT JOIN `tabTarget Detail` ttd on ttd.parent = `tabSales Team`.sales_person
			LEFT JOIN `tabUser` tu on `tabSales Team`.sales_person = tu.full_name
		where
				`tabSales Invoice`.docstatus=1  
                           AND MONTH(`tabSales Invoice`.posting_date) = MONTH(CURRENT_DATE)  -- Filter for current month
        AND YEAR(`tabSales Invoice`.posting_date) = YEAR(CURRENT_DATE) {condition}
        GROUP BY tsii.name			
		ORDER BY
			`tabSales Invoice`.name DESC) as tsid    
	
    """)[0][0]

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(result)))
    bottomline_target = 0
    achieved = 0
    variance = 0
    if target:
        bottomline_target = target
        variance = target - achieved
    if result :
        achieved = result
        variance = target-achieved
        
    return {"bottomline_target": bottomline_target, "achieved": achieved, "variance": variance}



@frappe.whitelist()
def get_sales_target_tq(sales_person=None):
    conditions = ""
    values = []

    condition  = ""
    if sales_person:
        condition = f"and `tabSales Team`.sales_person = '{sales_person}'"


    # Get the current date
    current_date = date.today()

    # Get the current fiscal year
    current_fiscal_year = frappe.get_all('Fiscal Year', filters={'year_start_date': ['<=', current_date], 'year_end_date': ['>=', current_date]}, fields=['name'])
    fiscal_year1 = current_fiscal_year[0]['name']    

    
    result = frappe.db.sql(f"""
        SELECT 
    tsop.fiscal_year, 
    CASE 
        WHEN MONTH(CURRENT_DATE) BETWEEN 1 AND 3 THEN 'Q4 (January, February, March)'
        WHEN MONTH(CURRENT_DATE) BETWEEN 4 AND 6 THEN 'Q1 (April, May, June)'
        WHEN MONTH(CURRENT_DATE) BETWEEN 7 AND 9 THEN 'Q2 (July, August, September)'
        WHEN MONTH(CURRENT_DATE) BETWEEN 10 AND 12 THEN 'Q3 (October, November, December)'
    END AS current_quarter_months,
  (SUM(DISTINCT `bottomline_target`) * COUNT(DISTINCT `tabSales Target`.`sales_person`)) / (4 * COUNT(DISTINCT `bottomline_target`)) AS bottomline_target,

     SUM(tsop.net_profit) AS achieved,

    ((SUM(DISTINCT `bottomline_target`) * COUNT(DISTINCT `tabSales Target`.`sales_person`)) / (4 * COUNT(DISTINCT `bottomline_target`)) - SUM(tsop.net_profit)) AS variance

    

FROM 
    `tabSales Target`
INNER join
(
select
				`tabSales Order Item`.parent,
				`tabSales Order`.transaction_date,
				`tabFiscal Year`.name as fiscal_year,
				`tabFiscal Year`.year_start_date as year_start_date,
				`tabFiscal Year`.year_end_date as year_end_date,
				`tabSales Order`.project, 
				`tabSales Order`.customer, `tabSales Order`.customer_group,
				`tabSales Order`.territory, `tabSales Order Item`.item_code,
				`tabSales Order Item`.item_name, `tabSales Order Item`.description,
				`tabSales Order Item`.warehouse, `tabSales Order Item`.item_group,
				`tabSales Order Item`.brand, 
				`tabSales Order Item`.stock_qty as qty,
				`tabSales Order Item`.base_net_rate, `tabSales Order Item`.base_net_amount,
				(CASE when top.p_qty IS NULL  then 0 
				else top.p_qty END )as purchase_qty ,
				(CASE when top.p_rate IS NULL  then 0 
				when top.p_rate IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.purchase_rate
				else top.p_rate END )as buying_rate,
				(CASE when top.p_amount IS NULL and `tabSales Order`.cof_id is NULL then 0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.purchase_amount 
				else top.p_amount END )as buying_amount,
				(CASE when top.p_amount IS NULL and `tabSales Order`.cof_id is NULL  then  0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL and tcofi.purchase_amount = 0  then  0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL and tcofi.purchase_amount > 0 then  `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
				else `tabSales Order Item`.base_net_amount - top.p_amount END )as margin,
				(CASE when top.orc = 1 then torc.commission_amount
				else 0 END) as orc,
				(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END )as profit ,
				(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END )* 0.1 as support,
				(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END ) * 0.1 as MDF,
				(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END ) -( 2 *(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END )*0.1 ) as net_profit,
				`tabSales Team`.sales_person,
				(CASE when top.supplier IS NULL and `tabSales Order`.cof_id is not NULL  then Null
				when top.supplier IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.supplier
				else top.supplier END )as supplier,
				(CASE when top.sq_name IS NULL and `tabSales Order`.cof_id is not NULL  then Null
				when top.sq_name IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.supplier_quotation
				else top.sq_name END )as supplier_quotation,
        CASE
            WHEN MONTH(CURRENT_DATE) BETWEEN MONTH(`tabFiscal Year`.year_start_date) AND MONTH(`tabFiscal Year`.year_start_date) + 2 THEN 'Q1'
            WHEN MONTH(CURRENT_DATE) BETWEEN MONTH(`tabFiscal Year`.year_start_date) + 3 AND MONTH(`tabFiscal Year`.year_start_date) + 5 THEN 'Q2'
            WHEN MONTH(CURRENT_DATE) BETWEEN MONTH(`tabFiscal Year`.year_start_date) + 6 AND MONTH(`tabFiscal Year`.year_start_date) + 8 THEN 'Q3'
            WHEN MONTH(CURRENT_DATE) BETWEEN MONTH(`tabFiscal Year`.year_start_date) + 9 AND MONTH(`tabFiscal Year`.year_start_date) + 11 THEN 'Q4'
        END AS current_fiscal_quarter,
				tu.full_name as user
	from
			    `tabSales Order` inner join `tabSales Order Item` on `tabSales Order Item`.parent = `tabSales Order`.name
				LEFT JOIN `tabCustomer Order Form Item` tcofi on `tabSales Order`.cof_id = tcofi.parent and tcofi.item_code =`tabSales Order Item`.item_code
				and `tabSales Order Item`.rate = tcofi.rate and `tabSales Order Item`.qty = tcofi.qty and `tabSales Order Item`.description = tcofi.description 
				Left join `tabQuotation Item` tqi on `tabSales Order Item`.prevdoc_docname = tqi.parent 
				and `tabSales Order Item`.item_code = tqi.item_code and `tabSales Order Item`.qty = tqi.qty and `tabSales Order Item`.rate = tqi.rate
				left join 
				(
				SELECT toi.parent as opportunity,toi.name ,
				toi.item_code as s_item_code , toi.qty as s_qty ,
				tpq.name as sq_name, tpq.supplier as supplier,
				tpq.item_code as sq_item_code,
				toi.rate as s_rate , tpq.rate as p_rate ,
				tpq.qty as p_qty, tpq.amount as p_amount, toi.orc as orc, 
				toi.description as description 
				from 
				`tabOpportunity Item` toi
				left join (SELECT tsq.name as name, tsq.supplier as supplier  , tsqi.item_code as item_code , tsqi.rate as rate ,
				 tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity, tsqi.description as description
				from `tabSupplier Quotation` tsq 
				left join (SELECT parent , item_code , rate, qty, amount, description   FROM `tabSupplier Quotation Item`  WHERE recommended_ =1
				) as tsqi on tsqi.parent = tsq.name 
				) as tpq on tpq.opportunity = toi.parent and toi.item_code = tpq.item_code and toi.qty = tpq.qty and tpq.description = toi.description
				) as top on top.opportunity = tqi.prevdoc_docname and top.s_item_code = tqi.item_code and top.s_qty = tqi.qty and top.description = tqi.description
				LEFT JOIN 
				(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id,
				toi2.item_code as item_code , toi2.qty as qty ,
				toi2.rate as rate , toi2.description as description 
				FROM `tabORC Item` toi2 
				left join `tabORC List` tol on toi2.parent = tol.name
				WHERE tol.docstatus  = 1) as torc on  torc.opportunity_id = top.opportunity and top.s_item_code = torc.item_code 
				and top.s_qty = torc.qty and top.s_rate = torc.rate and top.description = torc.description
				LEFT JOIN `tabSales Team` on `tabSales Order Item`.parent = `tabSales Team`.parent
				LEFT JOIN `tabUser` tu on `tabSales Team`.sales_person = tu.full_name
				LEFT JOIN `tabFiscal Year`  on `tabFiscal Year`.year_start_date <= `tabSales Order`.transaction_date  and `tabSales Order`.transaction_date <= `tabFiscal Year`.year_end_date
	where
				`tabSales Order`.docstatus=1  and `tabFiscal Year`.name = '{fiscal_year1}' {condition}
				 AND  YEAR(`tabSales Order`.transaction_date) = YEAR(CURRENT_DATE)
    AND MONTH(`tabSales Order`.transaction_date) BETWEEN 
        (CASE 
            WHEN MONTH(CURRENT_DATE) BETWEEN 1 AND 3 THEN 1
            WHEN MONTH(CURRENT_DATE) BETWEEN 4 AND 6 THEN 4
            WHEN MONTH(CURRENT_DATE) BETWEEN 7 AND 9 THEN 7
            WHEN MONTH(CURRENT_DATE) BETWEEN 10 AND 12 THEN 10
        END) 
        AND 
        (CASE 
            WHEN MONTH(CURRENT_DATE) BETWEEN 1 AND 3 THEN 3
            WHEN MONTH(CURRENT_DATE) BETWEEN 4 AND 6 THEN 6
            WHEN MONTH(CURRENT_DATE) BETWEEN 7 AND 9 THEN 9
            WHEN MONTH(CURRENT_DATE) BETWEEN 10 AND 12 THEN 12
        END)
    

				
    GROUP BY
			     	`tabSales Order Item`.name
			order by
				`tabSales Order`.name desc) as tsop on `tabSales Target`.sales_person = tsop.sales_person and
				`tabSales Target`.fiscal_year= tsop.fiscal_year
GROUP BY
    tsop.fiscal_year
    
ORDER BY
    tsop.fiscal_year DESC;
	
    """, as_dict=True)

    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(result)))
    if result:
        for data in result:
            #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
        

            return data
        
    return {"bottomline_target": 0, "topline_target": 0, "target_qty": 0}       


@frappe.whitelist()
def get_sales_target_ty(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Team`.sales_person = '{sales_person}'"
    
    
    # Get the current date
    current_date = date.today()

    # Get the current fiscal year
    current_fiscal_year = frappe.get_all('Fiscal Year', filters={'year_start_date': ['<=', current_date], 'year_end_date': ['>=', current_date]}, fields=['name'])
    fiscal_year1 = current_fiscal_year[0]['name']

    result = frappe.db.sql(f"""
        SELECT 
    tsop.fiscal_year,  
    (SUM(DISTINCT `bottomline_target`)* COUNT(DISTINCT `tabSales Target`.`sales_person`))/(1*COUNT(DISTINCT `bottomline_target`)) as Target,
    SUM(tsop.net_profit) AS `Achieved`,
    ((SUM(DISTINCT `bottomline_target`)* COUNT(DISTINCT `tabSales Target`.`sales_person`))/(1*COUNT(DISTINCT `bottomline_target`)) - SUM(tsop.net_profit)) as variance,
    AVG(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Average,
    MAX(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Max_Achieved,
    MIN(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Min_Achieved

FROM 
    `tabSales Target`

inner JOIN (
    SELECT
        `tabSales Order Item`.parent,
        `tabSales Order`.transaction_date,
        `tabFiscal Year`.name AS fiscal_year,
        `tabFiscal Year`.year_start_date AS year_start_date,
        `tabFiscal Year`.year_end_date AS year_end_date,
        `tabSales Order`.project, 
        `tabSales Order`.customer, 
        `tabSales Order`.customer_group,
        `tabSales Order`.territory, 
        `tabSales Order Item`.item_code,
        `tabSales Order Item`.item_name, 
        `tabSales Order Item`.description,
        `tabSales Order Item`.warehouse, 
        `tabSales Order Item`.item_group,
        `tabSales Order Item`.brand, 
        `tabSales Order Item`.stock_qty AS qty,
        `tabSales Order Item`.base_net_rate, 
        `tabSales Order Item`.base_net_amount,

        (CASE WHEN top.p_qty IS NULL THEN 0 ELSE top.p_qty END) AS purchase_qty,
        (CASE WHEN top.p_rate IS NULL THEN 
            CASE WHEN `tabSales Order`.cof_id IS NOT NULL THEN tcofi.purchase_rate ELSE 0 END
            ELSE top.p_rate END) AS buying_rate,
        (CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL THEN tcofi.purchase_amount
            ELSE top.p_amount END) AS buying_amount,

        
        (CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END) AS margin,

        
        (CASE WHEN top.orc = 1 THEN torc.commission_amount ELSE 0 END) AS orc,
        (CASE WHEN top.p_amount IS NULL AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.amount - torc.commission_amount
              WHEN top.p_amount IS NULL AND torc.commission_amount IS NULL THEN 0
              WHEN top.p_amount IS NOT NULL AND torc.commission_amount IS NOT NULL THEN (`tabSales Order Item`.amount - top.p_amount) - torc.commission_amount
              WHEN top.p_amount IS NOT NULL AND torc.commission_amount IS NULL THEN `tabSales Order Item`.amount - top.p_amount
              ELSE 0 END) AS profit,
        (CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END) AS profit1,

        
        (CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END) * 0.1 AS support,

        (CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END) * 0.1 AS MDF,

        
        (CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END) - 
              (2*(CASE WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NULL AND torc.commission_amount IS NULL THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount = 0 THEN 0
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (tcofi.purchase_amount + torc.commission_amount)
            WHEN top.p_amount IS NULL AND `tabSales Order`.cof_id IS NOT NULL AND tcofi.purchase_amount > 0 AND torc.commission_amount IS NULL THEN `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
            WHEN top.p_amount IS NOT NULL  AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.base_net_amount - (top.p_amount + torc.commission_amount)
            ELSE `tabSales Order Item`.base_net_amount - top.p_amount END) * 0.1) AS net_profit,

        
        `tabSales Team`.sales_person,
        tu.full_name AS user
    FROM`tabSales Order` inner join `tabSales Order Item` on `tabSales Order Item`.parent = `tabSales Order`.name
				LEFT JOIN `tabCustomer Order Form Item` tcofi on `tabSales Order`.cof_id = tcofi.parent and tcofi.item_code =`tabSales Order Item`.item_code
				and `tabSales Order Item`.rate = tcofi.rate and `tabSales Order Item`.qty = tcofi.qty and `tabSales Order Item`.description = tcofi.description 
				Left join `tabQuotation Item` tqi on `tabSales Order Item`.prevdoc_docname = tqi.parent 
				and `tabSales Order Item`.item_code = tqi.item_code and `tabSales Order Item`.qty = tqi.qty and `tabSales Order Item`.rate = tqi.rate
				left join (SELECT toi.parent as opportunity,toi.name , toi.item_code as s_item_code , toi.qty as s_qty ,
				tpq.name as sq_name, tpq.supplier as supplier,tpq.item_code as sq_item_code,
				toi.rate as s_rate , tpq.rate as p_rate ,tpq.qty as p_qty, tpq.amount as p_amount, toi.orc as orc, toi.description as description 
				from 
				`tabOpportunity Item` toi
				left join (SELECT tsq.name as name, tsq.supplier as supplier  , tsqi.item_code as item_code , tsqi.rate as rate ,
				 tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity, tsqi.description as description
				from `tabSupplier Quotation` tsq 
				left join (SELECT parent , item_code , rate, qty, amount, description   FROM `tabSupplier Quotation Item`  WHERE recommended_ =1
				) as tsqi on tsqi.parent = tsq.name 
				) as tpq on tpq.opportunity = toi.parent and toi.item_code = tpq.item_code and toi.qty = tpq.qty and tpq.description = toi.description
				) as top on top.opportunity = tqi.prevdoc_docname and top.s_item_code = tqi.item_code and top.s_qty = tqi.qty and top.description = tqi.description
				LEFT JOIN 
				(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id,
				toi2.item_code as item_code , toi2.qty as qty ,
				toi2.rate as rate , toi2.description as description 
				FROM `tabORC Item` toi2 
				left join `tabORC List` tol on toi2.parent = tol.name
				WHERE tol.docstatus  = 1) as torc on  torc.opportunity_id = top.opportunity and top.s_item_code = torc.item_code 
				and top.s_qty = torc.qty and top.s_rate = torc.rate and top.description = torc.description
				LEFT JOIN `tabSales Team` on `tabSales Order Item`.parent = `tabSales Team`.parent
				LEFT JOIN `tabUser` tu on `tabSales Team`.sales_person = tu.full_name
				LEFT JOIN `tabFiscal Year`  on `tabFiscal Year`.year_start_date <= `tabSales Order`.transaction_date  and `tabSales Order`.transaction_date <= `tabFiscal Year`.year_end_date
	where
				`tabSales Order`.docstatus=1  
				AND `tabFiscal Year`.year_start_date <= CURRENT_DATE
                AND `tabFiscal Year`.year_end_date >= CURRENT_DATE
                           and `tabFiscal Year`.name = '{fiscal_year1}' {condition}
				
			GROUP BY
			     	`tabSales Order Item`.name
			order by
				`tabSales Order`.name desc,`tabSales Order`.transaction_date desc) as tsop on `tabSales Target`.sales_person = tsop.sales_person and
				`tabSales Target`.fiscal_year= tsop.fiscal_year

GROUP BY
    tsop.fiscal_year 

ORDER BY
    tsop.fiscal_year DESC;

    """, as_dict=True)
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(result)))

    if result :
        for data in result:
            return data
        
    return {"bottomline_target": 0, "topline_target": 0, "target_qty": 0}        
