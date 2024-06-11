# Copyright (c) 2024, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from datetime import datetime

# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta

from collections import OrderedDict
from frappe import _, qb, scrub
from frappe.query_builder import Order
from frappe.utils import cint, flt, formatdate

from erpnext.controllers.queries import get_match_cond
from erpnext.stock.report.stock_ledger.stock_ledger import get_item_group_condition
from erpnext.stock.utils import get_incoming_rate
from renewal_module.renewal_module.report.sales_based_on_timespan.sales_based_on_timespan import (
	get_data,
)
from renewal_module.renewal_module.report.sales_target_based_on_timespan.sales_target_based_on_timespan import (
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
				"target_uom",
				"sales_person",
				"topline_target",
				"bottomline_target",
				"topline_achieved",
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

	if filters.group_by == "Sales Person":
		# report_summary = get_report_summary(filters,columns, currency, data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

		# chart = get_chart_data(filters, columns, data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))	

		return columns, data, None
	else:
		return columns, data, None	


def get_data_when_grouped_by_sales_person(
	columns, gross_profit_data, filters, group_wise_columns, data
):
	column_names = get_column_names()

	# to display item as Item Code: Item Name
	columns[0] = "Sales Person:Link/Sub Target Details List:300"
	# removing Item Code and Item Name columns
	del columns[4:6]

	for src in gross_profit_data.si_list:
		# frappe.msgprint(scrub(filters.group_by))
		row = frappe._dict()
		row.indent = src.indent
		row.parent_sales_person = src.parent_sales_person
		row.currency = filters.currency

		for col in group_wise_columns.get(scrub(filters.group_by)):
			row[column_names[col]] = src.get(col)

		frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(src)))	

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
				"width": 120,
			},
			"sales_person_or_item": {
				"label": _("Sales Person"),
				"fieldtype": "Link",
				"options": "Sales Person",
				"width": 120,
			},
			"category_type": {
				"label": _("Category Type"),
				"fieldname": "category_type",
				"fieldtype": "Data",
				"width": 100,
			},
			
			"category": {
				"label": _("Category"),
				"fieldname": "category",
				"fieldtype": "Data",
				"width": 100,
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
				"width": 100,
			},
			"bottomline_target": {
				"label": _("Bottomline Target"),
				"fieldname": "bottomline_target",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"topline_achieved": {
				"label": _("Topline Achieved"),
				"fieldname": "topline_achieved",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"bottomline_achieved": {
				"label": _("Bottomline Achieved"),
				"fieldname": "bottomline_achieved",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			
			
			"gross_profit_percent": {
				"label": _("Gross Profit Percent"),
				"fieldname": "gross_profit_%",
				"fieldtype": "Percent",
				"width": 100,
			},
			
			# "sales_person": {
			# 	"label": _("Sales Person"),
			# 	"fieldname": "sales_person",
			# 	"fieldtype": "Link",
			# 	"options": "Sales Person",
			# 	"width": 100,
			# },
			
			"shortfall": {
				"label": _("Shortfall"),
				"fieldname": "shortfall",
				"fieldtype": "Currency",
				"options": "currency",
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
		self.average_buying_rate = {}
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
		frappe.msgprint("process")
		self.grouped = {}
		self.grouped_data = []

		self.currency_precision = cint(frappe.db.get_default("currency_precision")) or 3
		self.float_precision = cint(frappe.db.get_default("float_precision")) or 2

		grouped_by_sales_person = True if self.filters.get("group_by") == "Sales Person" else False

		if grouped_by_sales_person:
			achieved_value = 0
			bottomline_target= 0
			topline_target=0
			topline_achieved = 0
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(self.si_list)))

		for row in reversed(self.si_list):
			frappe.msgprint("hello")
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
					achieved_value += flt(row.achieved_value)
					topline_achieved += flt(row.topline_achieved)
					bottomline_target += flt(row.bottomline_target)
					topline_target += flt(row.topline_target)
				elif row.indent == 0.0:
					row.bottomline_target = bottomline_target
					row.bottomline_achieved = achieved_value
					row.topline_target = topline_target
					row.topline_achieved = topline_achieved
					achieved_value = 0
					bottomline_target= 0
					topline_target=0
					topline_achieved = 0
					

			# get buying rate
			# if flt(row.qty):
			# 	row.buying_rate = flt(row.buying_amount / flt(row.qty), self.float_precision)
			# 	row.base_rate = flt(row.base_amount / flt(row.qty), self.float_precision)
			# else:
			# 	if self.is_not_sales_person_row(row):
			# 		row.buying_rate, row.base_rate = 0.0, 0.0
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row.buying_amount)))		

			# calculate gross profit
			# row.gross_profit = flt((flt(row.margin)- flt(row.orc)), self.currency_precision)
			# if row.base_amount:
			# 	row.gross_profit_percent = flt(
			# 		(row.gross_profit / row.base_amount) * 100.0, self.currency_precision
			# 	)
			# else:
			# 	row.gross_profit_percent = 0.0

			# add to grouped
			self.grouped.setdefault(row.get(scrub(self.filters.group_by)), []).append(row)

		# if self.grouped:
		# 	self.get_average_rate_based_on_group_by()

	def get_average_rate_based_on_group_by(self):
		frappe.msgprint("get_avg_rt_bas_grop")
		for key in list(self.grouped):
			if self.filters.get("group_by") == "Sales Person":
				for i, row in enumerate(self.grouped[key]):
					if row.indent == 1.0:
						if (
							row.parent in self.returned_sales_persons and row["category_type"] in self.returned_sales_persons[row["sales_person"]]
						):
							returned_item_rows = self.returned_sales_persons[row["sales_person"]][row["category_type"]]
							for returned_item_row in returned_item_rows:
								# returned_items 'qty' should be stateful
								if returned_item_row.qty != 0:
									if row.qty >= abs(returned_item_row.qty):
										row.qty += returned_item_row.qty
										returned_item_row.qty = 0
									else:
										row.qty = 0
										returned_item_row.qty += row.qty
								row.base_amount += flt(returned_item_row.base_amount, self.currency_precision)
							row.buying_amount = flt(flt(row.qty) * flt(row.buying_rate), self.currency_precision)
						if flt(row.qty) or row.base_amount:
							row = self.set_average_rate(row)
							self.grouped_data.append(row)
			elif self.filters.get("group_by") == "Payment Term":
				for i, row in enumerate(self.grouped[key]):
					sales_person_portion = 0

					if row.docstatus==1:
						sales_person_portion = 100
					elif row.sales_person_portion:
						sales_person_portion = row.sales_person_portion
					elif row.payment_amount:
						sales_person_portion = row.payment_amount * 100 / row.base_net_amount

					if i == 0:
						new_row = row
						self.set_average_based_on_payment_term_portion(new_row, row, sales_person_portion)
					else:
						new_row.qty += flt(row.qty)
						self.set_average_based_on_payment_term_portion(new_row, row, sales_person_portion, True)

				new_row = self.set_average_rate(new_row)
				self.grouped_data.append(new_row)
			else:
				for i, row in enumerate(self.grouped[key]):
					if i == 0:
						new_row = row
					else:
						new_row.qty += flt(row.qty)
						new_row.buying_amount += flt(row.buying_amount, self.currency_precision)
						new_row.base_amount += flt(row.base_amount, self.currency_precision)
						if self.filters.get("group_by") == "Sales Person":
							# diff = moment(self.filters.get("from_date")).diff(self.filters.get("to_date"), "months")
							new_row.allocated_amount = flt(row.allocated_amount , self.currency_precision)
				new_row = self.set_average_rate(new_row)
				self.grouped_data.append(new_row)

	def set_average_based_on_payment_term_portion(self, new_row, row, sales_person_portion, aggr=False):
		cols = ["base_amount", "buying_amount","margin", "gross_profit"]
		for col in cols:
			if aggr:
				new_row[col] += row[col] * sales_person_portion / 100
			else:
				new_row[col] = row[col] * sales_person_portion / 100

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
		frappe.msgprint("get_return_sales_person_item")
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

	# def skip_row(self, row):
	# 	if self.filters.get("group_by") != "Sales Person":
	# 		if not row.get(scrub(self.filters.get("group_by", ""))):
	# 			return True

	# 	return False

	def get_buying_amount_from_product_bundle(self, row, product_bundle):
		frappe.msgprint("get_buying_amount_from_pro")
		buying_amount = 0.0
		for packed_item in product_bundle:
			if packed_item.get("parent_detail_docname") == row.item_row:
				packed_item_row = row.copy()
				packed_item_row.warehouse = packed_item.warehouse
				buying_amount += self.get_buying_amount(packed_item_row, packed_item["category_type"])

		return flt(buying_amount, self.currency_precision)

	def calculate_buying_amount_from_sle(self, row, my_sle, parenttype, parent, item_row, category_type):
		frappe.msgprint("calculate_buying_amount")
		for i, sle in enumerate(my_sle):
			# find the stock valution rate from stock ledger entry
			if (
				sle.voucher_type == parenttype
				and parent == sle.voucher_no
				and sle.voucher_detail_no == item_row
			):
				previous_stock_value = len(my_sle) > i + 1 and flt(my_sle[i + 1].stock_value) or 0.0

				if previous_stock_value:
					return abs(previous_stock_value - flt(sle.stock_value)) * flt(row.qty) / abs(flt(sle.qty))
				else:
					return flt(row.qty) * self.get_average_buying_rate(row, category_type)
		return 0.0

	
	
	def get_average_buying_rate(self, row, category_type):
		frappe.msgprint("get_avg_buy_amt")
		args = row
		if category_type not in self.average_buying_rate:
			args.update(
				{
					"voucher_type": row.parenttype,
					"voucher_no": row.parent,
					"allow_zero_valuation": True,
					"company": self.filters.company,
				}
			)

			if row.serial_and_batch_bundle:
				args.update({"serial_and_batch_bundle": row.serial_and_batch_bundle})

			average_buying_rate = get_incoming_rate(args)
			self.average_buying_rate[category_type] = flt(average_buying_rate)

		return self.average_buying_rate[category_type]

	# def get_last_purchase_rate(self, category_type, row):
	# 	purchase_order = frappe.qb.DocType("Purchase Order")
	# 	purchase_order_item = frappe.qb.DocType("Purchase Order Item")

	# 	query = (
	# 		frappe.qb.from_(purchase_order_item)
	# 		.inner_join(purchase_order)
	# 		.on(purchase_order.name == purchase_order_item.parent)
	# 		.select(purchase_order_item.base_rate / purchase_order_item.conversion_factor)
	# 		.where(purchase_order.docstatus == 1)
	# 		.where(purchase_order.creation <= self.filters.to_date)
	# 		.where(purchase_order_item.category_type == category_type)
	# 	)

	# 	if row.project:
	# 		query.where(purchase_order_item.project == row.project)

	# 	if row.cost_center:
	# 		query.where(purchase_order_item.cost_center == row.cost_center)

	# 	query.sales_personby(purchase_order.creation, order=frappe.qb.desc)
	# 	query.limit(1)
	# 	last_purchase_rate = query.run()

	# 	return flt(last_purchase_rate[0][0]) if last_purchase_rate else 0

	def load_sales_person_items(self):
		frappe.msgprint("load_sp_itm")
		self.si_list = []
		session_user = frappe.session.user
		self.sales_data = get_data(self.filters)
		self.rows = get_target_data(self.filters, self.sales_data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(self.rows)))

		if not self.rows:
			return columns, self.si_list
			

		for key, value in self.rows.items():
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(key)))
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(value)))
			value.update({"sales_person": key[0], "category_type": key[1], "category":key[2],"target_uom":key[3]})

			self.si_list.append(value)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(self.si_list)))	
		# conditions = ""
		# if self.filters.company:
		# 	conditions += "`tabSales Person`.company = %(company)s"

		# if self.filters.timespan != "custom":
		# 	# if self.filters.timespan == "this year":
		# 	# 	date = frappe.db.get_value("Fiscal Year",{'auto_created':1},["year_start_date","year_end_date"])
		# 	# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
		# 	date_range = get_timespan_date_range(self.filters.timespan) 
		# 	date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
		# 	date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
		# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
		# 	conditions += f" and `tabSales Person`.creation >= '{date1}' and `tabSales Person`.creation <= '{date2}'"

		# if self.filters.timespan == "custom":
			
		# 	conditions += " and `tabSales Person`.creation >= %(from_date)s and `tabSales Person`.creation <= %(to_date)s"
		
			
		# if self.filters.from_date:
		# 	conditions += " and `tabSales Person`.creation >= %(from_date)s"
		# if self.filters.to_date:
		# 	conditions += " and `tabSales Person`.creation <= %(to_date)s"

		# if self.filters.brand:
		# 	conditions += " and `tabSub Target Details List`.brand in %(brand)s"	

		# conditions += " and (is_return = 0 or (is_return=1 and return_against is null))"

		# if self.filters.item_group:
		# 	conditions += " and {0}".format(get_item_group_condition(self.filters.item_group))
		
		# if self.filters.sales_person:
		# 	conditions += """
		# 		and exists(select 1
		# 					from `tabSales Team` st
		# 					where st.parent = `tabSales Person`.name
		# 					and   st.sales_person = %(sales_person)s)
		# 	"""

		# if self.filters.group_by == "Sales Person":
		# 	sales_person_cols = ", sales.sales_person,  sales.incentives, ttd.target_amount as allocated_amount"
		# 	sales_team_table = "left join `tabSales Team` sales on sales.parent = `tabSales Person`.name LEFT JOIN 	`tabTarget Detail` ttd on ttd.parent = sales.sales_person"
		# else:
		# 	sales_person_cols = ",tst.sales_person"
		# 	sales_team_table = "LEFT JOIN `tabSales Team` tst on tst.parent = `tabSales Person`.name	"

		# if self.filters.group_by == "Payment Term":
		# 	payment_term_cols = """,if(`tabSales Person`.docstatus = 0,
		# 								'{0}',
		# 								coalesce(schedule.payment_term, '{1}')) as payment_term,
		# 							schedule.sales_person_portion,
		# 							schedule.payment_amount """.format(
		# 		_("Sales Return"), _("No Terms")
		# 	)
		# 	payment_term_table = """ left join `tabPayment Schedule` schedule on schedule.parent = `tabSales Person`.name  """
		# else:
		# 	payment_term_cols = ""
		# 	payment_term_table = ""

		# if self.filters.get("sales_person"):
		# 	conditions += " and `tabSales Person`.name = %(sales_person)s"

		# if self.filters.get("sales_stage"):
		# 	conditions += " and `tabSub Target Details List`.sales_stage in %(sales_stage)s"	

		# if self.filters.get("category_type"):
		# 	conditions += " and `tabSub Target Details List`.category_type = %(category_type)s"

		
		# self.si_list = frappe.db.sql(
		# 	"""
		# 	select
		# 		`tabSales Person`.name as parent,
		# 		`tabSales Person`.creation, 
		# 		`tabSub Target Details`.parent,
		# 		`tabSub Target Details`.category_type,
		# 		`tabSub Target Details`.category, `tabSub Target Details`.target_uom,
		# 		`tabSub Target Details`.target_type, `tabSub Target Details`.target_amount
		# 	from
		# 		`tabSales Person` inner join `tabSub Target Details`
		# 		on `tabSub Target Details`.parent = `tabSales Person`.name	
		# 		""".format(
		# 		conditions=conditions,
		# 		sales_person_cols=sales_person_cols,
		# 		sales_team_table=sales_team_table,
		# 		payment_term_cols=payment_term_cols,
		# 		payment_term_table=payment_term_table,
		# 		match_cond=get_match_cond("Sales Person"),
		# 	),
		# 	self.filters,
		# 	as_dict=1,
		# )

	
	def group_items_by_sales_person(self):
		"""
		Turns list of Sub Target Details Lists to a tree of Sales Persons with their Items as children.
		"""

		grouped = OrderedDict()

		for row in self.si_list:
			# initialize list with a header row for each new parent
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
			# grouped.setdefault(row["sales_person"], [self.get_sales_person_row(row)]).append(
			# 	row.update(
			# 		{"indent": 1.0, "parent_sales_person": row["sales_person"], "sales_person_or_item": row["category_type"]}
			# 	)  # descendant rows will have indent: 1.0 or greater
			# )
			grouped.setdefault(row["sales_person"], [self.get_sales_person_row(row)])
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(self.get_sales_person_rows(row))))
			grouped[row["sales_person"]].append(
				self.get_sales_person_rows(row)
				  # descendant rows will have indent: 1.0 or greater
			)
			# grouped.setdefault(row.parent, [self.get_opportunity_row(row)],[se])
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(grouped)))

			# if item is a bundle, add it's components as seperate rows
			# if frappe.db.exists("Product Bundle", row["category_type"]):
			# 	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row["category_type"])))
			# 	bundled_items = self.get_bundle_items(row)
			# 	for x in bundled_items:
			# 		bundle_item = self.get_bundle_item_row(row, x)
			# 		grouped.get(row["sales_person"]).append(bundle_item)
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
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row["sales_person"])))
		return frappe._dict(
			{
				"parent_sales_person": row["sales_person"],
				"indent": 1.0,
				"sales_person_or_item": row["category_type"],
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
	

	def get_bundle_items(self, product_bundle):
		frappe.msgprint("get_bundle_items")
		return frappe.get_all(
			"Product Bundle Item", filters={"parent": product_bundle["category_type"]}, fields=[["category"]]
		)

	# def get_bundle_item_row(self, product_bundle, item):
	# 	frappe.msgprint("get_bundle_item_row")
	# 	item_name, description, item_group, brand = self.get_bundle_item_details(item["category"])

	# 	return frappe._dict(
	# 		{
	# 			"parent_sales_person": product_bundle["category_type"],
	# 			"indent": product_bundle.indent + 1,
	# 			"parent": None,
	# 			"sales_person_or_item": item["category_type"],
	# 			"creation": product_bundle.creation,
	# 			"sales_person": None,
	# 			"sales_stage":None,
	# 			"customer": product_bundle.customer,
	# 			"customer_group": product_bundle.customer_group,
	# 			"category_type": item["category_type"],
	# 			"item_name": item_name,
	# 			"description": description,
	# 			"warehouse": product_bundle.warehouse,
	# 			"item_group": item_group,
	# 			"brand": brand,
	# 			"qty": (flt(product_bundle.qty) * flt(item.qty)),
	# 			"item_row": None,
				
	# 		}
	# 	)

	def get_bundle_item_details(self, item_code):
		frappe.msgprint("get_bundle_item_details")
		return frappe.db.get_value(
			"Item", item_code, ["item_name", "description", "item_group", "brand"]
		)

	# def get_stock_ledger_entries(self, item_code, warehouse):
	# 	if item_code and warehouse:
	# 		if (item_code, warehouse) not in self.sle:
	# 			sle = qb.DocType("Stock Ledger Entry")
	# 			res = (
	# 				qb.from_(sle)
	# 				.select(
	# 					sle.item_code,
	# 					sle.voucher_type,
	# 					sle.voucher_no,
	# 					sle.voucher_detail_no,
	# 					sle.stock_value,
	# 					sle.warehouse,
	# 					sle.actual_qty.as_("qty"),
	# 				)
	# 				.where(
	# 					(sle.company == self.filters.company)
	# 					& (sle.item_code == item_code)
	# 					& (sle.warehouse == warehouse)
	# 					& (sle.is_cancelled == 0)
	# 				)
	# 				.sales_personby(sle.item_code)
	# 				.sales_personby(sle.warehouse,  sle.creation, sales_person=Order.desc)
	# 				.run(as_dict=True)
	# 			)

	# 			self.sle[(item_code, warehouse)] = res

	# 		return self.sle[(item_code, warehouse)]
	# 	return []

	# def load_product_bundle(self):
	# 	frappe.msgprint("get_product_bundle")
	# 	self.product_bundles = {}

	# 	pki = qb.DocType("Packed Item")
	# 	frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(pki)))


	# 	pki_query = (
	# 		frappe.qb.from_(pki)
	# 		.select(
	# 			pki.parenttype,
	# 			pki.parent,
	# 			pki.parent_item,
	# 			pki["category_type"],
	# 			pki.warehouse,
	# 			(-1 * pki.qty).as_("total_qty"),
	# 			pki.rate,
	# 			(pki.rate * pki.qty).as_("base_amount"),
	# 			pki.parent_detail_docname,
	# 		)
	# 		.where(pki.docstatus == 0)
	# 	)

	# 	for d in pki_query.run(as_dict=True):
	# 		frappe.msgprint("d")
	# 		self.product_bundles.setdefault(d.parenttype, frappe._dict()).setdefault(
	# 			d.parent, frappe._dict()
	# 		).setdefault(d.parent_item, []).append(d)

	# def load_non_stock_items(self):
	# 	self.non_stock_items = frappe.db.sql_list(
	# 		"""select name from tabItem
	# 		where is_stock_item=0"""
	# 	)




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

