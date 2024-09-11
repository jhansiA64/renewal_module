# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from datetime import datetime
from frappe.utils import flt
# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta


def execute(filters=None):
	columns, data = get_columns(filters), get_data(filters)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	# report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

	chart = get_chart_data(filters, columns, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))
	
	
	return columns, data, None, chart

def get_columns(filters):
	date_range = get_timespan_date_range(filters.get("timespan")) 
	date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").strftime("%d-%m-%Y")
	date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").strftime("%d-%m-%Y")
	columns = [
		{
			"label":_("Renewal({d1} to {d2})").format(d1=date1, d2=date2),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Renewal List",
			"width": 170,
		},
		
		{
			"label": _("Customer"),
			"fieldname": "customer_name",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 160,
		},
           {
			"label": _("Item Code"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 130,
		},      
		{
			"fieldname":"total_quantity",
		    "label":_("Qty"),
		    "fieldtype": "Float",
		    
			"width":100
		},
		
		{
			"fieldname":"total_amount",
		    "label":_("Amount"),
		    "fieldtype": "Currency",
			"width":200
		},
		{
			"fieldname":"end_date",
			"label":_("End Date"),
			"fieldtype":"Date",
			"width":150
		},
		
		{
			"fieldname":"sales_user",
		    "label":_("Sales Person"),
		    "fieldtype": "Data",
			"width":250
		},
		{
			"label": _("Brand"),
			"fieldname": "brand",
			"fieldtype": "Link",
			"options": "Brand",
			"hidden":1,
			"width": 130,
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
			`tabRenewal Item`.brand,
			`tabRenewal List`.total_quantity,
			`tabRenewal List`.total_amount,
			`tabRenewal List`.invoice_no,
			`tabRenewal List`.end_date,
			`tabRenewal List`.sales_user
            
		FROM
			`tabRenewal List`
			{join}
		WHERE
			`tabRenewal List`.company = %(company)s	
			{conditions}
		
		ORDER BY
			`tabRenewal List`.creation asc  """.format(
			conditions=get_conditions(filters), join=get_join(filters)
		),
		filters,
		as_dict=1,
	)

def get_conditions(filters):
	conditions = []

	if filters.get("renewal_id"):
		conditions.append(" and `tabRenewal List`.name=%(renewal_id)s")

	if filters.get("timespan") != "custom":
		if filters.get("timespan") == "this year":
			date = frappe.db.get_value("Fiscal Year",["year_start_date"])
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
		date_range = get_timespan_date_range(filters.get("timespan")) 
		date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
		date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date1)))
		conditions.append(f" and DATE(`tabRenewal List`.end_date) >= '{date1}' and DATE(`tabRenewal List`.end_date) <= '{date2}'")	
	if filters.get("timespan") == "custom":
		
		conditions.append(" and DATE(`tabRenewal List`.end_date) >= %(from_date)s and DATE(`tabRenewal List`.end_date) <= %(to_date)s")
	

	if filters.get("item_code"):
		conditions.append(" and `tabRenewal Item`.item_code=%(item_code)s")

	if filters.get("item_group"):
		conditions.append(" and `tabRenewal Item`.item_group in %(item_group)s")

	if filters.get("brand"):
		conditions.append(" and `tabRenewal Item`.brand in %(brand)s")		

	if filters.get("party_name"):
		conditions.append(" and `tabRenewal List`.customer_name in %(party_name)s")

	if filters.get("sales_person"):
		conditions.append(" and `tabRenewal List`.sales_user in %(sales_person)s")	

	# if filters.get("opportunity_type"):
	# 	conditions.append(" and `tabRenewal Item`.opportunity_type in %(opportunity_type)s")		

	
	return " ".join(conditions) if conditions else ""

def get_join(filters):
	join = """LEFT JOIN `tabRenewal Item`
			ON 
			`tabRenewal Item`.parent = `tabRenewal List`.name"""

	

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


def get_chart_data(filters,columns, data):
	brand_wise_sales_map = {}
	labels, datapoints_sales = [], []

	for row in data:
		item_key = row.get("sales_stage")

		if not item_key in brand_wise_sales_map:
			brand_wise_sales_map[item_key] = 0.0

		brand_wise_sales_map[item_key] = flt(brand_wise_sales_map[item_key]) + flt(row.get("amount"))

	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(brand_wise_sales_map)))	
	brand_wise_sales_map = {
		item: value
		for item, value in (sorted(brand_wise_sales_map.items(), key=lambda i: i[0]))
	}

	for key in brand_wise_sales_map:
		labels.append(key)
		datapoints_sales.append(brand_wise_sales_map[key])

	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json({"labels":labels,"datasets":[{"values":datapoints_sales}]})))
		

	return {
		"data": {
			"labels": labels,  # show max of 30 items in chart
			"datasets": [{"values": datapoints_sales}],
		},
		"type": "bar",
		"colors":["#c80064","#008000","#9C2162","#D03454","#FFCA3E","#772F67", "#00A88F"],
	}





