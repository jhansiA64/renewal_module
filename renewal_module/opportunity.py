# from __future__ import unicode_literals
# import frappe
# from frappe.model.document import Document

# class Opportunity(Document):
#     def on_trash(self):
#         pass

# @frappe.whitelist()
# def get_permission_query_conditions(user):
#     return frappe.get_attr("renewal_module.tasks.get_permission_query_conditions")(user)

# @frappe.whitelist()
# def has_permission(doc, user):
#     return frappe.get_attr("renewal_module.tasks.has_permission")(doc, user)