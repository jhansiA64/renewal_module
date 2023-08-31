# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _

def execute(filters=None):
	columns, data = get_columns(), get_data(filters)
	
	# current_week = get_data(filters, start_date1, end_date )


	#frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(data)))
	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))
	chart = get_chart_data(filters, columns, data)
	
	return columns, data,None, chart, report_summary


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
		    "fieldtype": "Data",
		    
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
	conditions = []

	if filters.get("renewal_id"):
		conditions.append(" and `tabRenewal List`.name=%(renewal_id)s")

	if filters.get("end_date"):
	 	conditions.append(" and `tabRenewal List`.end_date <= %(end_date)s")
				

	if filters.get("customer"):
		conditions.append(" and `tabRenewal List`.customer_name=%(customer)s")

	if filters.get("sales_person"):
		conditions.append(" and `tabRenewal List`.sales_user in %(sales_person)s")	

	if filters.get("status"):
		conditions.append(" and `tabRenewal List`.status in %(status)s")		

	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """LEFT JOIN `tabRenewal Item`
			ON 
			`tabRenewal List`.name = `tabRenewal Item`.parent"""

	

	return join

def get_report_summary(filters,columns, currency, data):
	total, cofed = 0, 0
	#frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(data)))

	for period in data:
		
		if period.status == "Cofed":
			#frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(cofed)))
			cofed += 1
		if period.status in ["Cofed", "Active"]:
			total += 1	
		
	
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(cofed)))
	# frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(total)))
	#frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(data)))
	total_label = _("Total")
	cofed_label = _("Renewals")
	

	return [
		{"value": str(cofed)+ "/" +str(total),"indicator": "Green", "label":cofed_label, "datatype": "Data"}
	]


def get_chart_data(filters, columns, data):
	
	
	labels = ["Cofed", "Total"]

	status_list = {
		"total": 0,
		"cofed" : 0

	}

	for p in data:
		# frappe.msgprint(p)
		if p.status == "Cofed":
			status_list["cofed"] += 1
		if p.status in ["Cofed", "Active"]:
			status_list["total"] += 1
					
		

		
	datasets = []
	
	datasets.append({"name":"Status", "values":[status_list.get("cofed"),status_list.get("total")]})
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
		
    }

