import frappe
from frappe import _

def get_context(context):
	"""Pass context for page rendering"""
	context.no_cache = 1
	context.show_sidebar = False
	return context
