# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _


def execute(filters=None):
	columns, data = get_columns(), get_data(filters)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	# report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

	# chart = get_chart_data(filters, columns, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))
	
	
	return columns, data


def get_columns():
	columns = [
		{
			"label": _("Sales invoice"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 170,
		},
		
		{
			"label": _("Customer"),
			"fieldname": "customer",
			"fieldtype": "Dynamic Link",
			"options": "sales_invoice_from",
			"width": 160,
		},
		{
			"label": _("Status"),
			"fieldname": "status",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"fieldname":"posting_date",
		    "label":_("Posting Date"),
		    "fieldtype": "Data",
		    
			"width":200
		},
		{
			"fieldname":"due_date",
		    "label":_("Due Date"),
		    "fieldtype": "Data",
		    
			"width":200
		},
		
		{
			"fieldname":"age",
		    "label":_("Age"),
		    "fieldtype": "Data",
			"width":100
		},
		{
			"fieldname":"total_amount",
			"label":_("Total Amount"),
			"fieldtype":"Data",
			"width":150
		},
		{
			"fieldname":"paid_amount",
			"label":_("Paid Amount"),
			"fieldtype":"Data",
			"width":150
		},
		{
			"fieldname":"tds",
			"label":_("TDS"),
			"fieldtype":"Data",
			"width":150
		},
		{
			"fieldname":"outstanding_amount",
			"label":_("Outstanding Amount"),
			"fieldtype":"Data",
			"width":150
		},
		
		{
			"fieldname":"sales_person",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		}
		
	]
	return columns


def get_data(filters):
	return frappe.db.sql(
		"""
		SELECT
			tsi.name,
			tsi.customer ,
			tsi.status ,
			tsi.posting_date ,
			tps.due_date,
			DATEDIFF(now() , tsi.posting_date) AS age,
			(CASE when tsi.disable_rounded_total != 1 then tsi.rounded_total
			else tsi.grand_total END )as total_amount,
			(case when tsi.disable_rounded_total != 1 and tje.total_credit >0 then tsi.rounded_total  - tsi.outstanding_amount - tje.total_credit
			when tsi.disable_rounded_total != 1 then tsi.rounded_total  - tsi.outstanding_amount
			when tsi.disable_rounded_total != 0 and tje.total_credit >0 then tsi.grand_total  - tsi.outstanding_amount - tje.total_credit 
			else tsi.grand_total- tsi.outstanding_amount End) as paid_amount ,
			(CASE when tje.total_credit > 0  then tje.total_credit 
			else 0
			End)as tds,
			tsi.outstanding_amount ,
			tst.sales_person 
		FROM
			`tabPayment Schedule` tps 
			{join}
		WHERE
		    tps.parenttype = "Sales Invoice" and
			tsi.company = %(company)s and
			tsi.is_return !=1 and tsi.status = "Overdue"
			{conditions}
		
		ORDER BY
			tsi.creation asc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)


def get_conditions(filters):
	conditions = []

	if filters.get("sales_invoice"):
		conditions.append(" and tsi.name=%(sales_invoice)s")

	
	if filters.get("customer"):
		conditions.append(" and tsi.customer in %(customer)s")

	if filters.get("sales_person"):
		conditions.append(" and tst.sales_person in %(sales_person)s")	
	

	return " ".join(conditions) if conditions else ""


def get_join(filters):
	join = """left join `tabSales Invoice` tsi on tps.parent  = tsi.name 
           left join `tabSales Team` tst on tst.parent = tsi.name 
           left JOIN `tabJournal Entry Account` tjea on tjea.reference_type = 'Sales invoice' and tjea.reference_name =tsi.name
           left JOIN `tabJournal Entry` tje on tje.name = tjea.parent  """

	# if filters.get("lost_reason"):
	# 	join = """JOIN `tabOpportunity Lost Reason Detail`
	# 		ON `tabOpportunity Lost Reason Detail`.parenttype = 'Opportunity' and
	# 		`tabOpportunity Lost Reason Detail`.parent = `tabOpportunity`.name and
	# 		`tabOpportunity Lost Reason Detail`.lost_reason = '{0}'
	# 		""".format(
	# 		filters.get("lost_reason")
	# 	)

	return join

