# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt
from collections import OrderedDict

import frappe
from frappe import _, qb, scrub
from frappe.query_builder import Order
from frappe.utils import cint, flt, formatdate

from datetime import datetime

# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
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
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(gross_profit_data.si_list)))

	data = []

	group_wise_columns = frappe._dict(
		{
			"order": [
				"order_or_item",
				"customer",
				"transaction_date",
				"item_code",
				"item_name",
				"item_group",
				"brand",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"technical_value",
				"mdf",
				"net_profit",
				"sales_person",
				"supplier",
				"supplier_quotation",
				
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
				"margin",
				"orc",
				"buying_amount",
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
				"orc",
				"gross_profit",
				"gross_profit_percent",
			],
			"customer": [
				"customer",
				"customer_group",
				"qty",
				"base_rate",
				"buying_rate",
				"base_amount",
				"buying_amount",
				"margin",
				"orc",
				"gross_profit",
				"sales_person",
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
				"allocated_amount",
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
	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)

	if filters.group_by == "Order":
		get_data_when_grouped_by_order(columns, gross_profit_data, filters, group_wise_columns, data)
		report_summary = get_report_summary(filters,columns, currency, data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

		chart = get_chart_data(filters, columns, data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))	

		return columns, data, None,chart, report_summary

	else:
		get_data_when_not_grouped_by_order(gross_profit_data, filters, group_wise_columns, data)
		return columns, data, None


def get_data_when_grouped_by_order(
	columns, gross_profit_data, filters, group_wise_columns, data
):
	column_names = get_column_names()

	# to display item as Item Code: Item Name
	columns[0] = "Sales Order:Link/Item:300"
	# removing Item Code and Item Name columns
	del columns[4:6]

	for src in gross_profit_data.si_list:
		
		row = frappe._dict()
		row.indent = src.indent
		row.parent_order = src.parent_order
		row.currency = filters.currency

		for col in group_wise_columns.get(scrub(filters.group_by)):
			
			row[column_names[col]] = src.get(col)

		data.append(row)


def get_data_when_not_grouped_by_order(gross_profit_data, filters, group_wise_columns, data):
	for src in gross_profit_data.grouped_data:
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
				"label": _("Sales Order"),
				"fieldname": "parent_order",
				"fieldtype": "Link",
				"options": "Sales Order",
				"width": 120,
			},
			"order_or_item": {
				"label": _("Sales Order"),
				"fieldtype": "Link",
				"options": "Sales Order",
				"width": 120,
			},
			"transaction_date": {
				"label": _("Transaction Date"),
				"fieldname": "transaction_date",
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
			"base_rate": {
				"label": _("Avg. Selling Rate"),
				"fieldname": "avg._selling_rate",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"buying_rate": {
				"label": _("P.Rate"),
				"fieldname": "valuation_rate",
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
				"label": _("P.Amount"),
				"fieldname": "buying_amount",
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
			"net_profit": {
				"label": _("Net Profit"),
				"fieldname": "net_profit",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"technical_value": {
				"label": _("Technical Value"),
				"fieldname": "technical_value",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 100,
			},
			"mdf": {
				"label": _("MDF"),
				"fieldname": "mdf",
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
			"customer": {
				"label": _("Customer"),
				"fieldname": "customer",
				"fieldtype": "Link",
				"options": "Customer",
				"width": 100,
			},
			"supplier": {
				"label": _("Supplier"),
				"fieldname": "supplier",
				"fieldtype": "Link",
				"options": "Supplier",
				"width": 100,
			},
			"supplier_quotation": {
				"label": _("Supplier Quotation"),
				"fieldname": "supplier_quotation",
				"fieldtype": "Link",
				"options": "Supplier Quotation",
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
			"order_or_item": "sales_order",
			"customer": "customer",
			"customer_group": "customer_group",
			"sales_person": "sales_person",
			"transaction_date": "transaction_date",
			"item_code": "item_code",
			"item_name": "item_name",
			"item_group": "item_group",
			"brand": "brand",
			"qty": "qty",
			"base_rate": "avg._selling_rate",
			"buying_rate": "valuation_rate",
			"base_amount": "selling_amount",
			"buying_amount": "buying_amount",
			"margin":"margin",
			"orc":"orc",
			"gross_profit": "gross_profit",
			"technical_value":"technical_value",
			"mdf":"mdf",
			"net_profit":"net_profit",
			"gross_profit_percent": "gross_profit_%",
			"project": "project",
			"supplier":"supplier",
			"supplier_quotation":"supplier_quotation",
		}
	)


class GrossProfitGenerator(object):
	def __init__(self, filters=None):
		self.sle = {}
		self.data = []
		self.average_buying_rate = {}
		self.filters = frappe._dict(filters)
		self.load_order_items()
		# self.get_delivery_notes()

		if filters.group_by == "Order":
			self.group_items_by_order()

		# self.load_product_bundle()
		# self.load_non_stock_items()
		self.get_returned_order_items()
		self.process()

	def process(self):
		self.grouped = {}
		self.grouped_data = []

		self.currency_precision = cint(frappe.db.get_default("currency_precision")) or 3
		self.float_precision = cint(frappe.db.get_default("float_precision")) or 2

		grouped_by_order = True if self.filters.get("group_by") == "Order" else False

		if grouped_by_order:
			buying_amount = 0
			margin = 0
			orc = 0

		for row in reversed(self.si_list):
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
			if self.filters.get("group_by") == "Monthly":
				row.monthly = formatdate(row.transaction_date, "MMM YYYY")

			if self.skip_row(row):
				continue

			row.base_amount = flt(row.base_net_amount, self.currency_precision)

			product_bundles = []
			

			if grouped_by_order:
				if row.indent == 1.0:
					buying_amount += flt(row.buying_amount)
					margin += flt(row.margin)
					orc += flt(row.orc)
				elif row.indent == 0.0:
					row.buying_amount = buying_amount
					row.margin = margin
					row.orc = orc
					buying_amount = 0
					margin = 0
					orc = 0

			# get buying rate
			if flt(row.qty):
				row.buying_rate = flt(flt(row.buying_amount) / flt(row.qty), self.float_precision)
				row.base_rate = flt(row.base_amount / flt(row.qty), self.float_precision)
			else:
				if self.is_not_order_row(row):
					row.buying_rate, row.base_rate = 0.0, 0.0
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row.buying_amount)))		

			# calculate gross profit
			row.gross_profit = flt((flt(row.margin)- flt(row.orc)), self.currency_precision)

			#calculate technical value
			row.technical_value = flt((flt(row.gross_profit)*0.1), self.currency_precision)

			#calculate mdf
			row.mdf = flt((flt(row.gross_profit)*0.1), self.currency_precision)

			#calculate net profit
			row.net_profit = flt((flt(row.gross_profit)- (flt(row.technical_value)+ flt(row.mdf))), self.currency_precision)

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
			if self.filters.get("group_by") == "Order":
				for i, row in enumerate(self.grouped[key]):
					if row.indent == 1.0:
						if (
							row.parent in self.returned_orders and row.item_code in self.returned_orders[row.parent]
						):
							returned_item_rows = self.returned_orders[row.parent][row.item_code]
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
					order_portion = 0

					if row.docstatus==1:
						order_portion = 100
					elif row.order_portion:
						order_portion = row.order_portion
					elif row.payment_amount:
						order_portion = row.payment_amount * 100 / row.base_net_amount

					if i == 0:
						new_row = row
						self.set_average_based_on_payment_term_portion(new_row, row, order_portion)
					else:
						new_row.qty += flt(row.qty)
						self.set_average_based_on_payment_term_portion(new_row, row, order_portion, True)

				new_row = self.set_average_rate(new_row)
				self.grouped_data.append(new_row)
			else:
				for i, row in enumerate(self.grouped[key]):
					if i == 0:
						new_row = row
					else:
						new_row.qty += flt(row.qty)
						new_row.buying_amount = flt(new_row.buying_amount) + flt(row.buying_amount, self.currency_precision)
						new_row.base_amount += flt(row.base_amount, self.currency_precision)
						new_row.margin = flt(new_row.margin) + flt(row.margin)
						new_row.orc = flt(new_row.orc) + flt(row.orc)
						if self.filters.get("group_by") == "Sales Person":
							new_row.allocated_amount = flt(0, self.currency_precision)
							# new_row.margin = flt(new_row.selling_amount) - flt(new_row.buying_amount, self.currency_precision)
				new_row = self.set_average_rate(new_row)
				self.grouped_data.append(new_row)

	def set_average_based_on_payment_term_portion(self, new_row, row, order_portion, aggr=False):
		cols = ["base_amount", "buying_amount", "gross_profit"]
		for col in cols:
			if aggr:
				new_row[col] += row[col] * order_portion / 100
			else:
				new_row[col] = row[col] * order_portion / 100

	def is_not_order_row(self, row):
		return (self.filters.get("group_by") == "Order" and row.indent != 0.0) or self.filters.get(
			"group_by"
		) != "Order"

	def set_average_rate(self, new_row):
		self.set_average_gross_profit(new_row)
		new_row.buying_rate = (
			flt(flt(new_row.buying_amount) / flt(new_row.qty), self.float_precision) if new_row.qty else 0
		)
		new_row.base_rate = (
			flt(flt(new_row.base_amount) / flt(new_row.qty), self.float_precision) if new_row.qty else 0
		)
		return new_row

	def set_average_gross_profit(self, new_row):
		# new_row.margin = flt(new_row.selling_amount) - flt(new_row.buying_amount, self.currency_precision)
		new_row.gross_profit = flt((flt(new_row.margin) - flt(new_row.orc)), self.currency_precision)
		new_row.gross_profit_percent = (
			flt(((new_row.gross_profit / new_row.base_amount) * 100.0), self.currency_precision)
			if new_row.base_amount
			else 0
		)

	def get_returned_order_items(self):
		returned_orders = frappe.db.sql(
			"""
			select
				si.name, si_item.item_code, si_item.stock_qty as qty, si_item.base_net_amount as base_amount
			from
				`tabSales Order` si, `tabSales Order Item` si_item
			where
				si.name = si_item.parent
				and si.docstatus = 1
		""",
			as_dict=1,
		)

		self.returned_orders = frappe._dict()
		for inv in returned_orders:
			self.returned_orders.setdefault(inv.return_against, frappe._dict()).setdefault(
				inv.item_code, []
			).append(inv)

	def skip_row(self, row):
		if self.filters.get("group_by") != "Order":
			if not row.get(scrub(self.filters.get("group_by", ""))):
				return True

		return False

	
	

	def load_order_items(self):
		conditions = ""
		if self.filters.company:
			conditions += " and `tabSales Order`.company in %(company)s"
		if self.filters.timespan != "custom":
			
			date_range = get_timespan_date_range(self.filters.timespan) 
			date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
			date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
			conditions += f" and `tabSales Order`.transaction_date >= '{date1}' and `tabSales Order`.transaction_date <= '{date2}'"

		if self.filters.timespan == "custom":
			
			conditions += " and `tabSales Order`.transaction_date >= %(from_date)s and `tabSales Order`.transaction_date <= %(to_date)s"
		
		# conditions += " and (is_return = 0 or (is_return=1 and return_against is null))"

		# if self.filters.item_group:
		# 	conditions += " and {0}".format(get_item_group_condition(self.filters.item_group))

		if self.filters.sales_person:
			conditions += """
				and exists(select 1
							from `tabSales Team` st
							where st.parent = `tabSales Order`.name
							and   st.sales_person in  %(sales_person)s)
			"""

		if self.filters.group_by == "Sales Person":
			sales_person_cols = ", sales.sales_person, sales.allocated_amount, sales.incentives"
			sales_team_table = "left join `tabSales Team` sales on sales.parent = `tabSales Order`.name"
		else:
			sales_person_cols = ""
			sales_team_table = ""

		if self.filters.group_by == "Payment Term":
			payment_term_cols = """,if(`tabSales Order`.docstatus = 1,
										'{0}',
										coalesce(schedule.payment_term, '{1}')) as payment_term,
									schedule.order_portion,
									schedule.payment_amount """.format(
				_("Sales Return"), _("No Terms")
			)
			payment_term_table = """ left join `tabPayment Schedule` schedule on schedule.parent = `tabSales Order`.name  """
		else:
			payment_term_cols = ""
			payment_term_table = ""

		if self.filters.get("sales_order"):
			conditions += " and `tabSales Order`.name = %(sales_order)s"

		if self.filters.get("customer"):
			conditions += " and `tabSales Order`.customer in %(customer)s"

		if self.filters.get("supplier"):
			conditions += " and top.supplier in %(supplier)s"		

		if self.filters.get("item_code"):
			conditions += " and `tabSales Order Item`.item_code = %(item_code)s"
		if self.filters.get("item_group"):
		    conditions += " and `tabSales Order Item`.item_group in %(item_group)s"

		if self.filters.get("brand"):
		    conditions += " and `tabSales Order Item`.brand in %(brand)s"	
        
		if self.filters.get("value"):
			if self.filters.get("value") == "Zero Values":
				conditions += " and `tabSales Order`.cof_id is Null"
			else:
				conditions += " and `tabSales Order`.cof_id is Not Null"

		if self.filters.get("user") :
			if 'COF Approval' in frappe.get_roles(frappe.session.user) and 'Administrator' not in frappe.get_roles(frappe.session.user) and 'System Manager' not in frappe.get_roles(frappe.session.user):
			    conditions += " and tu.full_name = %(user)s"

		self.si_list = frappe.db.sql(
			"""
			select
				`tabSales Order Item`.parent,
				`tabSales Order`.transaction_date, 
				`tabSales Order`.project, 
				`tabSales Order`.customer, `tabSales Order`.customer_group,
				`tabSales Order`.territory, `tabSales Order Item`.item_code,
				`tabSales Order Item`.item_name, `tabSales Order Item`.description,
				`tabSales Order Item`.warehouse, `tabSales Order Item`.item_group,
				`tabSales Order Item`.brand, 
				`tabSales Order Item`.stock_qty as qty,
				`tabSales Order Item`.base_net_rate, `tabSales Order Item`.base_net_amount,
				(CASE when top.p_qty IS NULL  then 0 
				else top.p_qty END )as purchase_qty ,
				(CASE when top.p_rate IS NULL and `tabSales Order`.cof_id is NULL  then 0 
				when top.p_rate IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.purchase_rate
				else top.p_rate END )as buying_rate,
				(CASE when top.p_amount IS NULL and `tabSales Order`.cof_id is NULL then 0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.purchase_amount
				else top.p_amount END )as buying_amount,
				(CASE when top.p_amount IS NULL  and `tabSales Order`.cof_id is NULL  then  0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL and tcofi.purchase_amount = 0  then  0
				when top.p_amount IS NULL and `tabSales Order`.cof_id is not NULL and tcofi.purchase_amount > 0 then  `tabSales Order Item`.base_net_amount - tcofi.purchase_amount
				else `tabSales Order Item`.base_net_amount - top.p_amount END )as margin,
				(CASE when top.orc = 1 then torc.commission_amount
				else 0 END) as orc,
				(CASE 
				when top.p_amount  IS NULL and torc.commission_amount IS not NULL  then `tabSales Order Item`.amount - torc.commission_amount
				when top.p_amount  IS NULL and torc.commission_amount IS NULL  then 0
				WHEN top.p_amount is not NULL and torc.commission_amount IS not NULL then (`tabSales Order Item`.amount - top.p_amount) - torc.commission_amount
				WHEN top.p_amount is not NULL and torc.commission_amount IS NULL then `tabSales Order Item`.amount - top.p_amount
				else 0  END )as profit ,
				tst.sales_person,				
				(CASE when top.supplier IS NULL and `tabSales Order`.cof_id is NULL  then NULL
				when top.supplier IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.supplier
				else top.supplier END )as supplier,
				(CASE when top.sq_name IS NULL and `tabSales Order`.cof_id is NULL  then NULL
				when top.sq_name IS NULL and `tabSales Order`.cof_id is not NULL then tcofi.supplier_quotation
				else top.sq_name END )as supplier_quotation,
				tu.full_name as user
				{sales_person_cols}
				{payment_term_cols}
			from
			    `tabSales Order` inner join `tabSales Order Item` on `tabSales Order Item`.parent = `tabSales Order`.name
				LEFT JOIN `tabCustomer Order Form Item` tcofi on `tabSales Order`.cof_id = tcofi.parent and tcofi.item_code =`tabSales Order Item`.item_code
				and `tabSales Order Item`.rate = tcofi.rate and `tabSales Order Item`.qty = tcofi.qty and `tabSales Order Item`.description = tcofi.description 
				Left join `tabQuotation Item` tqi on `tabSales Order Item`.prevdoc_docname = tqi.parent 
				and `tabSales Order Item`.item_code = tqi.item_code and `tabSales Order Item`.qty = tqi.qty and `tabSales Order Item`.rate = tqi.rate
				left join (SELECT toi.parent as opportunity,toi.name , toi.item_code as s_item_code , toi.qty as s_qty ,
				tpq.name as sq_name, tpq.supplier as supplier,tpq.item_code as sq_item_code,
				toi.rate as s_rate , tpq.rate as p_rate ,tpq.qty as p_qty, tpq.amount as p_amount, toi.orc as orc, toi.description as description 
				from 
				`tabOpportunity Item` toi
				left join (SELECT tsq.name as name, tsq.supplier as supplier  , tsqi.item_code as item_code , tsqi.rate as rate ,
				 tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity, tsqi.description as description
				from `tabSupplier Quotation` tsq 
				left join (SELECT parent , item_code , rate, qty, amount, description   FROM `tabSupplier Quotation Item`  WHERE recommended_ =1
				) as tsqi on tsqi.parent = tsq.name 
				) as tpq on tpq.opportunity = toi.parent and toi.item_code = tpq.item_code and toi.qty = tpq.qty and tpq.description = toi.description
				) as top on top.opportunity = tqi.prevdoc_docname and top.s_item_code = tqi.item_code and top.s_qty = tqi.qty and top.description = tqi.description
				LEFT JOIN 
				(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id,
				toi2.item_code as item_code , toi2.qty as qty ,
				toi2.rate as rate , toi2.description as description 
				FROM `tabORC Item` toi2 
				left join `tabORC List` tol on toi2.parent = tol.name
				WHERE tol.docstatus  = 1 and tol.status != "Duplicate") as torc on  torc.opportunity_id = top.opportunity and top.s_item_code = torc.item_code 
				and top.s_qty = torc.qty and top.s_rate = torc.rate and top.description = torc.description
				LEFT JOIN `tabSales Team` tst on `tabSales Order Item`.parent = tst.parent
				LEFT JOIN `tabUser` tu on tst.sales_person = tu.full_name
				{sales_team_table}
				{payment_term_table}
			where
				`tabSales Order`.docstatus=1  {conditions} {match_cond}
			GROUP BY
			     	`tabSales Order Item`.name
			order by
				`tabSales Order`.name desc""".format(
				conditions=conditions,
				sales_person_cols=sales_person_cols,
				sales_team_table=sales_team_table,
				payment_term_cols=payment_term_cols,
				payment_term_table=payment_term_table,
				match_cond=get_match_cond("Sales Order"),
			),
			self.filters,
			as_dict=1,
		)

	

	def group_items_by_order(self):
		"""
		Turns list of Sales Order Items to a tree of Sales Orders with their Items as children.
		"""

		grouped = OrderedDict()

		for row in self.si_list:
			# initialize list with a header row for each new parent
			grouped.setdefault(row.parent, [self.get_order_row(row)]).append(
				row.update(
					{"indent": 1.0, "parent_order": row.parent, "order_or_item": row.item_code}
				)  # descendant rows will have indent: 1.0 or greater
			)

			# if item is a bundle, add it's components as seperate rows
			if frappe.db.exists("Product Bundle", row.item_code):
				bundled_items = self.get_bundle_items(row)
				for x in bundled_items:
					bundle_item = self.get_bundle_item_row(row, x)
					grouped.get(row.parent).append(bundle_item)

		self.si_list.clear()

		for items in grouped.values():
			self.si_list.extend(items)

	def get_order_row(self, row):
		# header row format
		return frappe._dict(
			{
				"parent_order": "",
				"indent": 0.0,
				"order_or_item": row.parent,
				"parent": None,
				"transaction_date": row.transaction_date,
				"project": row.project,
				"customer": row.customer,
				"customer_group": row.customer_group,
				"item_code": None,
				"item_name": None,
				"item_group": None,
				"brand": None,
				"qty": None,
				"item_row": None,
				"base_net_amount": frappe.db.get_value("Sales Order", row.parent, "base_net_total"),
				"supplier":None,
				"supplier_quotation":None,
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
				"parent_order": product_bundle.item_code,
				"indent": product_bundle.indent + 1,
				"parent": None,
				"order_or_item": item.item_code,
				"transaction_date": product_bundle.transaction_date,
				"project": product_bundle.project,
				"customer": product_bundle.customer,
				"customer_group": product_bundle.customer_group,
				"item_code": item.item_code,
				"item_name": item_name,
				"item_group": item_group,
				"brand": brand,
				"qty": (flt(product_bundle.qty) * flt(item.qty)),
				"item_row": None,
				"supplier":product_bundle.supplier,
				"supplier_quotation":product_bundle.supplier_quotation,
				
			}
		)

	def get_bundle_item_details(self, item_code):
		return frappe.db.get_value(
			"Item", item_code, ["item_name", "description", "item_group", "brand"]
		)

	def get_stock_ledger_entries(self, item_code, warehouse):
		if item_code and warehouse:
			if (item_code, warehouse) not in self.sle:
				sle = qb.DocType("Stock Ledger Entry")
				res = (
					qb.from_(sle)
					.select(
						sle.item_code,
						sle.voucher_type,
						sle.voucher_no,
						sle.voucher_detail_no,
						sle.stock_value,
						sle.warehouse,
						sle.actual_qty.as_("qty"),
					)
					.where(
						(sle.company == self.filters.company)
						& (sle.item_code == item_code)
						& (sle.warehouse == warehouse)
						& (sle.is_cancelled == 0)
					)
					.orderby(sle.item_code)
					.orderby(sle.warehouse,  sle.creation, order=Order.desc)
					.run(as_dict=True)
				)

				self.sle[(item_code, warehouse)] = res

			return self.sle[(item_code, warehouse)]
		return []

	


def get_report_summary(filters,columns, currency, data):
	sales_amount, buying_amount,orc, profit,net_profit = 0.0, 0.0, 0.0, 0.0,0.0
	for period in data:
		if period.indent == 0.0 and filters.group_by =="Order":
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(period.selling_amount)))
			sales_amount += flt(period.selling_amount)
			buying_amount += flt(period.buying_amount)
			profit += flt(period.gross_profit)
			net_profit += flt(period.net_profit)
			orc += flt(period.orc)
		
			
		

	sales_label = ("Sales Amount")
	buying_label = _("Purchase Amount")
	profit_label = _("Profit")
	net_label = _("Net Profit")
	

	return [
		{"value": round(sales_amount,2),"indicator": "Blue", "label": sales_label, "datatype": "Currency"},
		
		{"value":round(buying_amount,2),"indicator": "Red", "label": buying_label, "datatype": "Currency"},
		{"value":round(orc,2),"indicator": "Blue", "label": _("ORC Amount"), "datatype": "Currency"},
		{"value":round(profit,2),"indicator": "Green", "label": profit_label, "datatype": "Currency"},
		{"value":round(net_profit,2),"indicator": "Green", "label": net_label, "datatype": "Currency"}
		
		
		
	]
	


def get_chart_data(filters, columns, data):
    # date_range = get_timespan_date_range(filters.get("timespan")) 
    # date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").strftime("%d-%m-%Y")
    # date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").strftime("%d-%m-%Y")
    sales_amount,purchase_amount, count = 0.0, 0.0,0
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
	# labels = ["sales_amount" , "purchase_amount"]	
    labels = [f"Sales Chart"]

    for p in data:
	    if p.indent == 0.0 and filters.group_by =="Order":
		    count += 1
		    sales_amount += flt(p.selling_amount)
		    purchase_amount += flt(p.buying_amount ) 

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(count)))		  			
		

    datasets = [{"name":"Sales Amount","values":[0.0]},
    {"name":"Purchase Amount", "values":[0.0]}
    ]
	
	
    datasets[0]["values"] = [sales_amount]
    datasets[1]["values"] = [purchase_amount]
    
    return {
        'title':"Chart",
        'data':{
            'labels':labels,
            'datasets':datasets
        },
        'type':'bar',
        'height':300,
		'width':1000,
		'fieldtype':'Currency',
		'colors':["#00a9b5","#FBC543", "#82C272", "#9C2162"],
    }
