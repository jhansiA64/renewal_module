# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from datetime import datetime
from frappe.utils import flt
# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta


def execute(filters=None):
	columns, data = get_columns(),get_data(filters)
	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	# report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

	# chart = get_chart_data(filters, columns, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	
	return columns, data, None


def get_columns():
	columns = [
		{
			"label": _("Call ID"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Call Log Management",
			"width": 170,
		},
		{
			"fieldname":"name1",
		    "label":"Contact",
			"fieldtype":"Data",
			"width":200
	    },
		# {
		# 	"label": _("Status"),
		# 	"fieldname": "status",
		# 	"fieldtype": "Data",
		# 	"width": 170,
		# },
	    {
			"fieldname":"start_date",
			"label":_("Start Date"),
			"fieldtype":"Date",
			"width":150
		},
		{
			"fieldname":"start_timing",
			"label":_("Start Time"),
			"fieldtype":"Time",
			"width":150
		},
		# {
		# 	"fieldname":"end_date",
		# 	"label":_("End Date"),
		# 	"fieldtype":"Date",
		# 	"width":150
		# },
		# {
		# 	"fieldname":"end_timing",
		# 	"label":_("End Time"),
		# 	"fieldtype":"Time",
		# 	"width":150
		# },
		{
			"fieldname":"duration",
			"label":_("Duration"),
			"fieldtype":"Data",
			"width":150
		},
		# {
		# 	"label": _("View Button"),
		# 	"fieldname": "name2",
		# 	"fieldtype": "Data",
		# 	"width": 150,
		# },
		
		{
			"fieldname":"sales_person",
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
			`tabCall Log Management`.name,
			`tabCall Log Management`.name1,
			`tabCall Log Management`.datetime as start_date,
			`tabCall Log Management`.time as start_timing,
			`tabCall Log Management`.duration,
			tsp.name as sales_person
		FROM
			`tabCall Log Management`
			{join}
		where
		{conditions}	
		
		ORDER BY
			`tabCall Log Management`.creation asc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
	# frappe.msgprint("hello")

def get_conditions(filters):
	conditions = []

	
	if filters.get("timespan") != "custom":
		if filters.get("timespan") == "this year":
			date = frappe.db.get_value("Fiscal Year",["year_start_date"])
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
		date_range = get_timespan_date_range(filters.get("timespan")) 
		date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
		date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date1)))
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date2)))
		conditions.append(f"`tabCall Log Management`.datetime >= '{date1}' and `tabCall Log Management`.datetime <= '{date2}'")
	if filters.get("name1"):
		conditions.append(" and `tabCall Log Management`.name1 in %(name1)s")
	
	
	if filters.get("timespan") == "custom":
		
		conditions.append("`tabCall Log Management`.datetime >= %(from_date)s and `tabCall Log Management`.datetime <= %(to_date)s")

		

	if filters.get("sales_person"):
		conditions.append(" and tsp.name in %(sales_person)s")	

	if filters.get("contact_person"):
		conditions.append(" and `tabCall Log Management`.name1 in %(contact_person)s")		

	
	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """LEFT JOIN `tabUser`
			ON 
			`tabUser`.name = `tabCall Log Management`.owner
			LEFT JOIN `tabEmployee` te 	ON te.user_id = `tabUser`.name 
		LEFT JOIN `tabSales Person` tsp ON tsp.employee = te.name 
		"""


	return join

# def get_report_summary(filters,columns, currency, data):
# 	held,scheduled, cancelled = 0, 0, 0
	
	

# 	for period in data:
		
# 		if period.status == "Held":
# 			held += 1
# 		if period.status == "Scheduled":
# 			scheduled += 1	
# 		if period.status == "Cancelled":
# 			cancelled += 1
			
		

# 	held_label = ("Held")
# 	scheduled_label = _("Scheduled")
# 	cancelled_label = _("Cancelled")
	

# 	return [
# 		{"value": held,"indicator": "Green", "label": held_label, "datatype": "Data"},
		
# 		{"value":scheduled,"indicator": "Blue", "label": scheduled_label, "datatype": "Data"},
# 		{"value": cancelled,"indicator": "Green", "label": cancelled_label, "datatype": "Data"},
		
# 	]




# def get_chart_data(filters,columns, data):
# 	status_wise_map = {
# 		"Held":0.0,
# 		"Scheduled":0.0,
# 		"Cancelled":0.0
# 	}
# 	labels, datapoints_calls = [], []

# 	for row in data:
# 		item_key = row.get("status")

# 		if item_key == "Held":
# 			status_wise_map[item_key] += 1
# 		if item_key == "Scheduled":
# 			status_wise_map[item_key] += 1
# 		if item_key == "Cancelled":
# 			status_wise_map[item_key] += 1		

# 		if not item_key in status_wise_map:
# 			status_wise_map[item_key] = 0.0

# 		status_wise_map[item_key] = flt(status_wise_map[item_key]) 

# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(status_wise_map)))	
# 	status_wise_map = {
# 		item: value
# 		for item, value in (sorted(status_wise_map.items(), key=lambda i: i[0]))
# 	}

# 	for key in status_wise_map:
# 		labels.append(key)
# 		datapoints_calls.append(status_wise_map[key])
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(datapoints_calls)))	

	
	
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json({"labels":labels,"datasets":[{"values":datapoints_sales}]})))
		

# 	return {
# 		"data": {
# 			"labels": labels,  # show max of 30 items in chart
# 			"datasets": [{"values": datapoints_calls}],
# 		},
# 		"type": "pie",
# 		"colors":["#c80064","#008000","#9C2162","#D03454","#FFCA3E","#772F67", "#00A88F"],
# 	}




