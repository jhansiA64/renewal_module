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



def execute(filters=None):
	if not filters:
		filters = frappe._dict()
	filters.currency = frappe.get_cached_value("Company", filters.company, "default_currency")

	gross_profit_data = GrossProfitGenerator(filters)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(gross_profit_data.si_list)))

	data = []

	group_wise_columns = frappe._dict(
		{
			"opportunity": [
				"opportunity_or_item",
				"customer",
				"creation",
				"expected_date",
				"custom_committed_date",
				"name1",
				"sales_stage",
				"sales_person",
				"item_group",
				"brand",
				"forecast",
				"opportunity_type",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"gross_profit_percent",
				"sales_person",
				"custom_committed_date",
				"name1",
				
				
			],
			"item_code": [
				"item_code",
				"item_name",
				"brand",
				"description",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"gross_profit_percent",
			],
			"warehouse": [
				"warehouse",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"gross_profit",
				"gross_profit_percent",
			],
			"brand": [
				"brand",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"gross_profit_percent",
			],
			"item_group": [
				"item_group",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"gross_profit",
				"gross_profit_percent",
			],
			"customer": [
				"customer",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"gross_profit_percent",
			],
			"customer_group": [
				"customer_group",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"gross_profit",
				"gross_profit_percent",
			],
			"sales_person": [
				"sales_person",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"gross_profit_percent",
			],
			"project": ["project", "base_amount", "buying_amount", "gross_profit", "gross_profit_percent"],
			"territory": [
				"territory",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"gross_profit_percent",
			],
			"monthly": [
				"monthly",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"gross_profit_percent",
			],
			"payment_term": [
				"payment_term",
				"base_amount",
				"buying_amount",
				"gross_profit",
				"gross_profit_percent",
			],
		}
	)

	columns = get_columns(group_wise_columns, filters)

	if filters.group_by == "Opportunity":
		get_data_when_grouped_by_opportunity(columns, gross_profit_data, filters, group_wise_columns, data)

	else:
		get_data_when_not_grouped_by_opportunity(gross_profit_data, filters, group_wise_columns, data)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	if filters.group_by == "Opportunity":
		report_summary = get_report_summary(filters,columns, currency, data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

		chart = get_chart_data(filters, columns, data)
		# chart1 = get_chart_data1(filters, columns, data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))	

		return columns, data, None, chart, report_summary
	else:
		return columns, data, None	


def get_data_when_grouped_by_opportunity(
	columns, gross_profit_data, filters, group_wise_columns, data
):
	column_names = get_column_names()

	# to display item as Item Code: Item Name
	columns[0] = "Opportunity:Link/Item:300"
	# removing Item Code and Item Name columns
	del columns[4:6]

	for src in gross_profit_data.si_list:
		# frappe.msgprint(scrub(filters.group_by))
		row = frappe._dict()
		row.indent = src.indent
		row.parent_opportunity = src.parent_opportunity
		row.currency = filters.currency

		for col in group_wise_columns.get(scrub(filters.group_by)):
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(col)))
			row[column_names[col]] = src.get(col)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(src)))	

		data.append(row)


def get_data_when_not_grouped_by_opportunity(gross_profit_data, filters, group_wise_columns, data):
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
				"label": _("Opportunity"),
				"fieldname": "parent_opportunity",
				"fieldtype": "Link",
				"options": "Opportunity",
				"width": 120,
			},
			"opportunity_or_item": {
				"label": _("Opportunity"),
				"fieldtype": "Link",
				"options": "Opportunity",
				"width": 120,
			},
			"creation": {
				"label": _("Posting Date"),
				"fieldname": "creation",
				"fieldtype": "Date",
				"width": 100,
			},
			"expected_date": {
				"label": _("Expected Date"),
				"fieldname": "expected_date",
				"fieldtype": "Date",
				"width": 100,
			},
			"name1":{
				"label": _("Button"),
				"fieldname": "name1",
				"fieldtype": "Data",
				"width": 150,
			},
			"custom_committed_date":{
				"label": _("Committed Date"),
				"fieldname": "custom_committed_date",
				"fieldtype": "Date",
				"width": 150,
		    },
			"item_code": {
				"label": _("Item Code"),
				"fieldname": "item_code",
				"fieldtype": "Link",
				"options": "Item",
				"width": 100,
			},
			"sales_stage": {
				"label": _("Sales Stage"),
				"fieldname": "sales_stage",
				"fieldtype": "Link",
				"options": "Sales Stage",
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
			"brand": {
				"label": _("Brand"), 
				"fieldtype": "Link", 
				"options": "Brand", 
				"width": 100
			},
			"forecast": {
				"label": _("Forecast"),
				"fieldname": "forecast",
				"fieldtype": "Data",
				"width": 100,
			},
			"opportunity_type": {
				"label": _("Opportunity Type"),
				"fieldname": "opportunity_type",
				"fieldtype": "Data",
				"width": 100,
			},
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
			"base_rate": {
				"label": _("Sales Rate"),
				"fieldname": "sales_rate",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"buying_rate": {
				"label": _("Purchase Rate"),
				"fieldname": "purchase_rate",
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
			"buying_amount": {
				"label": _("Buying Amount"),
				"fieldname": "buying_amount",
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
				"label": _("Gross Profit"),
				"fieldname": "gross_profit",
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
			"customer": {
				"label": _("Customer"),
				"fieldname": "customer",
				"fieldtype": "Link",
				"options": "Customer",
				"width": 100,
			},
			"customer_group": {
				"label": _("Customer Group"),
				"fieldname": "customer_group",
				"fieldtype": "Link",
				"options": "Customer Group",
				"width": 100,
			},
			"territory": {
				"label": _("Territory"),
				"fieldname": "territory",
				"fieldtype": "Link",
				"options": "Territory",
				"width": 100,
			},
			"monthly": {
				"label": _("Monthly"),
				"fieldname": "monthly",
				"fieldtype": "Data",
				"width": 100,
			},
			"payment_term": {
				"label": _("Payment Term"),
				"fieldname": "payment_term",
				"fieldtype": "Link",
				"options": "Payment Term",
				"width": 170,
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
			"opportunity_or_item": "opportunity",
			"customer": "customer",
			"creation": "creation",
			"expected_date":"expected_date",
			"name1":"name1",
			"custom_committed_date":"custom_committed_date",
			"sales_person": "sales_person",
			"sales_stage":"sales_stage",
			"item_group": "item_group",
			"brand": "brand",
			"forecast":"forecast",
			"opportunity_type":"opportunity_type",
			"description": "description",
			"qty": "qty",
			"base_rate": "sales_rate",
			"buying_rate": "purchase_rate",
			"base_amount": "selling_amount",
			"buying_amount": "buying_amount",
			"margin":"margin",
			"orc":"orc",
			"gross_profit": "gross_profit",
			"gross_profit_percent": "gross_profit_%",
			
		}
	)


class GrossProfitGenerator(object):
	def __init__(self, filters=None):
		self.sle = {}
		self.data = []
		self.average_buying_rate = {}
		self.filters = frappe._dict(filters)
		self.load_opportunity_items()
		# self.get_delivery_notes()

		if filters.group_by == "Opportunity":
			self.group_items_by_opportunity()

		self.load_product_bundle()
		self.load_non_stock_items()
		self.get_returned_opportunity_items()
		self.process()

	def process(self):
		self.grouped = {}
		self.grouped_data = []

		self.currency_precision = cint(frappe.db.get_default("currency_precision")) or 3
		self.float_precision = cint(frappe.db.get_default("float_precision")) or 2

		grouped_by_opportunity = True if self.filters.get("group_by") == "Opportunity" else False

		if grouped_by_opportunity:
			buying_amount = 0
			margin = 0
			orc = 0
			# name1 = ""

		for row in reversed(self.si_list):
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
			if self.filters.get("group_by") == "Monthly":
				row.monthly = formatdate(row.creation, "MMM YYYY")

			if self.skip_row(row):
				continue

			row.base_amount = flt(row.base_net_amount, self.currency_precision)

			product_bundles = []
			
			if grouped_by_opportunity:
				# buying_amount = 0
				# margin = 0
				# orc = 0
				if row.indent == 1.0:
					buying_amount += row.buying_amount
					margin += flt(row.margin)
					orc += flt(row.orc)
					row.name1 = " "
				elif row.indent == 0.0:
					row.buying_amount = buying_amount
					row.margin = margin
					row.orc = orc
					buying_amount = 0
					margin = 0
					orc = 0

			# get buying rate
			if flt(row.qty):
				row.buying_rate = flt(row.buying_amount / flt(row.qty), self.float_precision)
				row.base_rate = flt(row.base_amount / flt(row.qty), self.float_precision)
			else:
				if self.is_not_opportunity_row(row):
					row.buying_rate, row.base_rate = 0.0, 0.0
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row.buying_amount)))		

			# calculate gross profit
			row.gross_profit = flt((flt(row.margin)- flt(row.orc)), self.currency_precision)
			if row.base_amount:
				row.gross_profit_percent = flt(
					(row.gross_profit / row.base_amount) * 100.0, self.currency_precision
				)
			else:
				row.gross_profit_percent = 0.0

			# add to grouped
			self.grouped.setdefault(row.get(scrub(self.filters.group_by)), []).append(row)

		if self.grouped:
			self.get_average_rate_based_on_group_by()

	def get_average_rate_based_on_group_by(self):
		for key in list(self.grouped):
			if self.filters.get("group_by") == "Opportunity":
				for i, row in enumerate(self.grouped[key]):
					if row.indent == 1.0:
						if (
							row.parent in self.returned_opportunitys and row.item_code in self.returned_opportunitys[row.parent]
						):
							returned_item_rows = self.returned_opportunitys[row.parent][row.item_code]
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
					opportunity_portion = 0

					if row.docstatus==1:
						opportunity_portion = 100
					elif row.opportunity_portion:
						opportunity_portion = row.opportunity_portion
					elif row.payment_amount:
						opportunity_portion = row.payment_amount * 100 / row.base_net_amount

					if i == 0:
						new_row = row
						self.set_average_based_on_payment_term_portion(new_row, row, opportunity_portion)
					else:
						new_row.qty += flt(row.qty)
						self.set_average_based_on_payment_term_portion(new_row, row, opportunity_portion, True)

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

	def set_average_based_on_payment_term_portion(self, new_row, row, opportunity_portion, aggr=False):
		cols = ["base_amount", "buying_amount","margin", "gross_profit"]
		for col in cols:
			if aggr:
				new_row[col] += row[col] * opportunity_portion / 100
			else:
				new_row[col] = row[col] * opportunity_portion / 100

	def is_not_opportunity_row(self, row):
		return (self.filters.get("group_by") == "Opportunity" and row.indent != 0.0) or self.filters.get(
			"group_by"
		) != "Opportunity"

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

	def get_returned_opportunity_items(self):
		returned_opportunitys = frappe.db.sql(
			"""
			select
				si.name, si_item.item_code, si_item.qty as qty, si_item.base_amount as base_amount
			from
				`tabOpportunity` si, `tabOpportunity Item` si_item
			where
				si.name = si_item.parent
		""",
			as_dict=1,
		)

		self.returned_opportunitys = frappe._dict()
		for inv in returned_opportunitys:
			self.returned_opportunitys.setdefault(inv.return_against, frappe._dict()).setdefault(
				inv.item_code, []
			).append(inv)

	def skip_row(self, row):
		if self.filters.get("group_by") != "Opportunity":
			if not row.get(scrub(self.filters.get("group_by", ""))):
				return True

		return False

	def get_buying_amount_from_product_bundle(self, row, product_bundle):
		buying_amount = 0.0
		for packed_item in product_bundle:
			if packed_item.get("parent_detail_docname") == row.item_row:
				packed_item_row = row.copy()
				packed_item_row.warehouse = packed_item.warehouse
				buying_amount += self.get_buying_amount(packed_item_row, packed_item.item_code)

		return flt(buying_amount, self.currency_precision)

	def calculate_buying_amount_from_sle(self, row, my_sle, parenttype, parent, item_row, item_code):
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
					return flt(row.qty) * self.get_average_buying_rate(row, item_code)
		return 0.0

	
	
	def get_average_buying_rate(self, row, item_code):
		args = row
		if item_code not in self.average_buying_rate:
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
			self.average_buying_rate[item_code] = flt(average_buying_rate)

		return self.average_buying_rate[item_code]

	def get_last_purchase_rate(self, item_code, row):
		purchase_order = frappe.qb.DocType("Purchase Order")
		purchase_order_item = frappe.qb.DocType("Purchase Order Item")

		query = (
			frappe.qb.from_(purchase_order_item)
			.inner_join(purchase_order)
			.on(purchase_order.name == purchase_order_item.parent)
			.select(purchase_order_item.base_rate / purchase_order_item.conversion_factor)
			.where(purchase_order.docstatus == 1)
			.where(purchase_order.creation <= self.filters.to_date)
			.where(purchase_order_item.item_code == item_code)
		)

		if row.project:
			query.where(purchase_order_item.project == row.project)

		if row.cost_center:
			query.where(purchase_order_item.cost_center == row.cost_center)

		query.opportunityby(purchase_order.creation, order=frappe.qb.desc)
		query.limit(1)
		last_purchase_rate = query.run()

		return flt(last_purchase_rate[0][0]) if last_purchase_rate else 0

	def load_opportunity_items(self):
		conditions = ""
		if self.filters.company:
			conditions += "`tabOpportunity`.company = %(company)s"

		if self.filters.timespan != "custom":
			# if self.filters.timespan == "this year":
			# 	date = frappe.db.get_value("Fiscal Year",{'auto_created':1},["year_start_date","year_end_date"])
			# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date)))
			if self.filters.based_on == "Creation":
				date_range = get_timespan_date_range(self.filters.timespan) 
				date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
				date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
				# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
				conditions += f" and `tabOpportunity`.creation >= '{date1}' and `tabOpportunity`.creation <= '{date2}'"
			else:
				date_range = get_timespan_date_range(self.filters.timespan) 
				date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
				date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
				# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
				conditions += f" and `tabOpportunity Item`.expected_date >= '{date1}' and `tabOpportunity Item`.expected_date <= '{date2}'"	

		if self.filters.timespan == "custom":
			if self.filters.based_on == "Creation":
				conditions += " and `tabOpportunity`.creation >= %(from_date)s and `tabOpportunity`.creation <= %(to_date)s"
			else:
				conditions += " and `tabOpportunity Item`.expected_date >= %(from_date)s and `tabOpportunity Item`.expected_date <= %(to_date)s"	
		
			
		if self.filters.forecast:
			conditions += " and `tabOpportunity Item`.forecast = %(forecast)s"
		if self.filters.opportunity_type:
			conditions += " and `tabOpportunity Item`.opportunity_type = %(opportunity_type)s"

		if self.filters.brand:
			conditions += " and `tabOpportunity Item`.brand in %(brand)s"	

		# conditions += " and (is_return = 0 or (is_return=1 and return_against is null))"
		if self.filters.customer:
			conditions += " and `tabOpportunity`.party_name in %(customer)s"
		
		if self.filters.contact_person:
			conditions += " and trc.user_name in %(contact_person)s"

		if self.filters.item_group:
			conditions += " and {0}".format(get_item_group_condition(self.filters.item_group))
		
		if self.filters.sales_person:
			conditions += """
				and exists(select 1
							from `tabSales Team` st
							where st.parent = `tabOpportunity`.name
							and   st.sales_person in %(sales_person)s)
			"""

		if self.filters.group_by == "Sales Person":
			sales_person_cols = ", sales.sales_person,  sales.incentives, ttd.target_amount as allocated_amount"
			sales_team_table = "left join `tabSales Team` sales on sales.parent = `tabOpportunity`.name LEFT JOIN 	`tabTarget Detail` ttd on ttd.parent = sales.sales_person"
		else:
			sales_person_cols = ",tst.sales_person"
			sales_team_table = "LEFT JOIN `tabSales Team` tst on tst.parent = `tabOpportunity`.name	"

		if self.filters.group_by == "Payment Term":
			payment_term_cols = """,if(`tabOpportunity`.docstatus = 0,
										'{0}',
										coalesce(schedule.payment_term, '{1}')) as payment_term,
									schedule.opportunity_portion,
									schedule.payment_amount """.format(
				_("Sales Return"), _("No Terms")
			)
			payment_term_table = """ left join `tabPayment Schedule` schedule on schedule.parent = `tabOpportunity`.name  """
		else:
			payment_term_cols = ""
			payment_term_table = ""

		if self.filters.get("opportunity"):
			conditions += " and `tabOpportunity`.name = %(opportunity)s"

		if self.filters.get("sales_stage"):
			conditions += " and `tabOpportunity Item`.sales_stage in %(sales_stage)s"	

		if self.filters.get("item_code"):
			conditions += " and `tabOpportunity Item`.item_code = %(item_code)s"

		
		self.si_list = frappe.db.sql(
			"""
			select
				`tabOpportunity`.name as parent,
				`tabOpportunity`.creation, 
				`tabOpportunity`.party_name as customer, 
				`tabOpportunity`.territory, `tabOpportunity Item`.item_code,
				`tabOpportunity Item`.forecast, `tabOpportunity Item`.opportunity_type,
				`tabOpportunity Item`.description,`tabOpportunity Item`.expected_date,
				`tabOpportunity`.custom_committed_date,`tabOpportunity`.name as name1,
				`tabOpportunity Item`.item_group,`tabOpportunity Item`.sales_stage,
				`tabOpportunity Item`.brand, `tabOpportunity Item`.item_name,
				`tabOpportunity Item`.qty as qty,
				`tabOpportunity Item`.rate as base_rate, `tabOpportunity Item`.amount as base_net_amount,
				(CASE when tpq.amount IS NULL  then 0 
				else tpq.amount END )as buying_amount,
				(CASE when tpq.amount IS NULL  then  0
				else `tabOpportunity Item`.amount - tpq.amount END )as margin,
				`tabSales Team`.sales_person,
				(CASE when `tabOpportunity Item`.orc = 1 then torc.commission_amount
				else 0.0 END) as orc,
				`tabOpportunity Item`.name as "item_row"
			from
				`tabOpportunity Item` Inner join `tabOpportunity` on `tabOpportunity`.name = `tabOpportunity Item`.parent 
				left join (SELECT tsq.name as name  , tsqi.item_code as item_code , tsqi.rate as rate, tsqi.description as description ,
				 tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity
				from `tabSupplier Quotation` tsq  
				left join (SELECT parent , item_code , rate, qty, amount, description   FROM `tabSupplier Quotation Item`  
				WHERE recommended_ =1) as tsqi on tsqi.parent = tsq.name 
				) as tpq on tpq.opportunity = `tabOpportunity`.name and `tabOpportunity Item`.item_code = tpq.item_code 
				and `tabOpportunity Item`.qty = tpq.qty and `tabOpportunity Item`.description = tpq.description
				LEFT JOIN 
				(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id, toi2.item_code as item_code , toi2.qty as qty ,
				toi2.rate as rate , toi2.description as description 
				FROM `tabORC Item` toi2 
				left join `tabORC List` tol on toi2.parent = tol.name
				WHERE tol.docstatus  = 1 and tol.status != "Duplicate") as torc on  torc.opportunity_id = `tabOpportunity Item`.parent and `tabOpportunity Item`.item_code = torc.item_code 
				and `tabOpportunity Item`.qty = torc.qty and `tabOpportunity Item`.rate = torc.rate and `tabOpportunity Item`.description = torc.description
				left join `tabSales Team` on `tabOpportunity`.name = `tabSales Team`.parent
				LEFT  JOIN `tabRenewal Contacts` trc on trc.parent = `tabOpportunity`.name
			where
				{conditions} {match_cond}
			GROUP BY `tabOpportunity Item`.name
			order by
				`tabOpportunity`.name desc
				""".format(
				conditions=conditions,
				sales_person_cols=sales_person_cols,
				sales_team_table=sales_team_table,
				payment_term_cols=payment_term_cols,
				payment_term_table=payment_term_table,
				match_cond=get_match_cond("Opportunity"),
			),
			self.filters,
			as_dict=1,
		)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(self.si_list)))

	
	def group_items_by_opportunity(self):
		"""
		Turns list of Opportunity Items to a tree of Opportunitys with their Items as children.
		"""

		grouped = OrderedDict()

		for row in self.si_list:
			# initialize list with a header row for each new parent
			
			grouped.setdefault(row.parent, [self.get_opportunity_row(row)]).append(
				row.update(
					{"indent": 1.0, "parent_opportunity": row.parent, "opportunity_or_item": row.item_code}
				)  # descendant rows will have indent: 1.0 or greater
			)
			

			# if item is a bundle, add it's components as seperate rows
			# if frappe.db.exists("Product Bundle", row.item_code):
			# 	bundled_items = self.get_bundle_items(row)
			# 	for x in bundled_items:
			# 		bundle_item = self.get_bundle_item_row(row, x)
			# 		grouped.get(row.parent).append(bundle_item)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(grouped)))			

		self.si_list.clear()

		for items in grouped.values():
			self.si_list.extend(items)

	def get_opportunity_row(self, row):
		# header row format
		return frappe._dict(
			{
				"parent_opportunity": "",
				"indent": 0.0,
				"opportunity_or_item": row.parent,
				"parent": None,
				"creation": row.creation,
				"expected_date":row.expected_date,
				"name1":row.name1,
				"custom_committed_date":row.custom_committed_date,
				"sales_person": None,
				"sales_stage":None,
				"customer": row.customer,
				"item_code": None,
				"item_name": None,
				"description": None,
				"item_group": None,
				"brand": None,
				"forecast":None,
				"opportunity_type":None,
				"qty": None,
				"item_row": None,
				"base_net_amount": frappe.db.get_value("Opportunity", row.parent, "total"),
			}
		)

	def get_bundle_items(self, product_bundle):
		return frappe.get_all(
			"Product Bundle Item", filters={"parent": product_bundle.item_code}, fields=["item_code", "qty"]
		)

	# def get_bundle_item_row(self, product_bundle, item):
	# 	item_name, description, item_group, brand = self.get_bundle_item_details(item.item_code)

	# 	return frappe._dict(
	# 		{
	# 			"parent_opportunity": product_bundle.item_code,
	# 			"indent": product_bundle.indent + 1,
	# 			"parent": None,
	# 			"opportunity_or_item": item.item_code,
	# 			"creation": product_bundle.creation,
	# 			"sales_person": None,
	# 			"sales_stage":None,
	# 			"customer": product_bundle.customer,
	# 			"customer_group": product_bundle.customer_group,
	# 			"item_code": item.item_code,
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
	# 				.opportunityby(sle.item_code)
	# 				.opportunityby(sle.warehouse,  sle.creation, opportunity=Order.desc)
	# 				.run(as_dict=True)
	# 			)

	# 			self.sle[(item_code, warehouse)] = res

	# 		return self.sle[(item_code, warehouse)]
	# 	return []

	def load_product_bundle(self):
		self.product_bundles = {}

		pki = qb.DocType("Packed Item")
		
		pki_query = (
			frappe.qb.from_(pki)
			.select(
				pki.parenttype,
				pki.parent,
				pki.parent_item,
				pki.item_code,
				pki.warehouse,
				(-1 * pki.qty).as_("total_qty"),
				pki.rate,
				(pki.rate * pki.qty).as_("base_amount"),
				pki.parent_detail_docname,
			)
			.where(pki.docstatus == 0)
		)
		
		for d in pki_query.run(as_dict=True):
			self.product_bundles.setdefault(d.parenttype, frappe._dict()).setdefault(
				d.parent, frappe._dict()
			).setdefault(d.parent_item, []).append(d)

	def load_non_stock_items(self):
		self.non_stock_items = frappe.db.sql_list(
			"""select name from tabItem
			where is_stock_item=0"""
		)




def get_report_summary(filters,columns, currency, data):
	closed_won, closed_lost, prospect = 0.0, 0.0, 0.0
	won_count,lost_count, prospect_count, total_count = 0,0,0, 0

	opportunity_seen = set()


	# Dictionary to store seen opportunities and track sales amounts
    # opportunity_seen = set()	

	for period in data:
		if filters.group_by == "Opportunity":
			
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(period)))
			if period.opportunity not in opportunity_seen:
				opportunity_seen.add(period.parent)  # Mark this parent Opportunity as processed
				total_count += 1

			if period.sales_stage == "Closed Won":
				closed_won += period.selling_amount
				
			if period.sales_stage == "Closed Lost":
				closed_lost += period.selling_amount
			if period.sales_stage == "Prospect":
				prospect += period.selling_amount		
				
		
			
		

	won_label = ("Closed Won")
	lost_label = _("Closed Lost")
	prospect_label = _("Open")
	

	return [
		{"value": round(closed_won,2),"indicator": "Blue", "label": won_label, "datatype": "Currency"},
		
		{"value":round(closed_lost,2),"indicator": "Red", "label": lost_label, "datatype": "Currency"},
		{"value":round(prospect,2),"indicator": "Green", "label": prospect_label , "datatype": "Currency"},
		{"value": total_count, "indicator": "Gray", "label": "total_label", "datatype": "Int"}
		
		
	]

# def get_report_summary(filters, columns, currency, data):
#     closed_won, closed_lost, prospect = 0.0, 0.0, 0.0
#     won_count, lost_count, prospect_count, total_count = 0, 0, 0, 0

#     # Dictionary to store seen opportunities and track sales amounts
#     opportunity_seen = set()

#     for period in data:
# 	    frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(period)))
#         # Summing the selling amount based on Opportunity Items
# 		if period.parent not in opportunity_seen:
# 			opportunity_seen.add(period.parent)  # Mark this parent Opportunity as processed
#             total_count += 1  # Count unique parent Opportunity

#             # Based on Opportunity's `sales_stage`, accumulate the selling amount from Opportunity Item
#             if period.sales_stage == "Closed Won":
#                 closed_won += period.selling_amount  # Sum selling_amount from Opportunity Item
#                 won_count += 1  # Count closed won based on parent Opportunity

#             elif period.sales_stage == "Closed Lost":
#                 closed_lost += period.selling_amount  # Sum selling_amount from Opportunity Item
#                 lost_count += 1  # Count closed lost based on parent Opportunity

#             elif period.sales_stage == "Prospect":
#                 prospect += period.selling_amount  # Sum selling_amount from Opportunity Item
#                 prospect_count += 1  # Count prospects based on parent Opportunity

#     # Labels with counts
#     won_label = _("Closed Won") + " (" + str(won_count) + ")"
#     lost_label = _("Closed Lost") + " (" + str(lost_count) + ")"
#     prospect_label = _("Open") + " (" + str(prospect_count) + ")"
#     total_label = _("Total Opportunities") + " (" + str(total_count) + ")"

#     # Return the summary data
#     return [
#         {"value": round(closed_won, 2), "indicator": "Blue", "label": won_label, "datatype": "Currency"},
#         {"value": round(closed_lost, 2), "indicator": "Red", "label": lost_label, "datatype": "Currency"},
#         {"value": round(prospect, 2), "indicator": "Green", "label": prospect_label, "datatype": "Currency"},
#         {"value": total_count, "indicator": "Gray", "label": total_label, "datatype": "Int"}  # Total unique opportunities count
#     ]


# def get_chart_data(filters,columns, data):
# 	brand_wise_sales_map = {}
# 	labels, datapoints_sales = [], []

# 	for row in data:
# 		if filters.group_by == "Opportunity" and row.indent == 1.0:
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


def get_chart_data(filters, columns, data):
	prospecting , closed_lost, closed_won = 0.0, 0.0, 0.0
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	# labels = ["prospecting" , "proposal_price_quote", "negotiation_review" , "closed_lost", "closed_won", "dead"]	
	labels = ["Sales Stage"]

	for p in data:
		# frappe.msgprint(p)
		if p.sales_stage == "Prospecting":
			prospecting += flt(p.selling_amount)
		
		if p.sales_stage == "Closed Lost":
			closed_lost += flt(p.selling_amount)
		if p.sales_stage == "Closed Won":
			closed_won += flt(p.selling_amount)
				
		

	datasets = [{"name":"Prospecting","values":[0.0]},
	{"name":"Closed Lost","values":[0.0]},{"name":"Closed Won","values":[0.0]}
	]
	
	if prospecting:
		datasets[0]["values"] = [prospecting]
	
	if closed_lost:
		datasets[1]["values"]= [closed_lost]
	if closed_won:
		datasets[2]["values"] = [closed_won]
	
	
	

	return {
        'title':"Chart Based On Sales Stage",
        'data':{
            'labels':labels,
            'datasets':datasets
        },
        'type':'bar',
        'height':300,
		'fieldtype':'Currency',
		'colors':["#FBC543",  "#007c01", "#de0a26"],
    }


