# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

from collections import OrderedDict

import frappe
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
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(gross_profit_data.rl_list)))

	data = []

	group_wise_columns = frappe._dict(
		{
			"renewals": [
				"renewals_or_item",
				"customer_name",
				"status",
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
				"sales_person"
			],
			
		
		}
	)

	columns = get_columns(group_wise_columns, filters)

	if filters.group_by == "Renewals":
		get_data_when_grouped_by_invoice(columns, gross_profit_data, filters, group_wise_columns, data)

	else:
		get_data_when_not_grouped_by_invoice(gross_profit_data, filters, group_wise_columns, data)

	return columns, data


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
		frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(src)))
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
			"sales_person":"sales_person"
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

		self.load_product_bundle()
		self.load_non_stock_items()
		self.get_returned_renewal_items()
		self.process()

	def process(self):
		self.grouped = {}
		self.grouped_data = []

		self.currency_precision = cint(frappe.db.get_default("currency_precision")) or 3
		self.float_precision = cint(frappe.db.get_default("float_precision")) or 2

		grouped_by_renewals = True if self.filters.get("group_by") == "Renewals" else False

		if grouped_by_renewals:
			buying_amount = 0

		for row in reversed(self.rl_list):
			

			if self.skip_row(row):
				continue

			row.base_amount = flt(row.amount, self.currency_precision)

			product_bundles = []
			if row.update_stock:
				product_bundles = self.product_bundles.get(row.parenttype, {}).get(row.parent, frappe._dict())
			elif row.dn_detail:
				product_bundles = self.product_bundles.get("Delivery Note", {}).get(
					row.delivery_note, frappe._dict()
				)
				row.item_row = row.dn_detail
				# Update warehouse and base_amount from 'Packed Item' List
				if product_bundles and not row.parent:
					# For Packed Items, row.parent_invoice will be the Bundle name
					product_bundle = product_bundles.get(row.parent_renewal)
					if product_bundle:
						for packed_item in product_bundle:
							frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(packed_item)))
							if (
								packed_item.get("item_code") == row.item_code
								and packed_item.get("parent_detail_docname") == row.item_row
							):
								row.warehouse = packed_item.warehouse
								row.base_amount = packed_item.base_amount

			# get buying amount
			if row.item_code in product_bundles:
				row.buying_amount = flt(
					self.get_buying_amount_from_product_bundle(row, product_bundles[row.item_code]),
					self.currency_precision,
				)
			
			self.grouped.setdefault(row.get(scrub(self.filters.group_by)), []).append(row)

	
	def is_not_invoice_row(self, row):
		return (self.filters.get("group_by") == "Renewals" and row.indent != 0.0) or self.filters.get(
			"group_by"
		) != "Renewals"

	def set_average_rate(self, new_row):
		
		new_row.rate = (
			flt(new_row.base_amount / new_row.qty, self.float_precision) if new_row.qty else 0
		)
		return new_row

	
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

	def get_buying_amount_from_product_bundle(self, row, product_bundle):
		buying_amount = 0.0
		for packed_item in product_bundle:
			if packed_item.get("parent_detail_docname") == row.item_row:
				packed_item_row = row.copy()
				packed_item_row.warehouse = packed_item.warehouse
				buying_amount += self.get_buying_amount(packed_item_row, packed_item.item_code)

		return flt(buying_amount, self.currency_precision)

	

	def load_invoice_items(self):
		conditions = ""
		if self.filters.company:
			conditions += " and `tabRenewal List`.company = %(company)s"
		if self.filters.from_date:
			conditions += " and `tabRenewal List`.end_date >= %(from_date)s"
		if self.filters.to_date:
			conditions += " and `tabRenewal List`.end_date <= %(to_date)s"

		# conditions += " and (is_return = 0 or (is_return=1 and return_against is null))"

		if self.filters.item_group:
			conditions += " and {0}".format(get_item_group_condition(self.filters.item_group))

		if self.filters.get("sales_person"):
			conditions += "and `tabRenewal List`.sales_user = %(sales_person)s"

		if self.filters.get("renewal_list"):
			conditions += " and `tabRenewal List`.name = %(renewal_list)s"

		if self.filters.get("item_code"):
			conditions += " and `tabSales Invoice Item`.item_code = %(item_code)s"

		if self.filters.get("warehouse"):
			warehouse_details = frappe.db.get_value(
				"Warehouse", self.filters.get("warehouse"), ["lft", "rgt"], as_dict=1
			)
			if warehouse_details:
				conditions += f" and `tabSales Invoice Item`.warehouse in (select name from `tabWarehouse` wh where wh.lft >= {warehouse_details.lft} and wh.rgt <= {warehouse_details.rgt} and warehouse = wh.name)"

		self.rl_list = frappe.db.sql(
			"""
			select
				`tabRenewal Item`.parent,
				`tabRenewal List`.end_date,
				`tabRenewal List`.status,
				`tabRenewal List`.customer_name,
				`tabRenewal Item`.item_code,
				`tabRenewal Item`.item_name, `tabRenewal Item`.description,
				`tabRenewal Item`.warehouse, `tabRenewal Item`.item_group,
				`tabRenewal Item`.brand,
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
			     `tabRenewal List`.company = %(company)s and `tabRenewal List`.status= "Active"	
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
				"sales_person":row.sales_person,
				"item_code": None,
				"item_name": None,
				"description": None,
				"item_group": None,
				"brand": None,
				"qty": None,
				"item_row": None,
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
				"customer_name": product_bundle.customer_name,
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
					.orderby(sle.warehouse, sle.posting_date, sle.posting_time, sle.creation, order=Order.desc)
					.run(as_dict=True)
				)

				self.sle[(item_code, warehouse)] = res

			return self.sle[(item_code, warehouse)]
		return []

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
			.where(pki.docstatus == 1)
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