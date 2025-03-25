# Copyright (c) 2025, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from erpnext.accounts.doctype.monthly_distribution.monthly_distribution import (
	get_periodwise_distribution_data,
)
from erpnext.accounts.report.financial_statements import get_period_list
from erpnext.accounts.utils import get_fiscal_year
from datetime import datetime
from frappe.utils import flt
# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta


def execute(filters=None):
	columns, data = [], get_data(filters)
	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	return columns, data

def get_columns():
	columns = [
		
		{
			"fieldname":"sales_person",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		},

		{
			"fieldname":"bottomline_target",
		    "label":_("Bottomline Target"),
		    "fieldtype": "Currency",
			"width":250
		},
		{
			"fieldname":"topline_target",
		    "label":_("Topline Target"),
		    "fieldtype": "Currency",
			"width":250
		},
		{
			"fieldname":"achieved",
		    "label":_("Achieved"),
		    "fieldtype": "Currency",
			"width":250
		},
		
		{
			"fieldname":"variance",
		    "label":_("Variance"),
		    "fieldtype": "Currency",
			"width":200
		},
		
		
		
		
	]
	return columns


def get_data(filters):
	return frappe.db.sql(
		"""
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
			-- COUNT(DISTINCT `tabSales Target`.`sales_person`) as count_s,
			-- COUNT(DISTINCT `bottomline_target`) as count_b,
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
					WHEN top.p_amount IS NULL AND torc.commission_amount IS NOT NULL THEN `tabSales Order Item`.amount - torc.commission_amount
					WHEN top.p_amount IS NULL AND torc.commission_amount IS NULL THEN 0
					WHEN top.p_amount IS NOT NULL AND torc.commission_amount IS NOT NULL THEN (`tabSales Order Item`.amount - top.p_amount) - torc.commission_amount
					WHEN top.p_amount IS NOT NULL AND torc.commission_amount IS NULL THEN `tabSales Order Item`.amount - top.p_amount
					ELSE 0
				END) AS profit,
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
					`tabSales Order`.docstatus=1  and {conditions}
				GROUP BY
						`tabSales Order Item`.name
				) as tsop on `tabSales Target`.sales_person = tsop.sales_person and
					`tabSales Target`.fiscal_year= tsop.fiscal_year
		GROUP BY
		tsop.fiscal_year, Month
		
		ORDER BY
			tsop.fiscal_year DESC, fiscal_month ASC;
			""".format(
				conditions=get_conditions(filters)
			),
			filters,
			as_dict=1,
	)

def get_conditions(filters):
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters)))
	conditions = []

	# if filters.get("timespan") != "custom":
	# 	if filters.get("timespan") == "this year":
	# 		date = frappe.db.get_value("Fiscal Year",["year_start_date"])
	# 		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
	# 	date_range = get_timespan_date_range(filters.get("timespan")) 
	# 	date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
	# 	date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
	# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date1)))
	# 	conditions.append(f" and DATE(`tabSales Order`.transaction_date) >= '{date1}' and DATE(`tabSales Order`.transaction_date) <= '{date2}'")
		
       
	# if filters.get("timespan") == "custom":
		
	# 	conditions.append(" and DATE(`tabSales Order`.transaction_date) >= %(from_date)s and DATE(`tabSales Order`.transaction_date) <= %(to_date)s")
	

	# if filters.get("item_code"):
	# 	conditions.append(" and `tabSales Order Item`.item_code=%(item_code)s")

	# if filters.get("item_group"):
	# 	conditions.append(" and `tabSales Order Item`.item_group in %(item_group)s")

	# if filters.get("brand"):
	# 	conditions.append(" and `tabSales Order Item`.brand in %(brand)s")		

	if filters.get("sales_person"):
		conditions.append(" and `tabSales Team`.sales_person in %(sales_person)s")	

	return " ".join(conditions) if conditions else ""
