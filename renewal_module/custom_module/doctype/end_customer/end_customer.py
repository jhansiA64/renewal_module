# # Copyright (c) 2024, Aravind Mandala and contributors
# # For license information, please see license.txt

import frappe
from frappe.model.document import Document

import json

import frappe
import frappe.defaults
from frappe import _, msgprint, qb
from frappe.contacts.address_and_contact import (
	delete_contact_and_address,
	load_address_and_contact,
)
from frappe.model.mapper import get_mapped_doc
from frappe.model.naming import set_name_by_naming_series, set_name_from_naming_options
from frappe.model.utils.rename_doc import update_linked_doctypes
from frappe.utils import cint, cstr, flt, get_formatted_email, today
from frappe.utils.user import get_users_with_role


class EndCustomer(Document):
	pass
	def onload(self):
		"""Load address and contacts in `__onload`"""
		load_address_and_contact(self)
		# self.load_dashboard_info()

# 	def load_address_and_contact(doc, key=None) -> None:
# 		"""Loads address list and contact list in `__onload`"""
# 		from frappe.contacts.doctype.address.address import get_address_display_list
# 		from frappe.contacts.doctype.contact.contact import get_contact_display_list

# 		doc.set_onload("addr_list", get_address_display_list(doc.doctype, doc.name))
# 		doc.set_onload("contact_list", get_contact_display_list(doc.doctype, doc.name))
	

