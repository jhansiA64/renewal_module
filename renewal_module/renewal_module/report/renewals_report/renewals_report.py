# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _, qb, scrub
from frappe.query_builder import Order
from frappe.utils import cint, flt, formatdate
from datetime import datetime
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta

from erpnext.controllers.queries import get_match_cond
from erpnext.stock.report.stock_ledger.stock_ledger import get_item_group_condition
from erpnext.stock.utils import get_incoming_rate



def execute(filters=None):
	columns, data = get_columns(), get_data(filters)
	
	# current_week = get_data(filters, start_date1, end_date )


	#frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(data)))
	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	# report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))
	# chart = get_chart_data(filters, columns, data)
	
	return columns, data


def get_columns():
	columns = [
		{
			"label": _("Renewal List"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Renewal List",
			"width": 170,
		},
		
		{
			"label": _("Customer name"),
			"fieldname": "customer_name",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 200,
		},
		{
			"label": _("Product Name"),
			"fieldname": "product_name",
			"fieldtype": "Data",
			
			"width": 180,
		},
		{
			"label":_("Status"),
			"fieldname":"status",
			"fieldtype":"Data",
			"width":80,
		},
		{
			"label": _("End Date"),
			"fieldname": "end_date",
			"fieldtype": "Date",
			"width": 150,
		},
		{
			"label": _("Item Code"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 160,
		},
		
		{
			"fieldname":"total_quantity",
		    "label":_("Total Quantity"),
		    "fieldtype": "Float",
		    
			"width":100
		},
		{
			"fieldname":"total_amount",
		    "label":_("Total Amount"),
		    "fieldtype": "currency",
		    
			"width":100
		},
		{
			"label": _("Invoice No"),
			"fieldname": "invoice_no",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 160,
		},
		
				
		{
			"fieldname":"sales_user",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		},
		
		
	]
	return columns


def get_data(filters):
	return frappe.db.sql(
		"""
		SELECT
			`tabRenewal List`.name,
			`tabRenewal List`.customer_name,
			`tabRenewal List`.status,
			`tabRenewal Item`.item_code,
			`tabRenewal List`.product_name,
			`tabRenewal List`.total_quantity,
			`tabRenewal List`.total_amount,
			`tabRenewal List`.invoice_no,
			`tabRenewal List`.end_date,
			`tabRenewal List`.sales_user
            
		FROM
			`tabRenewal List`
			{join}
		WHERE
			`tabRenewal List`.company = %(company)s	
			AND DATE(`tabRenewal List`.end_date) BETWEEN %(from_date)s AND %(to_date)s	
			{conditions}

		GROUP BY
		   `tabRenewal List`.name
		
		ORDER BY
			`tabRenewal List`.creation asc  """.format(
			conditions=get_conditions(filters),join=get_join(filters)
		),
		filters,
		as_dict=1,

		
	)


def get_conditions(filters):
	conditions = ""

	if filters.get("renewal_id"):
		conditions += " and `tabRenewal List`.name=%(renewal_id)s"

	# if filters.get("end_date"):
	#  	conditions.append(" and `tabRenewal List`.end_date <= %(end_date)s")
	if filters.get("timespan") != "custom":
		date_range = get_timespan_date_range(filters.timespan) 
		date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
		date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
		if filters.based_on == "Creation":
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
			conditions += " and `tabRenewal List`.status = ('Active')"
			conditions += f" and `tabRenewal List`.creation >= '{date1}' and `tabRenewal List`.creation <= '{date2}'"
		else:
			conditions += " and `tabRenewal List`.status in ('Active','New Opp')"
			conditions += f" and `tabRenewal List`.end_date >= '{date1}' and `tabRenewal List`.end_date <= '{date2}'"	
	if filters.timespan == "custom":
		if filters.based_on == "Creation":
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
			conditions += " and `tabRenewal List`.status = ('Active')"
			conditions += " and `tabRenewal List`.creation >= %(from_date)s and `tabRenewal List`.creation <= %(to_date)s"
		else:
			conditions += " and `tabRenewal List`.status in ('Active','New Opp')"
			conditions += " and `tabRenewal List`.end_date >= %(from_date)s and `tabRenewal List`.end_date <= %(to_date)s"	
					

	if filters.get("customer"):
		conditions += " and `tabRenewal List`.customer_name=%(customer)s"

	if filters.get("sales_person"):
		conditions += " and `tabRenewal List`.sales_user in %(sales_person)s"

	if filters.get("status"):
		conditions += " and `tabRenewal List`.status in %(status)s"		

	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """LEFT JOIN `tabRenewal Item`
			ON 
			`tabRenewal List`.name = `tabRenewal Item`.parent"""

	

	return join

# def get_report_summary(filters,columns, currency, data):
# 	total, cofed,new_opp, lost = 0, 0, 0,0
# 	#frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(data)))

# 	for period in data:
# 		if period.status == "New Opp":
# 			new_opp += 1
		
# 		if period.status == "Cofed":
# 			#frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(cofed)))
# 			cofed += 1
# 		if period.status in ["Cofed", "Active"]:
# 			total += 1	
		
	
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(cofed)))
# 	# frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(total)))
# 	#frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(data)))
# 	total_label = _("Total")
# 	cofed_label = _("Renewals (Cofed/Total Active)")
	

# 	return [
# 		{"value": str(cofed)+ "/" +str(total),"indicator": "Green", "label":cofed_label, "datatype": "Data"}
# 	]


# def get_chart_data(filters, columns, data):
	
	
# 	labels = ["Cofed", "Total"]

# 	status_list = {
# 		"total": 0,
# 		"cofed" : 0

# 	}

# 	for p in data:
# 		# frappe.msgprint(p)
# 		if p.status == "Cofed":
# 			status_list["cofed"] += 1
# 		if p.status in ["Cofed", "Active"]:
# 			status_list["total"] += 1
					
		

		
# 	datasets = []
	
# 	datasets.append({"name":"Status", "values":[status_list.get("cofed"),status_list.get("total")]})
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(datasets)))

# 	return {
#         'title':"Renewal Status",
#         'data':{
#             'labels':labels,
#             'datasets':datasets
#         },
#         'type':'pie',
#         'height':300,
# 		'fieldtype':'Currency',
		
#     }

# def get_chart_data(filters, columns, data):
    
#     total, cofed, lost, new_opp  = 0,0,0,0
#     labels = ["Renewals Data"]

#     for p in data:
# 	    if p.status == "New Opp":
# 	       new_opp += 1
# 	    if p.status in ["Cofed","Active"]:
# 	        total += 1
# 	    if p.status == "Cofed":
# 		    cofed += 1
# 	    if p.status == "Lost":
# 	        lost += 1	  
# 	    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(p)))
	    
		

#     datasets = [{"name":"Total","values":[0.0]},
#     {"name":"Cofed", "values":[0.0]},
# 	{"name":"New Opp", "values":[0.0]},
# 	{"name":"Lost", "values":[0.0]}
#     ]
	
# 	# if prospecting:
# 	# 	datasets[0]["values"] = [prospecting]
	
#     datasets[0]["values"] = [total]
#     datasets[1]["values"] = [cofed]
#     datasets[2]["values"] = [new_opp]
#     datasets[3]["values"] = [lost]
		

#     return {
#         'title':"Renewals Data",
#         'data':{
#             'labels':labels,
#             'datasets':datasets
#         },
#         'type':'bar',
#         'height':300,
# 		'width':1000,
# 		'fieldtype':'Float',
# 		'colors':["#FBC543", "#82C272", "#9C2162"],
#     }
