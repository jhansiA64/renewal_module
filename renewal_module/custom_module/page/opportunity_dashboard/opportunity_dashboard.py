from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_report.opportunity_report import get_data_when_grouped_by_opportunity, get_columns, GrossProfitGenerator, group_wise_columns



def validate_filters(sales_person):
	# if from_date and to_date and (from_date >= to_date):
	# 	frappe.throw(_("To Date must be greater than From Date"))

	if not sales_person:
		frappe.throw(_("Please Select a Sales Person"))

@frappe.whitelist()
def get_funnel_data(sales_person):
	validate_filters(sales_person)
	filters_data = {
		"brand": [],
		"company":[],
		"item_group": [],
		"opportunity_type": [],
		"party_name": [],
		"sales_person": sales_person,
		"sales_stage": [],
		"timespam": "Last Week"
		}
	columns = get_columns(group_wise_columns, filters)
	data = []
	get_data_when_grouped_by_opportunity(columns, gross_profit_data, filters, group_wise_columns, data)
	chart = get_chart_data(filters_data, columns, data)

	
	
	chart_data = []
	colors = ["#FBC543","#0087AC","#00A88F","#9C2162","#82C272","#D03454"]
	num = 0

	for each in chart["data"][ "datasets"]:
		chart_data.append({"title": each["name"], "value": each["values"][0], "color": colors[num]})
		num += 1


	# return [
	# 	{"title": _("Active Leads"), "value": active_leads, "color": "#B03B46"},
	# 	{"title": _("Opportunities"), "value": opportunities, "color": "#F09C00"},
	# 	{"title": _("Quotations"), "value": quotations, "color": "#006685"},
	# 	{"title": _("Converted"), "value": converted, "color": "#00AD65"},
	# ]
	return chart_data


@frappe.whitelist()
def get_opp_data(sales_person):
    frappe.msgprint("hello world")
    validate_filters(sales_person)
    filters_data = {
		"brand": [],
		"company":[],
		"item_group": [],
		"opportunity_type": [],
		"party_name": [],
        "timespam":"Last Week",
		"sales_person": sales_person,
		"sales_stage": ["Closed Won"],
		}
    gross_profit_data = GrossProfitGenerator(filters_data)	
    columns = get_columns(group_wise_columns, filters)
	# data = []
    data = get_data_when_grouped_by_opportunity(columns, gross_profit_data, filters, group_wise_columns, [])
    chart = get_chart_data(filters_data, columns, data)

	

    if opportunities:
	    default_currency = frappe.get_cached_value("Global Defaults", "None", "default_currency")
	    summary = {}
	    cp_opportunities = [
			dict(
				x,
				**{
					"compound_amount": (
						convert(x["salling_amount"], x["currency"], default_currency)
						* x["probability"]
						/ 100

					)
				},
			)
			for x in data
		]
        # cp_opportunities = [
		# 	dict(
		# 		x,
		# 		**{
		# 			"compound_amount": (
		# 				convert(x["salling_amount"], x["currency"], default_currency)
		# 				* x["probability"]
		# 				/ 100
		# 			)
		# 		},
		# 	)
		# 	for x in data
		# ]


	     
        # summary = {}
	    for sales_stage, rows in groupby(cp_opportunities, lambda o: o["item_group"]):
	    	summary[item_group] = sum(flt(r["compound_amount"]) for r in rows)

	    result = {
			"labels": list(summary.keys()),
			"datasets": [{"name": _("Total Amount"), "values": list(summary.values()), "chartType": "bar"}],
		}
	    return result

    else:
	    return "empty"    
