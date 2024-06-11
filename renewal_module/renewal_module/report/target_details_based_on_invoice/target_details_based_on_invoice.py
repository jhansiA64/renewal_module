# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from datetime import datetime

# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
 
# from dateutil import relativedelta

from collections import OrderedDict
from frappe import _, qb, scrub
# from frappe.query_builder import Order
from frappe.utils import cint, flt, formatdate

# from erpnext.controllers.queries import get_match_cond
# from erpnext.stock.report.stock_ledger.stock_ledger import get_item_group_condition
# from erpnext.stock.utils import get_incoming_rate
from renewal_module.renewal_module.report.sales_data_based_on_invoice.sales_data_based_on_invoice import (
	get_data,
)
from renewal_module.renewal_module.report.sales_target_based_on_invoice.sales_target_based_on_invoice import (
get_target_data,
)



def execute(filters=None):
	if not filters:
		filters = frappe._dict()
	filters.currency = frappe.get_cached_value("Company", filters.company, "default_currency")

	gross_profit_data = GrossProfitGenerator(filters)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(gross_profit_data.si_list)))

	data = []

	group_wise_columns = frappe._dict(
		{
			"sales_person": [
				"sales_person_or_item",
				"category",
				"category_type",
				"target_uom",
				"sales_person",
				"topline_target",
				"topline_target",
				"topline_achieved",
				"bottomline_target",
				"bottomline_achieved",
				"shortfall",
								
				
			],
			
		}
	)

	columns = get_columns(group_wise_columns, filters)

	if filters.group_by == "Sales Person":
		get_data_when_grouped_by_sales_person(columns, gross_profit_data, filters, group_wise_columns, data)

	else:
		get_data_when_not_grouped_by_sales_person(gross_profit_data, filters, group_wise_columns, data)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	# if filters.group_by == "Sales Person":
	# 	# report_summary = get_report_summary(filters,columns, currency, data)
	# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

	# 	# chart = get_chart_data(filters, columns, data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))	

	# 	return columns, data, None
	# else:

	return columns, data, None, None, None


def get_data_when_grouped_by_sales_person(
	columns, gross_profit_data, filters, group_wise_columns, data
):
	column_names = get_column_names()

	# to display item as Item Code: Item Name
	columns[0] = "Sales Person:Link/Sub Target Details List:300"
	# removing Item Code and Item Name columns
	del columns[4:6]

	for src in gross_profit_data.si_list:
		# frappe.msgprint("row")
		row = frappe._dict()
		row.indent = src.indent
		row.parent_sales_person = src.parent_sales_person
		row.currency = filters.currency

		for col in group_wise_columns.get(scrub(filters.group_by)):
			row[column_names[col]] = src.get(col)

		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))	

		data.append(row)


def get_data_when_not_grouped_by_sales_person(gross_profit_data, filters, group_wise_columns, data):
	for src in gross_profit_data.grouped_data:
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(src)))
		row = []
		for col in group_wise_columns.get(scrub(filters.group_by)):
			row.append(src.get(col))

		row.append(filters.currency)

		data.append(row)


def get_columns(group_wise_columns, filters):
	columns = []
	column_map = frappe._dict(
		{
			"parent": {
				"label": _("Sales Person"),
				"fieldname": "parent_sales_person",
				"fieldtype": "Link",
				"options": "Sales Person",
				"width": 100,
			},
			"sales_person_or_item": {
				"label": _("Sales Person"),
				"fieldtype": "Link",
				"options": "Sales Person",
				"width": 100,
			},
			"category_type": {
				"label": _("Category Type"),
				"fieldname": "category_type",
				"fieldtype": "Data",
				"width": 10,
			},
			
			"category": {
				"label": _("Category"),
				"fieldname": "category",
				"fieldtype": "Data",
				"width": 150,
			},
			"target_uom": {
				"label": _("Target UOM"), 
				"fieldname":"target_uom",
				"fieldtype": "Data", 
				"width": 100
			},
			"topline_target": {
				"label": _("Topline Target"),
				"fieldname": "topline_target",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 180,
			},
			"bottomline_target": {
				"label": _("Bottomline Target"),
				"fieldname": "bottomline_target",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 180,
			},
			"topline_achieved": {
				"label": _("Topline Achieved"),
				"fieldname": "topline_achieved",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 180,
			},
			"bottomline_achieved": {
				"label": _("Bottomline Achieved"),
				"fieldname": "bottomline_achieved",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 180,
			},
			
			
			"gross_profit_percent": {
				"label": _("Gross Profit Percent"),
				"fieldname": "gross_profit_%",
				"fieldtype": "Percent",
				"width": 180,
			},
			
			
			"shortfall": {
				"label": _("Shortfall"),
				"fieldname": "shortfall",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 180,
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
			"sales_person_or_item": "sales_person",
			"category_type": "category_type",
			"category": "category",
			"sales_person": "sales_person",
			"target_uom":"target_uom",
			"topline_target": "topline_target",
			"bottomline_target": "bottomline_target",
			"topline_achieved": "topline_achieved",
			"bottomline_achieved": "bottomline_achieved",
			"shortfall":"shortfall",
			"gross_profit_percent": "gross_profit_%",
			
		}
	)


class GrossProfitGenerator(object):
	def __init__(self, filters=None):
		self.sle = {}
		self.data = []
		# self.average_buying_rate = {}
		self.filters = frappe._dict(filters)
		self.load_sales_person_items()
		# self.get_delivery_notes()

		if filters.group_by == "Sales Person":
			self.group_items_by_sales_person()

		# self.load_product_bundle()
		# self.load_non_stock_items()
		self.get_returned_sales_person_items()
		self.process()

	def process(self):
		# frappe.msgprint("process")
		self.grouped = {}
		self.grouped_data = []

		self.currency_precision = cint(frappe.db.get_default("currency_precision")) or 3
		self.float_precision = cint(frappe.db.get_default("float_precision")) or 2

		grouped_by_sales_person = True if self.filters.get("group_by") == "Sales Person" else False

		if grouped_by_sales_person:
			bottomline_achieved = 0
			bottomline_target= 0
			topline_target=0
			topline_achieved = 0
			shortfall = 0
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(self.si_list)))

		for row in reversed(self.si_list):
			# frappe.msgprint("hello")
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
			# if self.filters.get("group_by") == "Monthly":
			# 	row.monthly = formatdate(row.creation, "MMM YYYY")

			# if self.skip_row(row):
			# 	continue

			# row.bottomline_target = flt(row.base_net_amount, self.currency_precision)

			product_bundles = []
			
			if grouped_by_sales_person:
				# buying_amount = 0
				# margin = 0
				# orc = 0
				if row.indent == 1.0:
					# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
					bottomline_achieved += flt(row.bottomline_achieved)
					topline_achieved += flt(row.topline_achieved)
					bottomline_target += flt(row.bottomline_target)
					topline_target += flt(row.topline_target)
					shortfall += flt(row.shortfall)

				elif row.indent == 0.0:
					# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(bottomline_achieved)))
					row.bottomline_target = bottomline_target
					row.bottomline_achieved = bottomline_achieved
					row.topline_target = topline_target
					row.topline_achieved = topline_achieved
					row.shortfall = shortfall
					bottomline_achieved = 0
					bottomline_target= 0
					topline_target=0
					topline_achieved = 0
					shortfall = 0
					

			

			# add to grouped
			self.grouped.setdefault(row.get(scrub(self.filters.group_by)), []).append(row)

		# if self.grouped:
		# 	self.get_average_rate_based_on_group_by()

	
	# def set_average_based_on_payment_term_portion(self, new_row, row, sales_person_portion, aggr=False):
	# 	cols = ["base_amount", "buying_amount","margin", "gross_profit"]
	# 	for col in cols:
	# 		if aggr:
	# 			new_row[col] += row[col] * sales_person_portion / 100
	# 		else:
	# 			new_row[col] = row[col] * sales_person_portion / 100

	def is_not_sales_person_row(self, row):
		return (self.filters.get("group_by") == "Sales Person" and row.indent != 0.0) or self.filters.get(
			"group_by"
		) != "Sales Person"

	def set_average_rate(self, new_row):
		self.set_average_gross_profit(new_row)
		new_row.buying_rate = (
			flt(new_row.buying_amount / new_row.qty, self.float_precision) if new_row.qty else 0
		)
		new_row.base_rate = (
			flt(new_row.base_amount / new_row.qty, self.float_precision) if new_row.qty else 0
		)
		return new_row

	def set_average_gross_profit(self, new_row):
		new_row.gross_profit = flt((flt(new_row.margin) - flt(new_row.orc)), self.currency_precision)
		new_row.gross_profit_percent = (
			flt(((new_row.gross_profit / new_row.base_amount) * 100.0), self.currency_precision)
			if new_row.base_amount
			else 0
		)

	def get_returned_sales_person_items(self):
		# frappe.msgprint("get_return_sales_person_item")
		returned_sales_persons = frappe.db.sql(
			"""
			select
				si.name, si_item.category_type, si_item.category, si_item.target_uom as target_uom, si_item.topline_target as topline_target,
				si_item.bottomline_target
			from
				`tabSales Person` si, `tabSub Target Details List` si_item
			where
				si.name = si_item.parent
		""",
			as_dict=1,
		)

		self.returned_sales_persons = frappe._dict()
		for inv in returned_sales_persons:
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(inv)))
			self.returned_sales_persons.setdefault(inv.return_against, frappe._dict()).setdefault(
				inv["category_type"], []
			).append(inv)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(returned_sales_persons)))	

	
	
	
	def load_sales_person_items(self):
		# frappe.msgprint("load_sp_itm")
		self.si_list = []
		session_user = frappe.session.user
		self.sales_data = get_data(self.filters)
		if self.sales_data:
			frappe.msgprint("sales data found")
		# else:
			# frappe.msgprint("sales data not found")	
		self.rows = get_target_data(self.filters, self.sales_data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(self.sales_data)))

		if not self.rows:
			return self.si_list
			

		for key, value in self.rows.items():
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(key)))
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(value)))
			value.update({"sales_person": key[0], "category_type": key[1], "category":key[2],"target_uom":key[3]})

			self.si_list.append(value)
		
		
		
	
	def group_items_by_sales_person(self):
		"""
		Turns list of Sub Target Details Lists to a tree of Sales Persons with their Items as children.
		"""

		grouped = OrderedDict()

		for row in self.si_list:
			# initialize list with a header row for each new parent
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
			
			grouped.setdefault(row["sales_person"], [self.get_sales_person_row(row)])
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(self.get_sales_person_rows(row))))
			grouped[row["sales_person"]].append(
				self.get_sales_person_rows(row)
				  # descendant rows will have indent: 1.0 or greater
			)
			
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(grouped)))	

		self.si_list.clear()

		for items in grouped.values():
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(items)))
			self.si_list.extend(items)

	def get_sales_person_row(self, row):
		# header row format
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row["sales_person"])))
		return frappe._dict(
			{
				"parent_sales_person": "",
				"indent": 0.0,
				"sales_person_or_item": row["sales_person"],
				"parent": None,
				"sales_person":row["sales_person"],
				"category_type": None,
				"category": None,
				"target_uom":None,
				"topline_target": None,
				"bottomline_target": None,
				"topline_achieved": None,
				"bottomline_achieved": None,
				"shortfall": None,
				
				
			}
		)
	def get_sales_person_rows(self, row):
		# header row format
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
		return frappe._dict(
			{
				"parent_sales_person": row["sales_person"],
				"indent": 1.0,
				"sales_person_or_item": row["category_type"],
				"sales_person":row["category_type"],
				"parent": row["sales_person"],
				"category": row["category"],
				"target_uom":row["target_uom"],
				"topline_target": row["topline_target"],
				"bottomline_target": row["bottomline_target"],
				"topline_achieved": row["topline_achieved"],
				"bottomline_achieved": row["achieved_value"],
				"shortfall": row["shortfall"],
				
				
			}
		)
	
	
	



# def get_report_summary(filters,columns, currency, data):
# 	sales_amount,purchase_amount,margin, orc, profit = 0.0, 0.0, 0.0, 0.0, 0.0
	
	

# 	for period in data:
# 		if filters.group_by == "Sales Person":

# 			if period.indent == 1.0:
# 				sales_amount += period.selling_amount
# 				purchase_amount += period.buying_amount
# 				orc += flt(period.orc)
		
			
		

# 	sales_label = ("Sales Amount")
# 	buying_label = _("Purchase Amount")
# 	profit_label = _("Profit")
	

# 	return [
# 		{"value": round(sales_amount,2),"indicator": "Blue", "label": sales_label, "datatype": "Data"},
		
# 		{"value":round(purchase_amount,2),"indicator": "Red", "label": buying_label, "datatype": "Data"},
# 		{"value":round((sales_amount - purchase_amount) - orc,2),"indicator": "Green", "label": profit_label, "datatype": "Data"}
		
		
# 	]




# def get_chart_data(filters,columns, data):
# 	brand_wise_sales_map = {}
# 	labels, datapoints_sales = [], []

# 	for row in data:
# 		if filters.group_by == "Sales Person" and row.indent == 1.0:
# 			item_key = row.get("sales_stage")
			
# 			if not item_key in brand_wise_sales_map:
# 				brand_wise_sales_map[item_key] = 0.0
# 			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(brand_wise_sales_map)))	
# 			brand_wise_sales_map[item_key] = flt(brand_wise_sales_map[item_key]) + flt(row.get("selling_amount"))

# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(brand_wise_sales_map)))	
# 	brand_wise_sales_map = {
# 		item: value
# 		for item, value in (sorted(brand_wise_sales_map.items(), key=lambda i: i[0]))
# 	}
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(brand_wise_sales_map)))
# 	datasets2 = []

# 	for key in brand_wise_sales_map:
# 		datasets2.append({"name":key,"values":[brand_wise_sales_map[key]]})
# 		labels.append(key)
# 		datapoints_sales.append(brand_wise_sales_map[key])

# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json({"labels":labels,"datasets":[{"values":datapoints_sales}]})))
		

# 	return {
# 		"data": {
# 			"labels": ["labels"],  # show max of 30 items in chart
# 			"datasets": datasets2,
# 		},
# 		"type": "bar",
# 		"colors":["#c80064","#008000","#9C2162","#D03454","#FFCA3E","#772F67", "#00A88F"],
# 	}

