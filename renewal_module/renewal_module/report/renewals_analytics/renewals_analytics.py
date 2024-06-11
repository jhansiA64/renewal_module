# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

from collections import OrderedDict

import frappe
from frappe import _, qb, scrub
from frappe.query_builder import Order
from frappe.utils import cint, flt, formatdate
from datetime import datetime
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
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
				"sales_person",
				
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
			"project": "project",
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

		for row in reversed(self.rl_list):
			

			if self.skip_row(row):
				continue

			row.base_amount = flt(row.amount, self.currency_precision)

			product_bundles = []

			if grouped_by_renewals:
				
				if row.indent == 1.0 and row.idx == 1:
					# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
					renewal_type = row.renewal_type

				elif row.indent == 0.0:
					# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(bottomline_achieved)))
					row.renewal_type = renewal_type
					renewal_type = "New"
					
			
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
		if self.filters.company:
			conditions += " and `tabRenewal List`.company = %(company)s"
		# if self.filters.from_date:
		# 	conditions += " and `tabRenewal List`.creation >= %(from_date)s"
		# if self.filters.to_date:
		# 	conditions += " and `tabRenewal List`.creation <= %(to_date)s"
		if self.filters.timespan != "custom":
			date_range = get_timespan_date_range(self.filters.timespan) 
			date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
			date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
			if self.filters.based_on == "Creation":
				# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
				conditions += " and `tabRenewal List`.status = ('Active')"
				conditions += f" and `tabRenewal List`.creation >= '{date1}' and `tabRenewal List`.creation <= '{date2}'"
			else:
				conditions += " and `tabRenewal List`.status in ('Active','New Opp')"
				conditions += f" and `tabRenewal List`.end_date >= '{date1}' and `tabRenewal List`.end_date <= '{date2}'"	
		if self.filters.timespan == "custom":
			if self.filters.based_on == "Creation":
				# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
				conditions += " and `tabRenewal List`.status = ('Active')"
				conditions += " and `tabRenewal List`.creation >= %(from_date)s and `tabRenewal List`.creation <= %(to_date)s"
			else:
				conditions += " and `tabRenewal List`.status in ('Active','New Opp')"
				conditions += " and `tabRenewal List`.end_date >= %(from_date)s and `tabRenewal List`.end_date <= %(to_date)s"	
				

		# conditions += " and (is_return = 0 or (is_return=1 and return_against is null))"

		if self.filters.item_group:
			conditions += " and {0}".format(get_item_group_condition(self.filters.item_group))

		if self.filters.get("sales_person"):
			conditions += "and `tabRenewal List`.sales_user = %(sales_person)s"

		if self.filters.get("renewal_list"):
			conditions += " and `tabRenewal List`.name in %(renewal_list)s"

		if self.filters.get("customer"):
			conditions += " and `tabRenewal List`.customer_name in %(customer)s"	

		if self.filters.get("item_code"):
			conditions += " and `tabSales Invoice Item`.item_code = %(item_code)s"

		# if self.filters.get("warehouse"):
		# 	warehouse_details = frappe.db.get_value(
		# 		"Warehouse", self.filters.get("warehouse"), ["lft", "rgt"], as_dict=1
		# 	)
		# 	if warehouse_details:
		# 		conditions += f" and `tabSales Invoice Item`.warehouse in (select name from `tabWarehouse` wh where wh.lft >= {warehouse_details.lft} and wh.rgt <= {warehouse_details.rgt} and warehouse = wh.name)"

		self.rl_list = frappe.db.sql(
			"""
			select
				`tabRenewal List`.name as parent,
				`tabRenewal List`.end_date,
				`tabRenewal List`.status,
				`tabRenewal List`.customer_name,
				`tabRenewal Item`.new_add as "renewal_type",
				`tabRenewal Item`.item_code,`tabRenewal Item`.idx,
				`tabRenewal Item`.item_name, `tabRenewal Item`.description,
				`tabRenewal Item`.warehouse, `tabRenewal Item`.item_group,
				`tabRenewal Item`.item_brand as brand,
				`tabRenewal Item`.start_date,
				`tabRenewal Item`.invoice_no,
				`tabRenewal Item`.qty as qty,
				`tabRenewal Item`.rate as rate, `tabRenewal Item`.amount,
				`tabRenewal Item`.name as "item_row",
				`tabRenewal List`.sales_user as "sales_person"
			from
				`tabRenewal List` inner join `tabRenewal Item`
				on `tabRenewal Item`.parent = `tabRenewal List`.name
				join `tabItem` item on item.name = `tabRenewal Item`.item_code
				
			where
			     `tabRenewal List`.company = %(company)s 	
				{conditions} {match_cond}
			order by
				`tabRenewal List`.end_date desc""".format(
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
	new_amount,renewal_amount , total_amount, new_count,renewal_count, total_count= 0.0, 0.0,0.0,0.0,0.0,0.0
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
			    if p.status == "New Opp" or p.status == "Active":
				    total_count += 1			
		
			
		

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
			{"value":round(renewal_count,2),"indicator": "light blue", "label": "Active Renewals", "datatype": "Data"},
			{"value":round(total_count,2),"indicator": "Green", "label": "Total Renewals", "datatype": "Data"}
		]	


def get_chart_data(filters, columns, data):
    
    new_amount,renewal_amount , total_amount,new_count,renewal_count, total_count= 0.0, 0.0,0.0,0.0,0.0,0.0
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
				'labels':["New Opp","Renewals"],
				'datasets':[
					{
						"values":[new_count,total_count]
					}
					]
			},
			'colors':["#0087AC","#00A88F", "#82C272"],
		}	
