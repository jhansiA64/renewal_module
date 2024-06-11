# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt
from collections import OrderedDict

import frappe
from frappe import _, qb, scrub
from frappe.query_builder import Order
from frappe.utils import cint, flt, formatdate

from datetime import datetime

# from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
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
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(gross_profit_data.si_list)))

	data = []

	group_wise_columns = frappe._dict(
		{
			"invoice": [
				"invoice_or_item",
				"customer",
				"posting_date",
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
				"sales_person",
				"supplier",
				"purchase_invoice",
				
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

	if filters.group_by == "Invoice":
		get_data_when_grouped_by_invoice(columns, gross_profit_data, filters, group_wise_columns, data)
		report_summary = get_report_summary(filters,columns, currency, data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(report_summary)))

		chart = get_chart_data(filters, columns, data)
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))	

		return columns, data, None,chart, report_summary

	else:
		get_data_when_not_grouped_by_invoice(gross_profit_data, filters, group_wise_columns, data)
		return columns, data, None


def get_data_when_grouped_by_invoice(
	columns, gross_profit_data, filters, group_wise_columns, data
):
	column_names = get_column_names()

	# to display item as Item Code: Item Name
	columns[0] = "Sales Invoice:Link/Item:300"
	# removing Item Code and Item Name columns
	del columns[4:6]

	for src in gross_profit_data.si_list:
		
		row = frappe._dict()
		row.indent = src.indent
		row.parent_invoice = src.parent_invoice
		row.currency = filters.currency

		for col in group_wise_columns.get(scrub(filters.group_by)):
			
			row[column_names[col]] = src.get(col)

		data.append(row)


def get_data_when_not_grouped_by_invoice(gross_profit_data, filters, group_wise_columns, data):
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
				"label": _("Sales Invoice"),
				"fieldname": "parent_invoice",
				"fieldtype": "Link",
				"options": "Sales Invoice",
				"width": 120,
			},
			"invoice_or_item": {
				"label": _("Sales Invoice"),
				"fieldtype": "Link",
				"options": "Sales Invoice",
				"width": 120,
			},
			"posting_date": {
				"label": _("Transaction Date"),
				"fieldname": "posting_date",
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
				"label": _("P Rate"),
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
				"label": _("Buying Amount"),
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
			"purchase_invoice": {
				"label": _("Supplier Quotation"),
				"fieldname": "purchase_invoice",
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
			"invoice_or_item": "sales_invoice",
			"customer": "customer",
			"customer_group": "customer_group",
			"sales_person": "sales_person",
			"posting_date": "posting_date",
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
			"gross_profit_percent": "gross_profit_%",
			"project": "project",
			"supplier":"supplier",
			"purchase_invoice":"purchase_invoice",
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

		if filters.group_by == "Invoice":
			self.group_items_by_invoice()

		# self.load_product_bundle()
		# self.load_non_stock_items()
		self.get_returned_invoice_items()
		self.process()

	def process(self):
		self.grouped = {}
		self.grouped_data = []

		self.currency_precision = cint(frappe.db.get_default("currency_precision")) or 3
		self.float_precision = cint(frappe.db.get_default("float_precision")) or 2

		grouped_by_invoice = True if self.filters.get("group_by") == "Invoice" else False

		if grouped_by_invoice:
			buying_amount = 0
			margin = 0
			orc = 0

		for row in reversed(self.si_list):
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(row)))
			if self.filters.get("group_by") == "Monthly":
				row.monthly = formatdate(row.posting_date, "MMM YYYY")

			if self.skip_row(row):
				continue

			row.base_amount = flt(row.base_net_amount, self.currency_precision)

			product_bundles = []
			

			if grouped_by_invoice:
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
				if self.is_not_invoice_row(row):
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
			if self.filters.get("group_by") == "Invoice":
				for i, row in enumerate(self.grouped[key]):
					if row.indent == 1.0:
						if (
							row.parent in self.returned_invoices and row.item_code in self.returned_invoices[row.parent]
						):
							returned_item_rows = self.returned_invoices[row.parent][row.item_code]
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
					invoice_portion = 0

					if row.docstatus==1:
						invoice_portion = 100
					elif row.invoice_portion:
						invoice_portion = row.invoice_portion
					elif row.payment_amount:
						invoice_portion = row.payment_amount * 100 / row.base_net_amount

					if i == 0:
						new_row = row
						self.set_average_based_on_payment_term_portion(new_row, row, invoice_portion)
					else:
						new_row.qty += flt(row.qty)
						self.set_average_based_on_payment_term_portion(new_row, row, invoice_portion, True)

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
							new_row.allocated_amount += flt(row.allocated_amount, self.currency_precision)
				new_row = self.set_average_rate(new_row)
				self.grouped_data.append(new_row)

	def set_average_based_on_payment_term_portion(self, new_row, row, invoice_portion, aggr=False):
		cols = ["base_amount", "buying_amount", "gross_profit"]
		for col in cols:
			if aggr:
				new_row[col] += row[col] * invoice_portion / 100
			else:
				new_row[col] = row[col] * invoice_portion / 100

	def is_not_invoice_row(self, row):
		return (self.filters.get("group_by") == "Invoice" and row.indent != 0.0) or self.filters.get(
			"group_by"
		) != "Invoice"

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
		new_row.gross_profit = flt((flt(new_row.margin) - flt(new_row.orc)), self.currency_precision)
		new_row.gross_profit_percent = (
			flt(((new_row.gross_profit / new_row.base_amount) * 100.0), self.currency_precision)
			if new_row.base_amount
			else 0
		)

	def get_returned_invoice_items(self):
		returned_invoices = frappe.db.sql(
			"""
			select
				si.name, si_item.item_code, si_item.stock_qty as qty, si_item.base_net_amount as base_amount
			from
				`tabSales Invoice` si, `tabSales Invoice Item` si_item
			where
				si.name = si_item.parent
				and si.docstatus = 1
		""",
			as_dict=1,
		)

		self.returned_invoices = frappe._dict()
		for inv in returned_invoices:
			self.returned_invoices.setdefault(inv.return_against, frappe._dict()).setdefault(
				inv.item_code, []
			).append(inv)

	def skip_row(self, row):
		if self.filters.get("group_by") != "Invoice":
			if not row.get(scrub(self.filters.get("group_by", ""))):
				return True

		return False

	
	

	def load_invoice_items(self):
		conditions = ""
		if self.filters.company:
			conditions += " and `tabSales Invoice`.company in  %(company)s"
		if self.filters.timespan != "custom":
			
			date_range = get_timespan_date_range(self.filters.timespan) 
			date1 = datetime.strptime(str(date_range[0]),"%Y-%m-%d").date()
			date2 = datetime.strptime(str(date_range[1]),"%Y-%m-%d").date()
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(date_range)))
			conditions += f" and `tabSales Invoice`.posting_date >= '{date1}' and `tabSales Invoice`.posting_date <= '{date2}'"

		if self.filters.timespan == "custom":
			
			conditions += " and `tabSales Invoice`.posting_date >= %(from_date)s and `tabSales Invoice`.posting_date <= %(to_date)s"
		
		# conditions += " and (is_return = 0 or (is_return=1 and return_against is null))"

		# if self.filters.item_group:
			# conditions += " and {0}".format(get_item_group_condition(self.filters.item_group))

		if self.filters.sales_person:
			conditions += """
				and exists(select 1
							from `tabSales Team` st
							where st.parent = `tabSales Invoice`.name
							and   st.sales_person in  %(sales_person)s)
			"""

		if self.filters.group_by == "Sales Person":
			sales_person_cols = ", sales.sales_person, sales.allocated_amount, sales.incentives"
			sales_team_table = "left join `tabSales Team` sales on sales.parent = `tabSales Invoice`.name"
		else:
			sales_person_cols = ""
			sales_team_table = ""

		if self.filters.group_by == "Payment Term":
			payment_term_cols = """,if(`tabSales Invoice`.docstatus = 1,
										'{0}',
										coalesce(schedule.payment_term, '{1}')) as payment_term,
									schedule.invoice_portion,
									schedule.payment_amount """.format(
				_("Sales Return"), _("No Terms")
			)
			payment_term_table = """ left join `tabPayment Schedule` schedule on schedule.parent = `tabSales Invoice`.name  """
		else:
			payment_term_cols = ""
			payment_term_table = ""

		if self.filters.get("sales_invoice"):
			conditions += " and `tabSales Invoice`.name = %(sales_invoice)s"

		if self.filters.get("customer"):
			conditions += " and `tabSales Invoice`.customer in %(customer)s"

		if self.filters.get("supplier"):
			conditions += " and tpi.supplier in %(supplier)s"		

		if self.filters.get("item_code"):
			conditions += " and `tabSales Invoice Item`.item_code = %(item_code)s"
		if self.filters.get("item_group"):
		    conditions += " and `tabSales Invoice Item`.item_group in %(item_group)s"

		if self.filters.get("brand"):
		    conditions += " and `tabSales Invoice Item`.brand in %(brand)s"

		

		
		self.si_list = frappe.db.sql(
			"""
			select
				`tabSales Invoice Item`.parent,
				`tabSales Invoice`.posting_date, 
				`tabSales Invoice`.project, 
				`tabSales Invoice`.customer, `tabSales Invoice`.customer_group,
				`tabSales Invoice`.territory, `tabSales Invoice Item`.item_code,
				`tabSales Invoice Item`.item_name, `tabSales Invoice Item`.description,
				`tabSales Invoice Item`.warehouse, `tabSales Invoice Item`.item_group,
				`tabSales Invoice Item`.brand, 
				`tabSales Invoice Item`.stock_qty as qty,
				`tabSales Invoice Item`.base_net_rate, `tabSales Invoice Item`.base_net_amount,
				tpii.qty as purchase_qty ,
				tpii.rate as buying_rate,
				tpii.amount as buying_amount,
				(CASE when tpii.amount IS NULL then  0
				else `tabSales Invoice Item`.base_net_amount - tpii.amount END )as margin,
				(CASE 
				when tpii.amount  IS NULL then 0
				WHEN tpii.amount is not NULL then `tabSales Invoice Item`.amount - tpii.amount
				else 0  END )as profit ,
				tst.sales_person,
				(CASE when tpi.supplier IS NULL then 0
				else tpi.supplier END )as supplier,
				(CASE when tpi.name IS NULL  then 0
				else tpi.name END )as purchase_invoice,
				tu.full_name as user
				{sales_person_cols}
				{payment_term_cols}
			from
			    `tabSales Invoice` inner join `tabSales Invoice Item` on `tabSales Invoice Item`.parent = `tabSales Invoice`.name
				LEFT JOIN `tabSales Order Item` tsoi on `tabSales Invoice Item`.sales_order = tsoi.parent and `tabSales Invoice Item`.so_detail = tsoi.name 
				LEFT JOIN `tabPurchase Order Item` tpoi on tpoi.sales_order = tsoi.parent and tpoi.qty = tsoi.qty and tsoi.description = tpoi.description
				LEFT JOIN `tabPurchase Invoice Item` tpii on tpii.po_detail = tpoi.name  and tpii.purchase_order = tpoi.parent
				LEFT JOIN `tabPurchase Invoice` tpi on tpii.parent = tpi.name
				LEFT JOIN `tabSales Team` tst on `tabSales Invoice Item`.parent = tst.parent
				LEFT JOIN `tabUser` tu on tst.sales_person = tu.full_name
				{sales_team_table}
				{payment_term_table}
			where
				`tabSales Invoice`.docstatus=1 and `tabSales Invoice Item`.sales_order is NOT NULL  {conditions} {match_cond}
			GROUP BY
			     	`tabSales Invoice Item`.name
			order by
				`tabSales Invoice`.name desc""".format(
				conditions=conditions,
				sales_person_cols=sales_person_cols,
				sales_team_table=sales_team_table,
				payment_term_cols=payment_term_cols,
				payment_term_table=payment_term_table,
				match_cond=get_match_cond("Sales Invoice"),
			),
			self.filters,
			as_dict=1,
		)

	

	def group_items_by_invoice(self):
		"""
		Turns list of Sales Invoice Items to a tree of Sales invoices with their Items as children.
		"""

		grouped = OrderedDict()

		for row in self.si_list:
			# initialize list with a header row for each new parent
			grouped.setdefault(row.parent, [self.get_invoice_row(row)]).append(
				row.update(
					{"indent": 1.0, "parent_invoice": row.parent, "invoice_or_item": row.item_code}
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

	def get_invoice_row(self, row):
		# header row format
		return frappe._dict(
			{
				"parent_invoice": "",
				"indent": 0.0,
				"invoice_or_item": row.parent,
				"parent": None,
				"posting_date": row.posting_date,
				"project": row.project,
				"customer": row.customer,
				"customer_group": row.customer_group,
				"item_code": None,
				"item_name": None,
				"item_group": None,
				"brand": None,
				"qty": None,
				"item_row": None,
				"base_net_amount": frappe.db.get_value("Sales Invoice", row.parent, "base_net_total"),
				"supplier":None,
				"purchase_invoice":None,
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
				"invoice_or_item": item.item_code,
				"posting_date": product_bundle.posting_date,
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
				"purchase_invoice":product_bundle.purchase_invoice,
				
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
					.invoiceby(sle.item_code)
					.invoiceby(sle.warehouse,  sle.creation, invoice=Order.desc)
					.run(as_dict=True)
				)

				self.sle[(item_code, warehouse)] = res

			return self.sle[(item_code, warehouse)]
		return []

	


def get_report_summary(filters,columns, currency, data):
	sales_amount, buying_amount,orc, profit = 0.0, 0.0, 0.0,0.0
	

	for period in data:
		if period.indent == 0.0 and filters.group_by =="Invoice":
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(period.selling_amount)))
			sales_amount += flt(period.selling_amount)
			buying_amount += flt(period.buying_amount)
			profit += flt(period.gross_profit)
			orc += flt(period.orc)
		
			
		

	sales_label = ("Sales Amount")
	buying_label = _("Purchase Amount")
	profit_label = _("Profit")
	

	return [
		{"value": round(sales_amount,2),"indicator": "Blue", "label": sales_label, "datatype": "Currency"},
		
		{"value":round(buying_amount,2),"indicator": "Red", "label": buying_label, "datatype": "Currency"},
		{"value":round(orc,2),"indicator": "Blue", "label": _("ORC Amount"), "datatype": "Currency"},
		{"value":round(profit,2),"indicator": "Green", "label": profit_label, "datatype": "Currency"}
		
		
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
	    if p.indent == 0.0 and filters.group_by =="Invoice":
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
