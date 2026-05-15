# Copyright (c) 2022, Aravind Mandala and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class CustomerOrderForm(Document):
	def before_save(self):
		self.calculate_totals()

	def calculate_totals(self):
		# Calculate total_quantity and total from items
		self.total_quantity = sum(item.qty for item in self.items) if self.items else 0
		self.total = sum(item.amount for item in self.items) if self.items else 0

		# Calculate taxes
		total_taxes = 0
		running_total = self.total
		for tax in self.taxes or []:
			if tax.charge_type == "On Net Total":
				tax.tax_amount = (tax.rate / 100) * self.total
			elif tax.charge_type == "On Previous Row Total":
				tax.tax_amount = (tax.rate / 100) * running_total
			else:
				tax.tax_amount = tax.rate  # assuming fixed amount
			running_total += tax.tax_amount
			total_taxes += tax.tax_amount

		self.total_taxes_and_charges = total_taxes

		# Grand total
		self.grand_total = self.total + self.total_taxes_and_charges

		# Populate margin_table only when the parent DocType supports that child table
		has_margin_table = (
			self.items
			and getattr(self, 'meta', None)
			and self.meta.has_field('margin_table')
			and hasattr(self, '_table_fieldnames')
			and 'margin_table' in self._table_fieldnames
		)
		if has_margin_table:
			self.margin_table = []
			for item in self.items:
				buying_rate = self.get_buying_rate(item.item_code)
				margin = item.rate - buying_rate if buying_rate else 0
				self.append('margin_table', {
					'item_code': item.item_code,
					'qty': item.qty,
					'selling_rate': item.rate,
					'buying_rate': buying_rate,
					'margin': margin
				})

	def get_buying_rate(self, item_code):
		# Get buying rate from Item Price.
		# Use self.get() so missing DocType fields do not raise AttributeError.
		buying_price_list = self.get('buying_price_list') or 'Standard Buying'
		buying_price = frappe.db.get_value('Item Price', {
			'item_code': item_code,
			'buying': 1,
			'price_list': buying_price_list
		}, 'price_list_rate')
		return buying_price or frappe.db.get_value('Item', item_code, 'valuation_rate') or 0
