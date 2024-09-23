# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from datetime import datetime

# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_report_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta

from collections import OrderedDict
from frappe import _, qb, scrub
from frappe.query_builder import Order
from frappe.utils import cint, flt, formatdate

from erpnext.controllers.queries import get_match_cond
from erpnext.stock.report.stock_ledger.stock_ledger import get_item_group_condition
from erpnext.stock.utils import get_incoming_rate



def execute(filters=None):
	columns, data = get_columns(), get_data(filters)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

	chart = get_chart_data(filters, columns, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))
	
	
	return columns, data, None, chart, report_summary

def get_columns():
	columns = [
		{
			"label": _("Opportunity"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Opportunity",
			"width": 195,
		},
		# {
		# 	"label": _("Partner"),
		# 	"fieldname": "party_name",
		# 	"fieldtype": "Dynamic Link",
		# 	"options": "opportunity_from",
		# 	"width": 160,
		# },
		{
			"label": _("Partner"),
			"fieldname": "party_name",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 160,
		},
		
		{
			"label": _("End Customer"),
			"fieldname": "custom_end_customer_name",
			"fieldtype": "Link",
			"options": "End Customer",
			"width": 160,
		},
		{
			"label": _("Item Name"),
			"fieldname": "item_name",
			"fieldtype": "Data",
			"width": 130,
		},
		{
				"label": _("Posting Date"),
				"fieldname": "transaction_date",
				"fieldtype": "Date",
				"width": 150,
			},
			{
			"fieldname":"expected_date",
			"label":_("Expected Date"),
			"fieldtype":"Date",
			"width":150
		},
		
                 {
                        "label": _("Sales Stage"),
                        "fieldname": "sales_stage",
                        "fieldtype": "Link",
                        "options": "Sales Stage",
                        "width": 150,
                },
				{
			"label": _("Item Code"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 130,
		},
		
		{
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
			"fieldname":"forecast",
			"label":_("Forecast"),
			"fieldtype":"Data",
			"width":150
		},
		 {
			"label": _("Opportunity Type"),
			"fieldname": "opportunity_type",
			"fieldtype": "Data",
			
			"width": 150,
		},
		{
			"label": _("Renewal ID"),
			"fieldname": "renewal_id",
			"fieldtype": "Link",
			"options": "Renewal List",
			"width": 130,
		},
		{
			"fieldname":"qty",
		    "label":_("Qty"),
		    "fieldtype": "Float",
		    
			"width":100
		},

		
		{
			"fieldname":"base_rate",
		    "label":_("Sales Rate"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"base_net_amount",
		    "label":_("Amount"),
		    "fieldtype": "Currency",
			"width":200
		},
		
		{
				"label": _("Purchase Rate"),
				"fieldname": "purchase_rate",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			{
				"label": _("Purchase Amount"),
				"fieldname": "buying_amount",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			{
				"label": _("Margin"),
				"fieldname": "margin",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			{
				"label": _("ORC"),
				"fieldname": "orc",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			{
				"label": _("Gross Profit"),
				"fieldname": "gross_profit",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			 {
				"label": _("Gross Profit Percent"),
				"fieldname": "gross_profit_%",
				"fieldtype": "Percent",
				"width": 100,
			},
			
		{
			"fieldname":"sales_person",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		},
		{
				"label": _("Description"),
				"fieldname": "description",
				"fieldtype": "Data",
				"width": 100,
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
			`tabOpportunity`.custom_end_customer_name,
			`tabOpportunity`.transaction_date,
			`tabOpportunity`.territory, `tabOpportunity Item`.item_code,
				`tabOpportunity Item`.forecast, `tabOpportunity Item`.opportunity_type,
				`tabOpportunity Item`.renewal_id,
				`tabOpportunity Item`.description,`tabOpportunity Item`.expected_date,
				`tabOpportunity Item`.item_group,`tabOpportunity Item`.sales_stage,
				`tabOpportunity Item`.brand, `tabOpportunity Item`.item_name,
				`tabOpportunity Item`.qty as qty,
				`tabOpportunity Item`.rate as base_rate, `tabOpportunity Item`.amount as base_net_amount,
				(CASE when tpq.amount IS NULL  then 0 
				else tpq.amount END )as buying_amount,
				(CASE when tpq.amount IS NULL  then  0
				else `tabOpportunity Item`.amount - tpq.amount END )as margin,
				`tabSales Team`.sales_person,
				(CASE when `tabOpportunity Item`.orc = 1 then torc.commission_amount
				else 0.0 END) as orc,
				`tabOpportunity Item`.name as "item_row"
		FROM
			`tabOpportunity Item`
			{join}
		WHERE
			`tabOpportunity`.company = %(company)s
			{conditions}
		
		ORDER BY
			`tabOpportunity`.transaction_date desc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)

def get_conditions(filters):
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
		conditions.append(f" and DATE(`tabOpportunity`.transaction_date) >= '{date1}' and DATE(`tabOpportunity`.transaction_date) <= '{date2}'")	
	if filters.get("timespan") == "custom":
		
		conditions.append(" and DATE(`tabOpportunity`.transaction_date) >= %(from_date)s and DATE(`tabOpportunity`.transaction_date) <= %(to_date)s")
	

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
				WHERE tol.docstatus  = 1 and tol.status != "Duplicate") as torc on  torc.opportunity_id = `tabOpportunity Item`.parent and `tabOpportunity Item`.item_code = torc.item_code 
				and `tabOpportunity Item`.qty = torc.qty and `tabOpportunity Item`.rate = torc.rate and `tabOpportunity Item`.description = torc.description
				left join `tabSales Team` on `tabOpportunity`.name = `tabSales Team`.parent
                               LEFT JOIN `tabUser` tu on `tabSales Team`.sales_person = tu.full_name"""

	

	return join





def get_report_summary(filters,columns, currency, data):
	closed_won, closed_lost, prospect, total = 0.0, 0.0, 0.0, 0.0
	won_count,lost_count, prospect_count, total_count = 0,0,0, 0

	opportunity_seen = set()


	# Dictionary to store seen opportunities and track sales amounts
    # opportunity_seen = set()	

	for period in data:
		# if filters.group_by == "Opportunity":
			
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(period)))
		if period.name not in opportunity_seen:
			opportunity_seen.add(period.name)  # Mark this parent Opportunity as processed
			total_count += 1
			total += flt(period.base_net_amount)
			if period.sales_stage == "Closed Won":
				won_count += 1
				
			if period.sales_stage == "Closed Lost":
				lost_count += 1
			if period.sales_stage == "Prospecting":
				prospect_count += 1

		if period.sales_stage == "Closed Won":
			closed_won += flt(period.base_net_amount)
			
		if period.sales_stage == "Closed Lost":
			closed_lost += flt(period.base_net_amount)
		if period.sales_stage == "Prospecting":
			prospect += flt(period.base_net_amount)	
				
		
			
		

	won_label = ("Closed Won")
	lost_label = _("Closed Lost")
	prospect_label = _("Open")

	won_count_label = _("Closed Won") + " (" + str(won_count) + ")"
	lost_count_label = _("Closed Lost") + " (" + str(lost_count) + ")"
	prospect_count_label = _("Open") + " (" + str(prospect_count) + ")"
	total_label = _("Total Opportunities") + " (" + str(total_count) + ")"
	

	return [
		{"value": round(total,2), "indicator": "Blue", "label": total_label, "datatype": "Currency"},
		{"value": round(closed_won, 2), "indicator": "Green", "label": won_count_label, "datatype": "Currency"},
        {"value": round(closed_lost, 2), "indicator": "Red", "label": lost_count_label, "datatype": "Currency"},
        {"value": round(prospect, 2), "indicator": "Yellow", "label": prospect_count_label, "datatype": "Currency"},
        
		
	]







def get_chart_data(filters, columns, data):
	prospecting ,  closed_won ,closed_lost= 0.0, 0.0, 0.0
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	# labels = ["prospecting" , "proposal_price_quote", "negotiation_review" , "closed_lost", "closed_won", "dead"]	
	labels = ["Sales Stage"]

	for p in data:
		# frappe.msgprint(p)
		if p.sales_stage == "Prospecting":
			prospecting += flt(p.base_net_amount)
		
		if p.sales_stage == "Closed Lost":
			closed_lost += flt(p.base_net_amount)
		if p.sales_stage == "Closed Won":
			closed_won += flt(p.base_net_amount)
				
		

	datasets = [{"name":"Prospecting","values":[0.0]},
	{"name":"Closed Won","values":[0.0]},{"name":"Closed Lost","values":[0.0]}
	]
	
	if prospecting:
		datasets[0]["values"] = [round(prospecting)]
	
	if closed_lost:
		datasets[2]["values"]= [round(closed_lost)]
	if closed_won:
		datasets[1]["values"] = [round(closed_won)]
	
	
	

	return {
        'title':"Chart Based On Sales Stage",
        'data':{
            'labels':labels,
            'datasets':datasets
        },
        'type':'bar',
        'height':300,
		'fieldtype':'Currency',
		'colors':["#FBC543",  "#007c01", "#A30000"],
    }


