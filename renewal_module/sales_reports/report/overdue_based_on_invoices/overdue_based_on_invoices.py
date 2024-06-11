# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _


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
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	return frappe.db.sql(
		"""
		SELECT
			tsi.name,
			tsi.customer ,
			tsi.status ,
			tsi.posting_date ,
			tsi.due_date,
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
			`tabSales Invoice` tsi 
			{join}
		WHERE
		    tsi.company = %(company)s 
			AND DATE(tsi.posting_date) BETWEEN %(from_date)s AND %(to_date)s and
			tsi.is_return !=1 and tsi.status not in ("Paid","Credit Note Issued","Draft","Cancelled")
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
	join = """left join `tabSales Team` tst on tst.parent = tsi.name 
           left JOIN `tabJournal Entry Account` tjea on tjea.reference_type = 'Sales invoice' and tjea.reference_name =tsi.name
           left JOIN `tabJournal Entry` tje on tje.name = tjea.parent  """

	

	return join

def get_report_summary(filters,columns, currency, data):
	total, outstanding = 0.0, 0.0
	

	for period in data:
		
		total += period.total_amount
		outstanding += period.outstanding_amount

	# if len(data) >= 1 :
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(total)))
	
	total_label = _("Total Amount")
	outstanding_amount_label = _("Outstanding")
	

	return [
		{"value": total, "label": total_label, "datatype": "Currency", "currency": currency},
		{"type": "separator", "value": "-"},
		{"value":outstanding, "label": outstanding_amount_label, "datatype": "Currency", "currency": currency},
		
		
	]


def get_chart_data(filters, columns, data):
	total,outstanding = 0.0, 0.0
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	# labels = ["prospecting" , "proposal_price_quote", "negotiation_review" , "closed_lost", "closed_won", "dead"]	
	labels = ["Sales Stage"]

	for p in data:
		# frappe.msgprint(p)
		total += p.total_amount	
		outstanding += p.outstanding_amount		
		

	datasets = [{"name":"total","values":[0.0]},
	{"name":"Outstanding", "values":[0.0]}
	]
	
	datasets[0]["values"] = [total]
	datasets[1]["values"] = [outstanding]

	
	
	
	return {
        'title':"Outstanding",
        'data':{
            'labels':labels,
            'datasets':datasets
        },
        'type':'bar',
        'height':300,
		'fieldtype':'Currency',
		'colors':["#FBC543", "#9C2162", "#82C272", "#D03454"],
    }



