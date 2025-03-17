# Copyright (c) 2025, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from datetime import datetime
from frappe.utils import flt
# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta

def execute(filters=None):
	columns, data = get_columns(), get_data(filters)

		
	return columns, data, None

def get_columns():
	columns = [
		
		
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
				CONCAT(MONTHNAME(`tabOpportunity`.creation), ' ', YEAR(`tabOpportunity`.creation)) AS month,  -- Get full month name and year
				SUM(`tabOpportunity Item`.amount) AS total_amount  -- Sum of the amount for each month
			FROM
				`tabOpportunity Item`
				{join}			
			WHERE
				`tabOpportunity`.company = %(company)s
				{conditions}  
			GROUP BY
				YEAR(`tabOpportunity`.creation), MONTH(`tabOpportunity`.creation) 
			ORDER BY
				`tabOpportunity`.creation ASC; 
			""".format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)


def get_conditions(filters):
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters)))
	conditions = []
       
	if filters.get("sales_person"):
		conditions.append(" and `tabSales team`.sales_person in %(sales_person)s")	

	


def get_join(filters):
	join = """LEFT JOIN `tabOpportunity`
				ON `tabOpportunity Item`.parent = `tabOpportunity`.name
			LEFT JOIN `tabSales Team`
				ON `tabSales Team`.parent = `tabOpportunity`.name"""

	

	return join
