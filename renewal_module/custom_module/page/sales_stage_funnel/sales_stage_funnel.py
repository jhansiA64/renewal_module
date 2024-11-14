from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.sales_person_opportunity_status.sales_person_opportunity_status import get_data, get_columns,get_chart_data


def validate_filters(from_date, to_date, company):
	if from_date and to_date and (from_date >= to_date):
		frappe.throw(_("To Date must be greater than From Date"))

	if not company:
		frappe.throw(_("Please Select a Company"))

@frappe.whitelist()
def get_funnel_data(from_date, to_date, company):
	validate_filters(from_date, to_date, company)
	filters_data = {
		"brand": [],
		"company":company,
		"item_group": [],
		"opportunity_type": [],
		"party_name": [],
		"sales_person": [],
		"sales_stage": [],
		"from_date": from_date,
		"to_date": to_date
		}
	columns = get_columns()	
	data = get_data(filters_data)
	chart = get_chart_data(filters_data, columns, data)

	# active_leads = frappe.db.sql(
	# 	"""select count(*) from `tabLead`
	# 	where (date(`creation`) between %s and %s)
	# 	and company=%s""",
	# 	(from_date, to_date, company),
	# )[0][0]

	# opportunities = frappe.db.sql(
	# 	"""select count(*) from `tabOpportunity`
	# 	where (date(`creation`) between %s and %s)
	# 	and opportunity_from='Lead' and company=%s""",
	# 	(from_date, to_date, company),
	# )[0][0]

	# quotations = frappe.db.sql(
	# 	"""select count(*) from `tabQuotation`
	# 	where docstatus = 1 and (date(`creation`) between %s and %s)
	# 	and (opportunity!="" or quotation_to="Lead") and company=%s""",
	# 	(from_date, to_date, company),
	# )[0][0]
	chart_data = []
	colors = ["#FBC543","#0087AC","#00A88F","#9C2162","#82C272","#D03454"]
	num = 0

	for each in chart["data"][ "datasets"]:
		chart_data.append({"title": each["name"], "value": each["values"][0], "color": colors[num]})
		num += 1


	# return [
	# 	{"title": _("Active Leads"), "value": active_leads, "color": "#B03B46"},
	# 	{"title": _("Opportunities"), "value": opportunities, "color": "#F09C00"},
	# 	{"title": _("Quotations"), "value": quotations, "color": "#006685"},
	# 	{"title": _("Converted"), "value": converted, "color": "#00AD65"},
	# ]
	return chart_data
