# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

from collections import OrderedDict

import frappe
from frappe import _, qb, scrub
from frappe.query_builder import Order
from frappe.utils import cint, flt, formatdate
from datetime import datetime
from renewal_module.renewal_module.report.sales_report_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta

from erpnext.controllers.queries import get_match_cond
from erpnext.stock.report.stock_ledger.stock_ledger import get_item_group_condition
from erpnext.stock.utils import get_incoming_rate


def execute(filters=None):
	if not filters:
		filters = frappe._dict()
	filters.currency = frappe.get_cached_value("Company", filters.company, "default_currency")

	gross_profit_data = GrossProfitGenerator(filters)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(gross_profit_data.rl_list)))

	data = []

	group_wise_columns = frappe._dict(
		{
			"renewals": [
				"renewals_or_item",
				"customer_name",
				"status",
				"renewal_type",
				"start_date",
				"end_date",
				"start_date",
				"end_date",
				"item_code",
				"item_name",
				"item_group",
				"brand",
				"description",
				"qty",
				"rate",
				"base_amount",
				"purchase_rate",
				"purchase_amount",
				"margin",
				"orc",
				"gross_profit",
				"sales_person",
				"note",
				"view_button",
				
			],
			
		
		}
	)

	columns = get_columns(group_wise_columns, filters)

	if filters.group_by == "Renewals":
		get_data_when_grouped_by_invoice(columns, gross_profit_data, filters, group_wise_columns, data)

	else:
		get_data_when_not_grouped_by_invoice(gross_profit_data, filters, group_wise_columns, data)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)
	report_summary = get_report_summary(filters,columns, currency, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

	chart = get_chart_data(filters, columns, data)	

	return columns, data,None, chart, report_summary


def get_data_when_grouped_by_invoice(
	columns, gross_profit_data, filters, group_wise_columns, data
):
	column_names = get_column_names()

	# to display item as Item Code: Item Name
	columns[0] = "Renewal List:Link/Renewal Item:300"
	# removing Item Code and Item Name columns
	del columns[4:6]
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(gross_profit_data)))

	for src in gross_profit_data.rl_list:
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(src)))
		row = frappe._dict()
		row.indent = src.indent
		row.parent_renewal = src.parent_renewal
		row.currency = filters.currency

		for col in group_wise_columns.get(scrub(filters.group_by)):
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(col)))
			row[column_names[col]] = src.get(col)

		data.append(row)





def get_columns(group_wise_columns, filters):
	columns = []
	column_map = frappe._dict(
		{
			"parent": {
				"label": _("Renewal List"),
				"fieldname": "parent_renewal",
				"fieldtype": "Link",
				"options": "Renewal List",
				"width": 120,
			},
			"renewals_or_item": {
				"label": _("Renewal List"),
				"fieldtype": "Link",
				"options": "Renewal List",
				"width": 120,
			},
			"status": {
				"label": _("Status"),
				"fieldname": "status",
				"fieldtype": "Data",
				"width": 100,
			},
			"renewal_type": {
				"label": _("Renewal Type"),
				"fieldname": "new_add",
				"fieldtype": "Data",
				"width": 100,
			},
			
			"start_date": {
				"label": _("Start Date"),
				"fieldname": "start_date",
				"fieldtype": "Date",
				"width": 100,
			},
			"end_date": {
				"label": _("End Date"),
				"fieldname": "end_date",
				"fieldtype": "Date",
				"width": 100,
			},
			
			"item_code": {
				"label": _("Item Code"),
				"fieldname": "item_code",
				"fieldtype": "Link",
				"options": "Item",
				"width": 100,
			},
			"item_name": {
				"label": _("Item Name"),
				"fieldname": "item_name",
				"fieldtype": "Data",
				"width": 100,
			},
			"item_group": {
				"label": _("Item Group"),
				"fieldname": "item_group",
				"fieldtype": "Link",
				"options": "Item Group",
				"width": 100,
			},
			"brand": {"label": _("Brand"), "fieldtype": "Link", "options": "Brand", "width": 100},
			"description": {
				"label": _("Description"),
				"fieldname": "description",
				"fieldtype": "Data",
				"width": 100,
			},
			"warehouse": {
				"label": _("Warehouse"),
				"fieldname": "warehouse",
				"fieldtype": "Link",
				"options": "Warehouse",
				"width": 100,
			},
			"note":{
				"fieldname":"note",
				"label":_("Note"),
				"fieldtype":"Small Text",
				"width":150
			},
			"view_button":{
				"label": _("View Button"),
				"fieldname": "view_button",
				"fieldtype": "Data",
				"width": 150,
			},
			"qty": {"label": _("Qty"), "fieldname": "qty", "fieldtype": "Float", "width": 80},
			"rate": {
				"label": _("Rate"),
				"fieldname": "rate",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"base_amount": {
				"label": _("Selling Amount"),
				"fieldname": "selling_amount",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"purchase_rate": {
				"label": _("Purchase Rate"),
				"fieldname": "purchase_rate",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"purchase_amount": {
				"label": _("Purchase Amount"),
				"fieldname": "purchase_amount",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			
			"project": {
				"label": _("Project"),
				"fieldname": "project",
				"fieldtype": "Link",
				"options": "Project",
				"width": 100,
			},
			"sales_person": {
				"label": _("Sales Person"),
				"fieldname": "sales_person",
				"fieldtype": "Link",
				"options": "Sales Person",
				"width": 100,
			},
			"allocated_amount": {
				"label": _("Allocated Amount"),
				"fieldname": "allocated_amount",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"margin": {
				"label": _("Margin"),
				"fieldname": "margin",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"orc": {
				"label": _("ORC"),
				"fieldname": "orc",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"gross_profit": {
				"label": _("Profit"),
				"fieldname": "gross_profit",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"customer_name": {
				"label": _("Customer"),
				"fieldname": "customer_name",
				"fieldtype": "Link",
				"options": "Customer",
				"width": 100,
			},
			
		}
	)

	for col in group_wise_columns.get(scrub(filters.group_by)):
		columns.append(column_map.get(col))

	columns.append(
		{
			"fieldname": "currency",
			"label": _("Currency"),
			"fieldtype": "Link",
			"options": "Currency",
			"hidden": 1,
		}
	)

	return columns


def get_column_names():
	return frappe._dict(
		{
			"renewals_or_item": "renewal_list",
			"customer_name": "customer_name",
			"status":"status",
			"start_date":"start_date",
			"renewal_type":"new_add",
			"end_date": "end_date",
			"item_code": "item_code",
			"item_name": "item_name",
			"item_group": "item_group",
			"brand": "brand",
			"description": "description",
			"qty": "qty",
			"rate": "rate",			
			"base_amount": "selling_amount",
			"purchase_rate":"purchase_rate",
			"purchase_amount":"purchase_amount",
			"margin":"margin",
			"orc":"orc",
			"gross_profit": "gross_profit",
			"project": "project",
			"note":"note",
			"view_button":"view_button",
			"sales_person":"sales_person",
			"start_date":"start_date",
			"end_date":"end_date",
			
		}
	)


class GrossProfitGenerator(object):
	def __init__(self, filters=None):
		self.sle = {}
		self.data = []
		self.average_buying_rate = {}
		self.filters = frappe._dict(filters)
		self.load_invoice_items()
		# self.get_delivery_notes()

		if filters.group_by == "Renewals":
			self.group_items_by_renewal()

		# self.load_product_bundle()
		# self.load_non_stock_items()
		self.get_returned_renewal_items()
		self.process()

	def process(self):
		self.grouped = {}
		self.grouped_data = []

		self.currency_precision = cint(frappe.db.get_default("currency_precision")) or 3
		self.float_precision = cint(frappe.db.get_default("float_precision")) or 2

		grouped_by_renewals = True if self.filters.get("group_by") == "Renewals" else False

		if grouped_by_renewals:
			renewal_type = "New"
			purchase_amount = 0
			orc =0

		for row in reversed(self.rl_list):
			

			if self.skip_row(row):
				continue

			row.base_amount = flt(row.amount, self.currency_precision)

			product_bundles = []

			if grouped_by_renewals:
				
				if row.indent == 1.0 and row.idx == 1:
					# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
					renewal_type = row.renewal_type
				if row.indent == 1.0:
					purchase_amount += flt(row.purchase_amount)	

				elif row.indent == 0.0:
					# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(bottomline_achieved)))
					row.renewal_type = renewal_type
					row.purchase_amount = purchase_amount
					renewal_type = "New"
					purchase_amount = 0

		    # calculate gross profit
			row.gross_profit = flt((flt(row.margin)- flt(row.orc)), self.currency_precision)
			if row.base_amount:
				row.gross_profit_percent = flt(
					(row.gross_profit / row.base_amount) * 100.0, self.currency_precision
				)
			else:
				row.gross_profit_percent = 0.0		
					
			
			self.grouped.setdefault(row.get(scrub(self.filters.group_by)), []).append(row)

	
	def get_returned_renewal_items(self):
		returned_renewals = frappe.db.sql(
			"""
			select
				rl.name, rl_item.item_code, rl_item.qty as qty,rl_item.rate as rate, rl_item.amount as base_amount
			from
				`tabRenewal List` rl, `tabRenewal Item` rl_item
			where
				rl.name = rl_item.parent
		""",
			as_dict=1,
		)

		self.returned_renewals = frappe._dict()
		for inv in returned_renewals:
			self.returned_renewals.setdefault(inv.return_against, frappe._dict()).setdefault(
				inv.item_code, []
			).append(inv)

	def skip_row(self, row):
		if self.filters.get("group_by") != "Renewals":
			if not row.get(scrub(self.filters.get("group_by", ""))):
				return True

		return False

	

	def load_invoice_items(self):
		conditions = ""
		if self.filters.get("company"):
			conditions += " `tabRenewal List`.company = %(company)s"
		
		if self.filters.timespan != "custom":
			date_range = get_timespan_date_range(self.filters.timespan) 
			date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
			date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
			if self.filters.based_on == "Creation":
				# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
				# conditions += " and  `tabRenewal List`.status = ('Active')"
				conditions += f" and `tabRenewal List`.creation >= '{date1}' and `tabRenewal List`.creation <= '{date2}'"
			else:
				# conditions += " and `tabRenewal List`.status in ('Active','New Opp')"
				conditions += f" and `tabRenewal List`.end_date >= '{date1}' and `tabRenewal List`.end_date <= '{date2}'"	
		if self.filters.timespan == "custom":
			if self.filters.based_on == "Creation":
				# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
				# conditions += " and `tabRenewal List`.status = ('Active')"
				conditions += " and `tabRenewal List`.creation >= %(from_date)s and `tabRenewal List`.creation <= %(to_date)s"
			else:
				# conditions += " and `tabRenewal List`.status in ('Active','New Opp')"
				conditions += " and `tabRenewal List`.end_date >= %(from_date)s and `tabRenewal List`.end_date <= %(to_date)s"	
				

		# conditions += " and (is_return = 0 or (is_return=1 and return_against is null))"

		if self.filters.item_group:
			conditions += " and {0}".format(get_item_group_condition(self.filters.item_group))

		if self.filters.get("sales_person"):
			conditions += "and `tabRenewal List`.sales_user = %(sales_person)s"

		if self.filters.get("status"):
			conditions += "and `tabRenewal List`.status = %(status)s"

		if self.filters.get("renewal_type"):
			conditions += "and `tabRenewal Item`.new_add = %(renewal_type)s"		
			

		if self.filters.get("renewal_list"):
			conditions += " and `tabRenewal List`.name in %(renewal_list)s"

		if self.filters.get("customer"):
			conditions += " and `tabRenewal List`.customer_name in %(customer)s"	

		if self.filters.get("item_code"):
			conditions += " and `tabSales Invoice Item`.item_code = %(item_code)s"

		
		self.rl_list = frappe.db.sql(
			"""
			select
				`tabRenewal Item`.parent,
				`tabRenewal List`.end_date,
				`tabRenewal List`.status,
				`tabRenewal List`.customer_name,
				`tabRenewal Item`.new_add as "renewal_type",
				`tabRenewal Item`.item_code,`tabRenewal Item`.idx,
				`tabRenewal Item`.item_name, `tabRenewal Item`.description,
				tsii.item_group,
				`tabRenewal Item`.item_brand as brand,
				`tabRenewal Item`.start_date,
				`tabRenewal Item`.invoice_no,
				`tabRenewal List`.note,`tabRenewal List`.name as view_button,
				`tabRenewal Item`.qty as qty,
				`tabRenewal Item`.rate as rate, `tabRenewal Item`.amount,
				`tabRenewal Item`.name as "item_row",
				(CASE when tpii.qty IS NULL  then 0 
				else tpii.qty END )as purchase_qty ,
				(CASE when tpii.rate IS NULL  then 0 
				else tpii.rate END )as purchase_rate,
				(CASE when tpii.amount IS NULL  then 0 
				else tpii.amount END )as purchase_amount,
				tst.sales_person,
				tu.full_name as user,
				`tabRenewal List`.sales_user as "sales_person"
			from
				`tabRenewal Item` inner join `tabRenewal List` on `tabRenewal List`.name = `tabRenewal Item`.parent 
				left JOIN `tabSales Invoice Item` tsii on `tabRenewal Item`.invoice_no  = tsii.parent and tsii.item_code = `tabRenewal Item`.item_code
				and `tabRenewal Item`.rate = tsii.rate and `tabRenewal Item`.description = tsii.description and `tabRenewal Item`.qty = tsii.qty
				LEFT JOIN `tabSales Order Item` tsoi on tsii.so_detail = tsoi.name and tsoi.parent = tsii.sales_order 
				LEFT JOIN `tabPurchase Order Item` tpoi on tpoi.sales_order_item = tsoi.name and tpoi.sales_order = tsoi.parent
				LEFT JOIN `tabPurchase Invoice Item` tpii on tpii.po_detail = tpoi.name and tpii.purchase_order = tpoi.parent
				LEFT JOIN `tabSales Team` tst on tsoi.parent = tst.parent
				LEFT JOIN `tabUser` tu on tst.sales_person = tu.full_name
								
			where
			    
			    {conditions} {match_cond}
			GROUP BY
				`tabRenewal Item`.name
			order by
				`tabRenewal List`.name desc""".format(
				conditions=conditions,
				match_cond=get_match_cond("Renewal List"),
			),
			self.filters,
			as_dict=1,
		)

	

	def group_items_by_renewal(self):
		"""
		Turns list of Sales Invoice Items to a tree of Sales Invoices with their Items as children.
		"""

		grouped = OrderedDict()

		for row in self.rl_list:
			# initialize list with a header row for each new parent
			grouped.setdefault(row.parent, [self.get_renewal_row(row)]).append(
				row.update(
					{"indent": 1.0, "parent_renewal": row.parent, "renewals_or_item": row.item_code}
				)  # descendant rows will have indent: 1.0 or greater
			)

			# if item is a bundle, add it's components as seperate rows
			if frappe.db.exists("Product Bundle", row.item_code):
				bundled_items = self.get_bundle_items(row)
				for x in bundled_items:
					bundle_item = self.get_bundle_item_row(row, x)
					grouped.get(row.parent).append(bundle_item)

		self.rl_list.clear()

		for items in grouped.values():
			self.rl_list.extend(items)

	def get_renewal_row(self, row):
		# header row format
		return frappe._dict(
			{
				"parent_renewal": "",
				"indent": 0.0,
				"renewals_or_item": row.parent,
				"parent": None,
				"start_date":row.start_date,
				"end_date": row.end_date,
				"customer_name": row.customer_name,
				"status":row.status,
				"renewal_type":None,
				"sales_person":row.sales_person,
				"item_code": None,
				"item_name": None,
				"description": None,
				"note":None,
				"item_group": None,
				"brand": None,
				"qty": None,
				"item_row": None,
				"start_date":row.start_date,
				"end_date": row.end_date,
				"amount": frappe.db.get_value("Renewal List", row.parent, "total_amount"),
			}
		)

	def get_bundle_items(self, product_bundle):
		return frappe.get_all(
			"Product Bundle Item", filters={"parent": product_bundle.item_code}, fields=["item_code", "qty"]
		)

	def get_bundle_item_row(self, product_bundle, item):
		item_name, description, item_group, brand = self.get_bundle_item_details(item.item_code)

		return frappe._dict(
			{
				"parent_invoice": product_bundle.item_code,
				"indent": product_bundle.indent + 1,
				"parent": None,
				"renewals_or_item": item.item_code,
				"project": product_bundle.project,
				"start_date":item.start_date,
				"end_date": item.end_date,
				"customer_name": product_bundle.customer_name,
				"renewal_type":item.renewal_type,
				"sales_person":product_bundle.sales_person,
				"customer_group": product_bundle.customer_group,
				"item_code": item.item_code,
				"item_name": item_name,
				"description": description,
				"note":note,
				"view_button":None,
				"warehouse": product_bundle.warehouse,
				"item_group": item_group,
				"brand": item.brand,
				"dn_detail": product_bundle.dn_detail,
				"delivery_note": product_bundle.delivery_note,
				"qty": (flt(product_bundle.qty) * flt(item.qty)),
				"item_row": None,
				"is_return": product_bundle.is_return,
				"cost_center": product_bundle.cost_center,
			}
		)

	def get_bundle_item_details(self, item_code):
		return frappe.db.get_value(
			"Item", item_code, ["item_name", "description", "item_group", "brand"]
		)

	
	


def get_report_summary(filters,columns, currency, data):
	new_amount,renewal_amount, renewed_count ,x_renewal,lost_renewal, total_amount, new_count,renewal_count, total_count= 0.0,0.0,0.0, 0.0,0.0,0.0,0.0,0.0, 0.0
	total_count= 0.0	

	for p in data:
	    if filters.group_by == "Renewals" and filters.based_on == "Creation":
		    if p.indent == 0.0:
			    if p.new_add == "New":
				    new_amount += p.selling_amount
			    if p.new_add == "Renewal":
				    renewal_amount += p.selling_amount
			    if p.new_add == "New" or p.new_add == "Renewal":
				    total_amount += p.selling_amount
	    else:
		    if p.indent == 0.0:
			    if p.status == "New Opp":
				    new_count += 1  
			    if p.status == "Active":
				    renewal_count += 1
			    if p.status == "Renewed":
				    renewed_count += 1	
			    if p.status == "New Opp" or p.status == "Active":
				    total_count += 1
			    if p.status == "X-Renewal":
				    x_renewal += 1
			    if p.status == "Lost":
				    lost_renewal += 1					
		
			
		

	new_label = ("New Business")
	renewal_label = _("Renewal Business")
	total_label = _("Total Business")

	count_label = _("Total Renewals")

	if filters.group_by == "Renewals" and filters.based_on == "Creation":
		return [
			{"value": round(new_amount,2),"indicator": "Blue", "label": new_label, "datatype": "Data"},
			
			{"value":round(renewal_amount,2),"indicator": "light blue", "label": renewal_label, "datatype": "Data"},
			{"value":round(total_amount,2),"indicator": "Green", "label": total_label, "datatype": "Data"}
			
			
		]
	else:
		return [
			{"value": round(new_count,2),"indicator": "Blue", "label": "New Opps", "datatype": "Data"},
			{"value":round(renewal_count,2),"indicator": "Green", "label": "Active Renewals", "datatype": "Data"},
			{"value":round(renewed_count,2),"indicator": "Green", "label": "Renewed", "datatype": "Data"},
			{"value":round(x_renewal,2),"indicator": "light blue", "label": "X Renewals", "datatype": "Data"},
			{"value":round(lost_renewal,2),"indicator": "Red", "label": "Lost Renewals", "datatype": "Data"},
		]	


def get_chart_data(filters, columns, data):
    
    new_amount,renewal_amount , total_amount,new_count,renewal_count,x_renewal,lost_renewal, total_count= 0.0, 0.0,0.0,0.0,0.0,0.0,0.0,0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	# labels = ["sales_amount" , "purchase_amount"]	
    # labels = ["Renewals Chart"]

    for p in data:
	    if filters.group_by == "Renewals" and filters.based_on == "Creation":
		    if p.indent == 0.0:
			    if p.new_add == "New":
				    new_amount += p.selling_amount
			    if p.new_add == "Renewal":
				    renewal_amount += p.selling_amount
			    if p.new_add == "New" or p.new_add == "Renewal":
				    total_amount += p.selling_amount	 
	    else:
		    if p.indent == 0.0:
			    if p.status == "New Opp":
				    new_count += 1  
			    if p.status == "Active":
				    renewal_count += 1
			    if p.status == "New Opp" or p.status == "Active":
				    total_count += 1
			    if p.status == "X-Renewal":
			        x_renewal += 1
			    if p.status == "Lost":
			        lost_renewal += 1	
		

    datasets = [{"name":"New Amount","values":[0.0]},
    {"name":"Renewal Amount", "values":[0.0]},
	{"name":"Total Amount","values":[0.0]}
    ]
	
	
    datasets[0]["values"] = [new_amount]
    datasets[1]["values"] = [renewal_amount]
    datasets[2]["values"] = [total_amount]

    if filters.group_by == "Renewals" and filters.based_on == "Creation":
    
	    return {
			'title':"Chart",
			'data':{
				'labels':["Renewal Chart"],
				'datasets':datasets
			},
			'type':'bar',
			'height':300,
			'width':1000,
			'fieldtype':'Currency',
			'colors':["#0087AC","#00A88F", "#82C272"],
		}
    else:
	    return {
			'type':'pie',
			'data':{
				'labels':["New Opp","Active","Lost","X-Renewal"],
				'datasets':[
					{
						"values":[new_count,renewal_count,lost_renewal,x_renewal]
					}
					]
			},
			'colors':["#0087AC","#82C272","#EB548C","#1AC9E6"],
		}	
