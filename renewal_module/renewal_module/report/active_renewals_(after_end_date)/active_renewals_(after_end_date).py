# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _


def execute(filters=None):
	columns, data = get_columns(), get_data(filters)
	frappe.msgprint("<span style='color:Red;'>" + "<pre>{}</pre>".format(frappe.as_json(data)))
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
			"fieldtype": "Data",
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
			
			`tabRenewal List`.end_date,
			`tabRenewal List`.sales_user
            
		FROM
			`tabRenewal List`
			{join}
		WHERE
			`tabRenewal List`.company = %(company)s	AND
			`tabRenewal List`.status = "Active"		
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
		conditions.append(" and `tabRenewal List`.sales_user=%(sales_person)s")	

	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """LEFT JOIN `tabRenewal Item`
			ON 
			`tabRenewal List`.name = `tabRenewal Item`.parent"""

	

	return join
