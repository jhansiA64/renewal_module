# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate



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
		{
			"label": _("Button"),
			"fieldname": "name1",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("View Button"),
			"fieldname": "name2",
			"fieldtype": "Data",
			"width": 150,
		},
	]
	return columns


def get_data(filters):
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
			`tabOpportunity`.territory,
			`tabOpportunity`.name as name1,
			`tabOpportunity Item`.name as name2
		FROM
			`tabOpportunity Item`
			{join}
		WHERE
			`tabOpportunity`.company = %(company)s
			AND DATE(`tabOpportunity`.expected_closing) BETWEEN %(from_date)s AND %(to_date)s
			{conditions}
		
		ORDER BY
			`tabOpportunity`.creation asc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
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
	
	if filters.get("forecast"):
		conditions.append(" and `tabOpportunity Item`.forecast = %(forecast)s")	

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

# def get_report_summary(filters,columns, currency, data):
# 	new,new_total, renewal, renewal_total = 0,0, 0, 0
	
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(new)))
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))


# 	# from consolidated financial statement
# 	# if filters.get("accumulated_in_group_company"):
# 	# 	period_list = get_data(filters, period_list)

# 	for period in data:
		
# 		if period.sales_stage == "Closed Won" and period.opportunity_type in ["New", "Additional"] :
# 			new += 1
# 		if period.sales_stage  and period.opportunity_type in ["New", "Additional"]:
# 			new_total += 1	
# 		if period.sales_stage == "Closed Won" and period.opportunity_type == "Renewal" :
# 			renewal += 1
# 		if period.sales_stage  and period.opportunity_type =="Renewal":
# 			renewal_total += 1		
		

# 	# if len(data) >= 1 :
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(new_total)))
# 	new_label = ("New")
# 	new_total_label = _("Total")
# 	renewal_label = _("Renewal")
# 	# renewal_total_label = _("Closed Won")
# 	# else:
# 	# 	profit_label = _("Net Profit")
# 	# 	income_label = _("Total Income")
# 	# 	expense_label = _("Total Expense")

# 	return [
# 		{"value": str(new)+ "/" + str(new_total),"indicator": "Green", "label": new_label, "datatype": "Data"},
		
# 		{"value":str(renewal)+ "/" + str(renewal_total),"indicator": "Blue", "label": renewal_label, "datatype": "Data"},
		
# 	]

def get_report_summary(filters,columns, currency, data):
	closed_won, closed_lost, prospect, total = 0.0, 0.0, 0.0, 0.0
	won_count,lost_count, prospect_count, total_count = 0,0,0, 0

	opportunity_seen = set()


	# Dictionary to store seen opportunities and track sales amounts
    # opportunity_seen = set()	

	for period in data:
		# if filters.group_by == "Opportunity":
			
		frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(period)))
		if period.name not in opportunity_seen:
			opportunity_seen.add(period.name)  # Mark this parent Opportunity as processed
			total_count += 1
			total += flt(period.amount)
			if period.sales_stage == "Closed Won":
				won_count += 1
				
			if period.sales_stage == "Closed Lost":
				lost_count += 1
			if period.sales_stage == "Prospect":
				prospect_count += 1

		if period.sales_stage == "Closed Won":
			closed_won += flt(period.amount)
			
		if period.sales_stage == "Closed Lost":
			closed_lost += flt(period.amount)
		if period.sales_stage == "Prospect":
			prospect += flt(period.amount)	
				
		
			
		

	won_label = ("Closed Won")
	lost_label = _("Closed Lost")
	prospect_label = _("Open")

	won_count_label = _("Closed Won") + " (" + str(won_count) + ")"
	lost_count_label = _("Closed Lost") + " (" + str(lost_count) + ")"
	prospect_count_label = _("Open") + " (" + str(prospect_count) + ")"
	total_label = _("Total Opportunities") + " (" + str(total_count) + ")"
	

	return [
		{"value": round(total,2), "indicator": "Blue", "label": total_label, "datatype": "Currency"},
		{"value": round(closed_won, 2), "indicator": "Green", "label": won_count_label, "datatype": "Currency"},
        {"value": round(closed_lost, 2), "indicator": "Red", "label": lost_count_label, "datatype": "Currency"},
        {"value": round(prospect, 2), "indicator": "Yellow", "label": prospect_count_label, "datatype": "Currency"},
        
		
	]



def get_chart_data(filters, columns, data):
	prospecting , proposal_price_quote, negotiation_review , closed_lost, closed_won, dead = 0.0, 0.0, 0.0, 0.0, 0.0,0.0
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	# labels = ["prospecting" , "proposal_price_quote", "negotiation_review" , "closed_lost", "closed_won", "dead"]	
	labels = ["Sales Stage"]

	for p in data:
		# frappe.msgprint(p)
		if p.sales_stage == "Prospecting":
			prospecting += p.amount
		if p.sales_stage == "Proposal/Price Quote":
			proposal_price_quote += p.amount
		if p.sales_stage == "Negotiation/Review":
			negotiation_review += p.amount
		if p.sales_stage == "Closed Lost":
			closed_lost += p.amount
		if p.sales_stage == "Closed Won":
			closed_won += p.amount	
		if p.sales_stage == "Dead":
			dead += p.amount			
		

	datasets = [{"name":"Prospecting","values":[0.0]},
	{"name":"Proposal/Price Quote", "values":[0.0]},{"name":"Negotiation/Review","values":[0.0]},
	{"name":"Closed Lost","values":[0.0]},{"name":"Closed Won","values":[0.0]},{"name":"Dead", "values":[0.0]}
	]
	
	if prospecting:
		datasets[0]["values"] = [prospecting]
	if proposal_price_quote:
		datasets[1]["values"] = [proposal_price_quote]
	if negotiation_review:
		datasets[2]["values"] = [negotiation_review]
	if closed_lost:
		datasets[3]["values"]= [closed_lost]
	if closed_won:
		datasets[4]["values"] = [closed_won]
	if dead:
		datasets[5]["values"] = [dead]

	# datasets = []

	# if prospecting:
	# 	datasets.append({"name": _("Prospecting"), "values": [prospecting]})
	# if proposal_price_quote:
	# 	datasets.append({"name": _("Proposal/Price Quote"), "values": [proposal_price_quote] })
	# if negotiation_review:
	# 	datasets.append({"name": _("Negotiation/Review"), "values": [negotiation_review]})
	# if closed_lost:
	# 	datasets.append({"name": _("Closed Lost"), "values": [closed_lost]})
	# if closed_won:
	# 	datasets.append({"name": _("Closed Won"), "values": [closed_won]})
	# if dead:
	# 	datasets.append({"name": _("Dead"), "values": [dead]})		

	
	# if not filters.accumulated_values:
	# 	chart["type"] = "bar"
	
	# else:
	# 	chart["type"] = "bar"
	# 'colors':["#FBC543","#0087AC", "#00A88F", "#9C2162", "#82C272", "#D03454"],

	# chart["fieldtype"] = "Currency"
	
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(datasets)))

	

	return {
        'title':"Chart Based On Sales Stage",
        'data':{
            'labels':labels,
            'datasets':datasets
        },
        'type':'bar',
        'height':300,
		'fieldtype':'Currency',
		'colors':["#FBC543","#0087AC", "#00A88F", "#9C2162", "#82C272", "#D03454"],
    }





