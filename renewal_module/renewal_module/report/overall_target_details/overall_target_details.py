# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _
from datetime import datetime
from dateutil import relativedelta
from renewal_module.renewal_module.report.sales_based_on_timespan.sales_based_on_timespan import (
	get_data,
)
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from erpnext.accounts.utils import get_fiscal_year


def execute(filters=None):
	data = []
	session_user = frappe.session.user
	sales_data = get_data(filters)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_data)))
	
	columns, rows = get_columns(filters), get_target_data(filters, sales_data)
	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(rows)))

	if not rows:
		return columns, data


	for key, value in rows.items():
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(key)))
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(value)))
		value.update({"sales_person": key})

		data.append(value)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
    )
	chart = get_chart_data(filters, columns, data)

	return columns, data, None, chart

def get_columns(filters):
	date_range = get_timespan_date_range(filters.get("timespan")) 
	date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").strftime("%d-%m-%Y")
	date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").strftime("%d-%m-%Y")
	columns = [
		{
			"fieldname":"sales_person",
			"label":_("Sales Person"),
			"label":_("Sales Person({d1} to {d2})").format(d1=date1, d2=date2),
			"fieldtype":"Link",
			"options":"Sales Person",
			"width":280
		},
		
		
        
        {
			"fieldname":"bottomline_target",
		    "label":_("Bottomline Target"),
		    "fieldtype": "Data",	    
			"width":250
		},
		
		{
			"fieldname":"topline_achieved",
		    "label":_("Topline Achieved"),
		    "fieldtype": "Float",		    
			"width":200
		},
		
		
		{
			"fieldname":"achieved_value",
		    "label":_("Achieved Value"),
		    "fieldtype": "Float",
			"width":200
		},
		
		
		{
			"fieldname":"shortfall",
		    "label":_("Shortfall"),
		    "fieldtype": "Float",
			"width":200
		},

		
		
		
	]
	
	return columns

def get_target_data(filters, sales_data):
	
    sales_users_data = get_parents_data(filters, "Sales Person")
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_users_data)))
    if not sales_users_data:
	    return
    sales_users = []
    sales_user_wise_item_groups = {}
    sales_user_wise_brand = {}

    for d in sales_users_data:
        if d.parent not in sales_users:
            sales_users.append(d.parent)

        	

    date_field = "transaction_date"

    # actual_data = get_actual_data(filters, sales_users, date_field, sales_field)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_user_wise_item_groups)))
    return prepare_data(
        filters,
        sales_users_data,
        sales_data,
        date_field,
        "Sales Person"
    )           
    

def prepare_data(filters,sales_users_data,sales_data,date_field,sales_field,
):
    rows = {}

    # target_qty_amt_field = "target_qty" if filters.get("target_on") == "Quantity" else "target_amount"

    # qty_or_amount_field = "qty" if filters.get("target_on") == "Quantity" else "amount"

    fiscal_year = get_fiscal_year(fiscal_year=filters.get("fiscal_year"), as_dict=1)
    dates = [fiscal_year.year_start_date, fiscal_year.year_end_date]
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json("hello")))
    time_span = 0
    if filters.get("timespan") in ("last month","this month","next month"):
	    time_span = 1
    if	filters.get("timespan") in ("last quarter","this quarter","next quarter"):
	    time_span = 3
    if filters.get("timespan") in ("last 6 months","next 6 months"):
	    time_span = 6
    if filters.get("timespan") in ("this year"):
	    time_span = 12		
    if filters.get("timespan") in ("last week","this week","next week"):
       time_span = 1/4
    for d in sales_users_data:	
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_user_wise_item_groups.get(d.parent))))
	    key = (d.parent)

	    if key not in rows:
		    rows.setdefault(key, {"bottomline_target":0 ,"topline_achieved":0, "achieved_value":0 ,"shortfall":0})

	    details = rows[key]
	    if d.custom_target_type == "Bottomline":
		    details["bottomline_target"]= round((d.get("target_amount") * time_span) / 12,2)
	    details["shortfall"] = 0
		# details["total_target"] += details[target_key]
	

	    for r in sales_data:
		    if (
			    r.sales_person == d.parent
			):
			    if d.target_uom == "Qty":
				    details["achieved_value"] += r.get("sales_qty", 0)
			    else:
				    details["achieved_value"] += r.get("profit", 0)
				    details["topline_achieved"] += r.get("sales_amount", 0)
			    details["shortfall"] = details.get("achieved_value") - details.get("bottomline_target")
			    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_user_wise_item_groups.get(d.parent))))
		    # elif (
			#     r.sales_person == d.parent
			#     and (not sales_user_wise_item_groups.get(d.parent) )
			# ):
			#     if d.target_uom == "Qty":
			# 	    details["achieved_value"] += r.get("sales_qty", 0)
			#     else:
			# 	    details["achieved_value"] += r.get("profit", 0)
            #                         #details["topline_achieved"] += r.get("sales_amount",0)
			#     details["shortfall"] = details.get("achieved_value") - details.get("bottomline_target")
			#     # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))
		    elif (
			    r.sales_person == d.parent
			):
			    if d.target_uom == "Qty":
				    details["achieved_value"] += r.get("sales_qty", 0)
			    else:
				    details["achieved_value"] += r.get("profit", 0)
                                    #details["topline_achieved"] += r.get("sales_amount", 0)
			    details["shortfall"] = details.get("achieved_value") - details.get("bottomline_target")
			

	    details["shortfall"] = round((details.get("achieved_value") - details.get("bottomline_target")),2)

    return rows


def get_parents_data(filters, partner_doctype):
    filters_dict = {"parenttype": partner_doctype}

    # target_qty_amt_field = "target_qty" if filters.get("target_on") == "Quantity" else "target_amount"

    if filters.get("fiscal_year"):
        filters_dict["fiscal_year"] = filters.get("fiscal_year")
    if filters.get("sales_person"):
	    filters_dict["parent"] = filters.get("sales_person")[0]
    # if filters.get("sales_person") :
	#     if 'COF Approval' in frappe.get_roles(frappe.session.user) and 'System Manager' not in frappe.get_roles(frappe.session.user):
	#     	filters_dict["parent"] = filters.get("sales_person")[0]				
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters_dict)))  		

    return frappe.get_all(
        "Target Detail",
        filters=filters_dict,
        fields=["parent", "custom_target_type","target_amount", "fiscal_year", "distribution_id"],
    )


def get_chart_data(filters, columns, data):
    date_range = get_timespan_date_range(filters.get("timespan")) 
    date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").strftime("%d-%m-%Y")
    date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").strftime("%d-%m-%Y")
    bottomline_target , achieved_value, shortfall = 0.0, 0.0, 0.0
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	# labels = ["prospecting" , "proposal_price_quote", "negotiation_review" , "closed_lost", "closed_won", "dead"]	
    labels = [f"Target ({date1} to {date2})"]

    for p in data:
	    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(p)))
	    bottomline_target += p["bottomline_target"]
	    achieved_value += p["achieved_value"]
	    shortfall += p["shortfall"]
		# if p.sales_stage == "Prospecting":
		# 	prospecting += p.amount
				
		

    datasets = [{"name":"Target","values":[0.0]},
    {"name":"Achieved", "values":[0.0]},
    {"name":"Shortfall","values":[0.0]}
    ]
	
	# if prospecting:
	# 	datasets[0]["values"] = [prospecting]
	
    datasets[0]["values"] = [bottomline_target]
    datasets[1]["values"] = [round(achieved_value,2)]
    datasets[2]["values"] = [round(shortfall,2)]
		

    return {
        'title':"Chart Based On Target",
        'data':{
            'labels':labels,
            'datasets':datasets
        },
        'type':'bar',
        'height':300,
		'width':1000,
		'fieldtype':'Currency',
		'colors':["#FBC543", "#82C272", "#9C2162"],
    }


