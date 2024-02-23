# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _
from datetime import datetime
from frappe.utils import flt
# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_report_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta


def execute(filters=None):
	columns, data = get_columns(),get_data(filters)
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
			"label": _("Call ID"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Call List",
			"width": 170,
		},
		{
			"fieldname":"name1",
		    "label":"Customer",
			"fieldtype":"Data",
			"width":200
	    },
		{
			"label": _("Status"),
			"fieldname": "status",
			"fieldtype": "Data",
			"width": 170,
		},
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
		{
			"fieldname":"end_date",
			"label":_("End Date"),
			"fieldtype":"Date",
			"width":150
		},
		{
			"fieldname":"end_timing",
			"label":_("End Time"),
			"fieldtype":"Time",
			"width":150
		},
		{
			"fieldname":"description",
			"label":_("Description"),
			"fieldtype":"Small Text",
			"width":150
		},
		{
			"label": _("View Button"),
			"fieldname": "name2",
			"fieldtype": "Data",
			"width": 150,
		},
		
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
			`tabCall List`.name,
			`tabCall List`.status,
			`tabCall List`.name1,
			`tabCall List`.start_date,
			`tabCall List`.start_timing,
			`tabCall List`.end_date,
			`tabCall List`.end_timing,
			`tabCall List`.description,
			`tabSales Team`.sales_person,
			`tabCall List`.name as name2
		FROM
			`tabCall List`
			{join}
		WHERE
			{conditions}
		
		ORDER BY
			`tabCall List`.creation asc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)

def get_conditions(filters):
	conditions = []

	if filters.get("name1"):
		conditions.append(" and `tabCall List`.name1 in %(name1)s")

	if filters.get("timespan") != "custom":
		if filters.get("timespan") == "this year":
			date = frappe.db.get_value("Fiscal Year",["year_start_date"])
			frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
		date_range = get_timespan_date_range(filters.get("timespan")) 
		date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
		date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date1)))
		conditions.append(f"`tabCall List`.start_date >= '{date1}' and `tabCall List`.start_date <= '{date2}'")
	
	if filters.get("timespan") == "custom":
		
		conditions.append("`tabCall List`.start_date >= %(from_date)s and `tabCall List`.start_date <= %(to_date)s")

		

	if filters.get("sales_person"):
		conditions.append(" and `tabSales Team`.sales_person in %(sales_person)s")	

	if filters.get("status"):
		conditions.append(" and `tabCall List`.status in %(status)s")		

	
	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """LEFT JOIN `tabSales Team`
			ON 
			`tabSales Team`.parent = `tabCall List`.name"""


	return join

def get_report_summary(filters,columns, currency, data):
	held,scheduled, cancelled = 0, 0, 0
	
	

	for period in data:
		
		if period.status == "Held":
			held += 1
		if period.status == "Scheduled":
			scheduled += 1	
		if period.status == "Cancelled":
			cancelled += 1
			
		

	held_label = ("Held")
	scheduled_label = _("Scheduled")
	cancelled_label = _("Cancelled")
	

	return [
		{"value": held,"indicator": "Green", "label": held_label, "datatype": "Data"},
		
		{"value":scheduled,"indicator": "Blue", "label": scheduled_label, "datatype": "Data"},
		{"value": cancelled,"indicator": "Green", "label": cancelled_label, "datatype": "Data"},
		
	]




def get_chart_data(filters,columns, data):
	status_wise_map = {
		"Held":0.0,
		"Scheduled":0.0,
		"Cancelled":0.0
	}
	labels, datapoints_calls = [], []

	for row in data:
		item_key = row.get("status")

		if item_key == "Held":
			status_wise_map[item_key] += 1
		if item_key == "Scheduled":
			status_wise_map[item_key] += 1
		if item_key == "Cancelled":
			status_wise_map[item_key] += 1		

		if not item_key in status_wise_map:
			status_wise_map[item_key] = 0.0

		status_wise_map[item_key] = flt(status_wise_map[item_key]) 

	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(status_wise_map)))	
	status_wise_map = {
		item: value
		for item, value in (sorted(status_wise_map.items(), key=lambda i: i[0]))
	}

	for key in status_wise_map:
		labels.append(key)
		datapoints_calls.append(status_wise_map[key])
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(datapoints_calls)))	

	
	
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json({"labels":labels,"datasets":[{"values":datapoints_sales}]})))
		

	return {
		"data": {
			"labels": labels,  # show max of 30 items in chart
			"datasets": [{"values": datapoints_calls}],
		},
		"type": "pie",
		"colors":["#c80064","#008000","#9C2162","#D03454","#FFCA3E","#772F67", "#00A88F"],
	}


