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
			tsi.is_return !=1
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

# def get_report_summary(filters,columns, currency, data):
# 	total, closed_lost, closed_won = 0.0, 0.0, 0.0
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(total)))


# 	# from consolidated financial statement
# 	# if filters.get("accumulated_in_group_company"):
# 	# 	period_list = get_data(filters, period_list)

# 	for period in data:
		
# 		if period.sales_stage:
# 			total += period.amount
# 		if period.sales_stage == "Closed Lost":
# 			closed_lost += period.amount
# 		if period.sales_stage == "Closed Won":
# 			closed_won += period.amount

# 	# if len(data) >= 1 :
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(total)))
	
# 	total_label = _("Total")
# 	closed_lost_label = _("Closed Lost")
# 	closed_won_label = _("Closed Won")
# 	# else:
# 	# 	profit_label = _("Net Profit")
# 	# 	income_label = _("Total Income")
# 	# 	expense_label = _("Total Expense")

# 	return [
# 		{"value": total, "label": total_label, "datatype": "Currency", "currency": currency},
# 		{"type": "separator", "value": "-"},
# 		{"value":closed_lost, "label": closed_lost_label, "datatype": "Currency", "currency": currency},
# 		{"type": "separator", "value": "=", "color": "blue"},
# 		{
# 			"value": closed_won,
# 			"indicator": "Green",
# 			"label": closed_won_label,
# 			"datatype": "Currency",
# 			"currency": currency,
# 		},
# 	]


# def get_chart_data(filters, columns, data):
# 	prospecting , proposal_price_quote, negotiation_review , closed_lost, closed_won, dead = 0.0, 0.0, 0.0, 0.0, 0.0,0.0
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
# 	# labels = ["prospecting" , "proposal_price_quote", "negotiation_review" , "closed_lost", "closed_won", "dead"]	
# 	labels = ["Sales Stage"]

# 	for p in data:
# 		# frappe.msgprint(p)
# 		if p.sales_stage == "Prospecting":
# 			prospecting += p.amount
# 		if p.sales_stage == "Proposal/Price Quote":
# 			proposal_price_quote += p.amount
# 		if p.sales_stage == "Negotiation/Review":
# 			negotiation_review += p.amount
# 		if p.sales_stage == "Closed Lost":
# 			closed_lost += p.amount
# 		if p.sales_stage == "Closed Won":
# 			closed_won += p.amount	
# 		if p.sales_stage == "Dead":
# 			dead += p.amount			
		

# 	datasets = [{"name":"Prospecting","values":[0.0]},
# 	{"name":"Proposal/Price Quote", "values":[0.0]},{"name":"Negotiation/Review","values":[0.0]},
# 	{"name":"Closed Lost","values":[0.0]},{"name":"Closed Won","values":[0.0]},{"name":"Dead", "values":[0.0]}
# 	]
	
# 	if prospecting:
# 		datasets[0]["values"] = [prospecting]
# 	if proposal_price_quote:
# 		datasets[1]["values"] = [proposal_price_quote]
# 	if negotiation_review:
# 		datasets[2]["values"] = [negotiation_review]
# 	if closed_lost:
# 		datasets[3]["values"]= [closed_lost]
# 	if closed_won:
# 		datasets[4]["values"] = [closed_won]
# 	if dead:
# 		datasets[5]["values"] = [dead]

# 	# datasets = []

# 	# if prospecting:
# 	# 	datasets.append({"name": _("Prospecting"), "values": [prospecting]})
# 	# if proposal_price_quote:
# 	# 	datasets.append({"name": _("Proposal/Price Quote"), "values": [proposal_price_quote] })
# 	# if negotiation_review:
# 	# 	datasets.append({"name": _("Negotiation/Review"), "values": [negotiation_review]})
# 	# if closed_lost:
# 	# 	datasets.append({"name": _("Closed Lost"), "values": [closed_lost]})
# 	# if closed_won:
# 	# 	datasets.append({"name": _("Closed Won"), "values": [closed_won]})
# 	# if dead:
# 	# 	datasets.append({"name": _("Dead"), "values": [dead]})		

	
# 	# if not filters.accumulated_values:
# 	# 	chart["type"] = "bar"
# 	# else:
# 	# 	chart["type"] = "bar"
# 	# 'colors':["#FBC543","#0087AC", "#00A88F", "#9C2162", "#82C272", "#D03454"],

# 	# chart["fieldtype"] = "Currency"
	
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(datasets)))

# 	return {
#         'title':"Script Chart Tutorial : Days since the user's database record was created",
#         'data':{
#             'labels':labels,
#             'datasets':datasets
#         },
#         'type':'bar',
#         'height':300,
# 		'fieldtype':'Currency',
# 		'colors':["#FBC543","#0087AC", "#00A88F", "#9C2162", "#82C272", "#D03454"],
#     }



