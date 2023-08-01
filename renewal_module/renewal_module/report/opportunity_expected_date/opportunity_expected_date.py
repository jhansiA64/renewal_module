# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _
from frappe import scrub
from frappe.utils import add_days, add_to_date, flt, getdate



def execute(filters=None):
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	columns, data = get_columns(), get_data(filters, from_date, to_date)
	

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"

	)
	
	last_date = add_days(from_date, -6)
	last_week_data = get_data(filters, last_date, from_date)
	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(from_date)))
	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(last_date)))
	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(last_week_data)))

	report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))

	
	chart = get_chart_data(filters, columns, data, last_week_data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))
	
	
	return columns, data , None, chart, report_summary


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


def get_data(filters,date1, date2):
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
			`tabOpportunity`.territory
		FROM
			`tabOpportunity Item`
			{join}
		WHERE
			`tabOpportunity`.company = %(company)s
			AND DATE(`tabOpportunity Item`.expected_date) BETWEEN '{d1}' AND  '{d2}'
			{conditions}
		
		ORDER BY
			`tabOpportunity`.creation asc  """.format(
			conditions=get_conditions(filters), join=get_join(filters), d1 = date1, d2 = date2
		),
		filters,
		as_dict=1,
	)


def get_conditions(filters):
	conditions = []

	if filters.get("opportunity_id"):
		conditions.append(" and `tabOpportunity`.name=%(opportunity_id)s")

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
	join = """LEFT JOIN `tabOpportunity`
			ON 
			`tabOpportunity Item`.parent = `tabOpportunity`.name"""

	# if filters.get("lost_reason"):
	# 	join = """JOIN `tabOpportunity Lost Reason Detail`
	# 		ON `tabOpportunity Lost Reason Detail`.parenttype = 'Opportunity' and
	# 		`tabOpportunity Lost Reason Detail`.parent = `tabOpportunity`.name and
	# 		`tabOpportunity Lost Reason Detail`.lost_reason = '{0}'
	# 		""".format(
	# 		filters.get("lost_reason")
	# 	)

	return join

def get_report_summary(filters,columns, currency, current_week):
	new,new_total, renewal, renewal_total = 0,0, 0, 0
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(start_date)))
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))


	# from consolidated financial statement
	# if filters.get("accumulated_in_group_company"):
	# 	period_list = get_data(filters, period_list)

	for period in current_week:
		
		if period.sales_stage == "Closed Won" and period.opportunity_type in ["New", "Additional"] :
			new += 1
		if period.sales_stage  and period.opportunity_type in ["New", "Additional"]:
			new_total += 1	
		if period.sales_stage == "Closed Won" and period.opportunity_type == "Renewal" :
			renewal += 1
		if period.sales_stage  and period.opportunity_type =="Renewal":
			renewal_total += 1		
		

	# if len(data) >= 1 :
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(new_total)))
	new_label = ("New (Last Week)")
	renewal_label = _("Renewal (Last Week)")
	# renewal_total_label = _("Closed Won")
	# else:
	# 	profit_label = _("Net Profit")
	# 	income_label = _("Total Income")
	# 	expense_label = _("Total Expense")

	return [
		{"value": str(new)+ "/" + str(new_total),"indicator": "Green", "label": _("New (Last Week)"), "datatype": "Data"},
		
		{"value":str(renewal)+ "/" + str(renewal_total),"indicator": "Blue", "label": _("Renewal (Last Week)"), "datatype": "Data"},
		
	]



def get_chart_data(filters, columns, data,last_data):
	
	
	labels = ["New", "Total"]

	status_list = {
		"total": 0,
		"new" : 0

	}

	for p in data:
		# frappe.msgprint(p)
		if p.sales_stage == "Closed Won" and p.opportunity_type in ["New", "Additional"] :
			status_list["new"] += 1
		if p.sales_stage and p.opportunity_type in ["New", "Additional"] :
		    status_list["total"] += 1
					
		

		
	datasets = []
	
	datasets.append({"name":"Status", "values":[status_list.get("new"),status_list.get("total")]})
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(datasets)))

	return {
        'title':"Renewal Status",
        'data':{
            'labels':labels,
            'datasets':datasets
        },
        'type':'pie',
        'height':300,
		'fieldtype':'Currency',
		'colors':["#1AC9E6", "#1DE4BD"],
    }

