# Copyright (c) 2025, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe


# import frappe
import frappe
from frappe import _
from datetime import datetime
from frappe.utils import flt
# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_report_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta


def execute(filters=None):
	columns, data, item_data, brand_data, sales_stage_data, monthly_data  = get_columns(), get_data(filters), get_item_group_data(filters),get_brand_data(filters),get_sales_stage_data(filters), get_monthly_data(filters)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	# report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))

	chart = get_chart_data(filters, columns, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))
	
	
	return columns, data, None, chart

def get_columns():
	columns = [
		{
			"label": _("Opportunity"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Opportunity",
			"width": 170,
		},
		{
			"label": _("Item Code"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 130,
		},
		{
			"label": _("Party"),
			"fieldname": "party_name",
			"fieldtype": "Dynamic Link",
			"options": "opportunity_from",
			"width": 160,
		},
                 {
                        "label": _("Sales Stage"),
                        "fieldname": "sales_stage",
                        "fieldtype": "Link",
                        "options": "Sales Stage",
                        "width": 150,
                },
		{
			"fieldname":"qty",
		    "label":_("qty"),
		    "fieldtype": "Float",
		    
			"width":100
		},
		
		{
			"fieldname":"amount",
		    "label":_("Amount"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"buying_amount",
		    "label":_("Buying Amount"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"margin",
		    "label":_("Margin"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"orc",
		    "label":_("ORC"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"gross_profit",
		    "label":_("Gross Profit"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"support",
		    "label":_("Support"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"mdf",
		    "label":_("MDF"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"net_profit",
		    "label":_("Net Profit"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"forecast",
			"label":_("Forecast"),
			"fieldtype":"Data",
			"width":150
		},
		{
			"fieldname":"expected_date",
			"label":_("Expected Date"),
			"fieldtype":"Date",
			"width":150
		},
		
		{
			"fieldname":"sales_person",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		},
		{
			"label": _("Opportunity Type"),
			"fieldname": "opportunity_type",
			"fieldtype": "Data",
			
			"width": 150,
		},{
			"label": _("Item group"),
			"fieldname": "item_group",
			"fieldtype": "Link",
			"options": "Item Group",
			"width": 130,
		},
		{
			"label": _("Brand"),
			"fieldname": "brand",
			"fieldtype": "Link",
			"options": "Brand",
			"width": 130,
		},
		{
			"label": _("Territory"),
			"fieldname": "territory",
			"fieldtype": "Link",
			"options": "Territory",
			"width": 150,
		},
	]
	return columns

def get_data(filters):
	return frappe.db.sql(
		"""
		SELECT
			`tabOpportunity`.name,
			`tabOpportunity Item`.item_code,
			`tabOpportunity`.party_name,
			`tabOpportunity Item`.qty,
			`tabOpportunity Item`.amount,
			`tabOpportunity Item`.forecast,
			`tabOpportunity Item`.expected_date,
			`tabOpportunity Item`.opportunity_type,
			`tabOpportunity`.sales_person,
            `tabOpportunity Item`.sales_stage,
            `tabOpportunity Item`.item_group,
			`tabOpportunity Item`.brand,
			`tabOpportunity`.territory,
			(CASE when tpq.amount IS NULL  then 0 
				else tpq.amount END )as buying_amount,
				(CASE when tpq.amount IS NULL  then  0
				else `tabOpportunity Item`.amount - tpq.amount END )as margin,
				(CASE when `tabOpportunity Item`.orc = 1 then torc.commission_amount
				else 0.0 END) as orc,
				(
				CASE 
        WHEN tpq.amount IS NOT NULL AND `tabOpportunity Item`.orc = 1 
            THEN `tabOpportunity Item`.amount - (tpq.amount + torc.commission_amount)
        WHEN tpq.amount IS NOT NULL AND torc.commission_amount IS NULL 
            THEN `tabOpportunity Item`.amount - tpq.amount
        ELSE 0.0
    END
				) AS gross_profit,
				(
				CASE 
					WHEN tpq.amount IS NOT NULL AND `tabOpportunity Item`.orc = 1 
						THEN `tabOpportunity Item`.amount - (tpq.amount + torc.commission_amount)
					WHEN tpq.amount IS NOT NULL AND torc.commission_amount IS NULL 
						THEN `tabOpportunity Item`.amount - tpq.amount
					ELSE 0.0
				END
				) * 0.1 AS support,
				(
				CASE 
					WHEN tpq.amount IS NOT NULL AND `tabOpportunity Item`.orc = 1 
						THEN `tabOpportunity Item`.amount - (tpq.amount + torc.commission_amount)
					WHEN tpq.amount IS NOT NULL AND torc.commission_amount IS NULL 
						THEN `tabOpportunity Item`.amount - tpq.amount
					ELSE 0.0
				END
				) * 0.1 AS mdf,
				((
				CASE 
					WHEN tpq.amount IS NOT NULL AND `tabOpportunity Item`.orc = 1 
						THEN `tabOpportunity Item`.amount - (tpq.amount + torc.commission_amount)
					WHEN tpq.amount IS NOT NULL AND torc.commission_amount IS NULL 
						THEN `tabOpportunity Item`.amount - tpq.amount
					ELSE 0.0
				END
				)  - (((
				CASE 
					WHEN tpq.amount IS NOT NULL AND `tabOpportunity Item`.orc = 1 
						THEN `tabOpportunity Item`.amount - (tpq.amount + torc.commission_amount)
					WHEN tpq.amount IS NOT NULL AND torc.commission_amount IS NULL 
						THEN `tabOpportunity Item`.amount - tpq.amount
					ELSE 0.0
				END
				) * 0.1) +((
				CASE 
					WHEN tpq.amount IS NOT NULL AND `tabOpportunity Item`.orc = 1 
						THEN `tabOpportunity Item`.amount - (tpq.amount + torc.commission_amount)
					WHEN tpq.amount IS NOT NULL AND torc.commission_amount IS NULL 
						THEN `tabOpportunity Item`.amount - tpq.amount
					ELSE 0.0
				END
				) * 0.1))
				) as net_profit,
				
				`tabOpportunity Item`.name as "item_row"
		FROM
			`tabOpportunity Item`
			{join}
		WHERE
			`tabOpportunity`.company = %(company)s
			{conditions}
		GROUP BY `tabOpportunity Item`.name	
		
		ORDER BY
			`tabOpportunity`.creation asc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)

def get_conditions(filters):
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters)))
	conditions = []

	if filters.get("opportunity_id"):
		conditions.append(" and `tabOpportunity`.name=%(opportunity_id)s")

	if filters.get("timespan") != "custom":
		if filters.get("timespan") == "this year":
			date = frappe.db.get_value("Fiscal Year",["year_start_date"])
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
		date_range = get_timespan_date_range(filters.get("timespan")) 
		date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
		date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date1)))
		#conditions.append(f" and DATE(`tabOpportunity`.creation) >= '{date1}' and DATE(`tabOpportunity`.creation) <= '{date2}'")
		if filters.get("based_on") == "Creation":
			conditions.append(f" and DATE(`tabOpportunity`.creation)>='{date1}' and DATE(`tabOpportunity`.creation) <='{date2}'")
		else:
			conditions.append(f" and DATE(`tabOpportunity Item`.expected_date) >= '{date1}' and DATE(`tabOpportunity Item`.expected_date) <= '{date2}' ")		
	    # if filters.get("based_on") == "Creation":
        #     conditions.append(f" and DATE(`tabOpportunity`.creation) >= '{date1}' and DATE(`tabOpportunity`.creation) <= '{date2}'")    
        # else:
        #     conditions.append(f" and DATE(`tabOpportunity Item`.expected_date) >= '{date1}' and DATE(`tabOpportunity Item`.expected_date) <= '{date2}'")     

       
	if filters.get("timespan") == "custom":
		if filters.get("based_on") == "Creation":
			conditions.append(" and DATE(`tabOpportunity`.creation) >= %(from_date)s and DATE(`tabOpportunity`.creation) <= %(to_date)s")
		else:
			conditions.append(" and DATE(`tabOpportunity Item`.expected_date) >= %(from_date)s and DATE(`tabOpportunity Item`.expected_date) <= %(to_date)s ")		
	   

	if filters.get("item_code"):
		conditions.append(" and `tabOpportunity Item`.item_code=%(item_code)s")

	if filters.get("item_group"):
		conditions.append(" and `tabOpportunity Item`.item_group in %(item_group)s")

	if filters.get("brand"):
		conditions.append(" and `tabOpportunity Item`.brand in %(brand)s")		

	if filters.get("party_name"):
		conditions.append(" and `tabOpportunity`.party_name in %(party_name)s")

	if filters.get("sales_person"):
		conditions.append(" and `tabOpportunity`.sales_person in %(sales_person)s")	

	if filters.get("opportunity_type"):
		conditions.append(" and `tabOpportunity Item`.opportunity_type in %(opportunity_type)s")
	if filters.get("forecast"):
		conditions.append(" and `tabOpportunity Item`.forecast = %(forecast)s")			

	if filters.get("sales_stage"):
		conditions.append(" and `tabOpportunity Item`.sales_stage in %(sales_stage)s")		

	return " ".join(conditions) if conditions else ""

def get_join(filters):
	join = """Inner join `tabOpportunity` on `tabOpportunity`.name = `tabOpportunity Item`.parent 
				left join (SELECT tsq.name as name  , tsqi.item_code as item_code , tsqi.rate as rate, tsqi.description as description ,
				 tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity
				from `tabSupplier Quotation` tsq  
				left join (SELECT parent , item_code , rate, qty, amount, description   FROM `tabSupplier Quotation Item`  
				WHERE recommended_ =1) as tsqi on tsqi.parent = tsq.name 
				) as tpq on tpq.opportunity = `tabOpportunity`.name and `tabOpportunity Item`.item_code = tpq.item_code 
				and `tabOpportunity Item`.qty = tpq.qty and `tabOpportunity Item`.description = tpq.description
				LEFT JOIN 
				(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id, toi2.item_code as item_code , toi2.qty as qty ,
				toi2.rate as rate , toi2.description as description 
				FROM `tabORC Item` toi2 
				left join `tabORC List` tol on toi2.parent = tol.name
				WHERE tol.docstatus  != 2 and tol.status != "Duplicate") as torc on  torc.opportunity_id = `tabOpportunity Item`.parent and `tabOpportunity Item`.item_code = torc.item_code 
				and `tabOpportunity Item`.qty = torc.qty and `tabOpportunity Item`.rate = torc.rate and `tabOpportunity Item`.description = torc.description
				left join `tabSales Team` on `tabOpportunity`.name = `tabSales Team`.parent
				LEFT  JOIN `tabRenewal Contacts` trc on trc.parent = `tabOpportunity`.name"""

	

	return join



def get_item_group_data(filters):
	return frappe.db.sql(
		"""
		SELECT
			distinct_opportunities.item_group as item_group,
			SUM(distinct_opportunities.qty) AS qty,
			SUM(distinct_opportunities.amount) AS amount
		FROM
			(
				SELECT DISTINCT
					`tabOpportunity Item`.name AS opportunity_name,
					`tabOpportunity Item`.qty,
					`tabOpportunity Item`.amount,
					`tabOpportunity Item`.item_group
				FROM
					`tabOpportunity Item`
				{join}
				WHERE
					`tabOpportunity`.company = %(company)s
					{conditions}
			) AS distinct_opportunities
		GROUP BY 
			distinct_opportunities.item_group	
		
		ORDER BY
			amount desc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)


def get_brand_data(filters):
	return frappe.db.sql(
		# """
		# SELECT
		# 	`tabOpportunity Item`.brand,
		# 	sum(`tabOpportunity Item`.qty) as qty,
		# 	sum(`tabOpportunity Item`.amount) as amount			
		# FROM
		# 	`tabOpportunity Item`
		# 	{join}
		# WHERE
		# 	`tabOpportunity`.company = %(company)s
		# 	{conditions}
		# Group BY 
		# `tabOpportunity Item`.brand	
		
		# ORDER BY
		# 	amount desc  """.format(
		# 	conditions=get_conditions(filters), join=get_join(filters)
		# ),

		"""
		SELECT
			distinct_opportunities.brand as brand,
			SUM(distinct_opportunities.qty) AS qty,
			SUM(distinct_opportunities.amount) AS amount
		FROM
			(
				SELECT DISTINCT
					`tabOpportunity Item`.name AS opportunity_name,
					`tabOpportunity Item`.qty,
					`tabOpportunity Item`.amount,
					`tabOpportunity Item`.brand
				FROM
					`tabOpportunity Item`
				{join}
				WHERE
					`tabOpportunity`.company = %(company)s
					{conditions}
			) AS distinct_opportunities
		GROUP BY 
			distinct_opportunities.brand
		ORDER BY
			amount DESC;

		""".format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)



def get_sales_stage_data(filters):
	return frappe.db.sql(
		"""
		SELECT
			distinct_stage.sales_stage as sales_stage,
			SUM(distinct_stage.qty) AS qty,
			SUM(distinct_stage.amount) AS amount
		FROM
		(SELECT
		    DISTINCT
					`tabOpportunity Item`.name AS opportunity_name,
					`tabOpportunity Item`.qty,
					`tabOpportunity Item`.amount,
					`tabOpportunity Item`.sales_stage
				FROM
			
			`tabOpportunity Item`
			{join}
		WHERE
			`tabOpportunity`.company = %(company)s
			{conditions}) as distinct_stage
		Group BY 
		distinct_stage.sales_stage	
		
		ORDER BY
			amount desc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)


def get_monthly_data(filters):
	return frappe.db.sql(
		"""
		SELECT
				CONCAT(MONTHNAME(`tabOpportunity`.creation)) AS month,  -- Get full month name and year
				SUM(`tabOpportunity Item`.amount) AS amount , -- Sum of the amount for each month
				SUM(`tabOpportunity Item`.qty) AS qty 
			FROM
				`tabOpportunity Item`
				{join}			
			WHERE
				`tabOpportunity`.company = %(company)s 
				{conditions}  
			GROUP BY
				YEAR(`tabOpportunity`.creation), MONTH(`tabOpportunity`.creation) 
			ORDER BY
				`tabOpportunity`.creation ASC;  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)





def get_chart_data(filters,columns, data):
	brand_wise_sales_map = {}
	labels, datapoints_sales = [], []

	for row in data:
		item_key = row.get("sales_stage")

		if not item_key in brand_wise_sales_map:
			brand_wise_sales_map[item_key] = 0.0

		brand_wise_sales_map[item_key] = flt(brand_wise_sales_map[item_key]) + flt(row.get("amount"))

	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(brand_wise_sales_map)))	
	brand_wise_sales_map = {
		item: value
		for item, value in (sorted(brand_wise_sales_map.items(), key=lambda i: i[0]))
	}

	for key in brand_wise_sales_map:
		labels.append(key)
		datapoints_sales.append(brand_wise_sales_map[key])

	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json({"labels":labels,"datasets":[{"values":datapoints_sales}]})))
		

	return {
		"data": {
			"labels": labels,  # show max of 30 items in chart
			"datasets": [{"values": datapoints_sales}],
		},
		"type": "bar",
		"colors":["#c80064","#008000","#9C2162","#D03454","#FFCA3E","#772F67", "#00A88F"],
	}





