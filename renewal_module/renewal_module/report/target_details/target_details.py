# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _

from erpnext.accounts.doctype.monthly_distribution.monthly_distribution import (
	get_periodwise_distribution_data,
)
from erpnext.accounts.report.financial_statements import get_period_list
from erpnext.accounts.utils import get_fiscal_year



def execute(filters=None):
	# columns, data = [], []
	# return columns, data
	return get_data_column(filters, "Sales Person")




def get_data_column(filters, partner_doctype):
	data = []
	period_list = get_period_list(
		filters.fiscal_year,
		filters.fiscal_year,
		"",
		"",
		"Fiscal Year",
		filters.period,
		company=filters.company,
	)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(period_list)))
	

	rows = get_data(filters, period_list, partner_doctype)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(rows)))
	columns = get_columns(filters, period_list, partner_doctype)

	if not rows:
		return columns, data

	for key, value in rows.items():
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(key)))
		value.update({frappe.scrub(partner_doctype): key[0], "item_group": key[1], "custom_brand":key[2]})

		data.append(value)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
	)	
	# chart = get_chart_data(filters, columns, data)

	return columns, data


def get_data(filters, period_list, partner_doctype):
	sales_field = frappe.scrub(partner_doctype)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_field)))
	sales_users_data = get_parents_data(filters, partner_doctype)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_users_data)))

	if not sales_users_data:
		return
	sales_users = []
	sales_user_wise_item_groups = {}
	sales_user_wise_brand = {}

	for d in sales_users_data:
		if d.parent not in sales_users:
			sales_users.append(d.parent)

		sales_user_wise_item_groups.setdefault(d.parent, [])
		sales_user_wise_brand.setdefault(d.parent, [])
		if d.item_group:
			sales_user_wise_item_groups[d.parent].append(d.item_group)
			sales_user_wise_item_groups[d.parent].append(d.custom_brand)
			# if d.custom_brand:
				
			# 	sales_user_wise_brand[d.parent].append(d.custom_brand)


	date_field = "transaction_date"
	# if filters.get("doctype") == "Sales Order" else "posting_date"

	actual_data = get_actual_data(filters, sales_users, date_field, sales_field)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(actual_data)))

	return prepare_data(
		filters,
		sales_users_data,
		sales_user_wise_item_groups,
		sales_user_wise_brand,
		actual_data,
		date_field,
		period_list,
		sales_field,
	)


def get_columns(filters, period_list, partner_doctype):
	fieldtype, options = "Currency", "currency"

	if filters.get("target_on") == "Quantity":
		fieldtype, options = "Float", ""

	columns = [
		{
			"fieldname": frappe.scrub(partner_doctype),
			"label": _(partner_doctype),
			"fieldtype": "Link",
			"options": partner_doctype,
			"width": 150,
		},
		{
			"fieldname": "item_group",
			"label": _("Item Group"),
			"fieldtype": "Link",
			"options": "Item Group",
			"width": 150,
		},
		{
			"fieldname": "custom_brand",
			"label": _("Brand"),
			"fieldtype": "Link",
			"options": "Brand",
			"width": 150,
		},
	]

	for period in period_list:
		target_key = "target_{}".format(period.key)
		variance_key = "variance_{}".format(period.key)

		columns.extend(
			[
				{
					"fieldname": target_key,
					"label": _("Target ({})").format(period.label),
					"fieldtype": fieldtype,
					"options": options,
					"width": 150,
				},
				{
					"fieldname": period.key,
					"label": _("Achieved ({})").format(period.label),
					"fieldtype": fieldtype,
					"options": options,
					"width": 150,
				},
				{
					"fieldname": variance_key,
					"label": _("Variance ({})").format(period.label),
					"fieldtype": fieldtype,
					"options": options,
					"width": 150,
				},
			]
		)

	columns.extend(
		[
			{
				"fieldname": "total_target",
				"label": _("Total Target"),
				"fieldtype": fieldtype,
				"options": options,
				"width": 150,
			},
			{
				"fieldname": "total_achieved",
				"label": _("Total Achieved"),
				"fieldtype": fieldtype,
				"options": options,
				"width": 150,
			},
			{
				"fieldname": "total_variance",
				"label": _("Total Variance"),
				"fieldtype": fieldtype,
				"options": options,
				"width": 150,
			},
		]
	)

	return columns


def prepare_data(
	filters,
	sales_users_data,
	sales_user_wise_item_groups,
	sales_user_wise_brand,
	actual_data,
	date_field,
	period_list,
	sales_field,
):
	rows = {}

	target_qty_amt_field = "target_qty" if filters.get("target_on") == "Quantity" else "target_amount"

	qty_or_amount_field = "qty" if filters.get("target_on") == "Quantity" else "amount"
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_users_data)))

	for d in sales_users_data:
		key = (d.parent, d.item_group, d.custom_brand)
		dist_data = get_periodwise_distribution_data(
			d.distribution_id, period_list, filters.get("period")
		)

		if key not in rows:
			rows.setdefault(key, {"total_target": 0, "total_achieved": 0, "total_variance": 0})

		details = rows[key]
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))
		for period in period_list:
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(period)))
			p_key = period.key
			if p_key not in details:
				details[p_key] = 0

			target_key = "target_{}".format(p_key)
			variance_key = "variance_{}".format(p_key)
			details[target_key] = (d.get(target_qty_amt_field) * dist_data.get(p_key)) / 100
			details[variance_key] = 0
			details["total_target"] += details[target_key]
			frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(actual_data)))

			for r in actual_data:
				if (
					r.get(sales_field) == d.parent
					and period.from_date <= r.get(date_field)
					and r.get(date_field) <= period.to_date
					and (not sales_user_wise_item_groups.get(d.parent) or r.item_group == d.item_group or r.custom_brand == d.custom_brand)
				):
					details[p_key] += r.get(qty_or_amount_field, 0)
					details[variance_key] = details.get(p_key) - details.get(target_key)
					# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details[target_key])))

			details["total_achieved"] += details.get(p_key)
			# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))
			details["total_variance"] = details.get("total_achieved") - details.get("total_target")

	return rows


def get_actual_data(filters, sales_users_or_territory_data, date_field, sales_field):
	fiscal_year = get_fiscal_year(fiscal_year=filters.get("fiscal_year"), as_dict=1)
	dates = [fiscal_year.year_start_date, fiscal_year.year_end_date]

	select_field = "`tab{0}`.{1}".format(filters.get("doctype"), sales_field)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(select_field)))
	child_table = "`tab{0}`".format(filters.get("doctype") + " Item")

	if sales_field == "sales_person":
		select_field = "`tabSales Team`.sales_person"
		child_table = "`tab{0}`, `tabSales Team`".format(filters.get("doctype") + " Item")
		cond = """`tabSales Team`.parent = `tab{0}`.name and
			`tabSales Team`.sales_person in ({1}) """.format(
			filters.get("doctype"), ",".join(["%s"] * len(sales_users_or_territory_data))
		)
	else:
		cond = "`tab{0}`.{1} in ({2})".format(
			filters.get("doctype"), sales_field, ",".join(["%s"] * len(sales_users_or_territory_data))
		)

	return frappe.db.sql(
		""" SELECT `tab{child_doc}`.item_group,`tab{child_doc}`.brand as custom_brand,
			`tab{child_doc}`.qty, `tab{child_doc}`.amount,
			{select_field}, `tab{parent_doc}`.{date_field}
		FROM `tab{parent_doc}`, {child_table}
		WHERE
			`tab{child_doc}`.parent = `tab{parent_doc}`.name
			and {cond}
			and `tab{parent_doc}`.{date_field} between %s and %s""".format(
			cond=cond,
			date_field=date_field,
			select_field=select_field,
			child_table=child_table,
			parent_doc=filters.get("doctype"),
			child_doc=filters.get("doctype") + " Item",
		),
		tuple(sales_users_or_territory_data + dates),
		as_dict=1,
	)


def get_parents_data(filters, partner_doctype):
	filters_dict = {"parenttype": partner_doctype}

	target_qty_amt_field = "target_qty" if filters.get("target_on") == "Quantity" else "target_amount"

	if filters.get("fiscal_year"):
		filters_dict["fiscal_year"] = filters.get("fiscal_year")

	return frappe.get_all(
		"Target Detail",
		filters=filters_dict,
		fields=["parent", "item_group", "custom_brand", target_qty_amt_field, "fiscal_year", "distribution_id"],
	)


# def get_chart_data(filters, columns, data):
# 	total_target , total_achieved, total_variance = 0.0, 0.0, 0.0
# 	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
	
# 	# labels = ["prospecting" , "proposal_price_quote", "negotiation_review" , "closed_lost", "closed_won", "dead"]	
# 	labels = ["Target"]

# 	for p in data:
# 		frappe.msgprint(p)
# 		total_target += p.total_target
# 		total_achieved += p.total_achieved
# 		total_variance += p.total_variance
# 		# if p.sales_stage == "Prospecting":
# 		# 	prospecting += p.amount
				
		

# 	datasets = [{"name":"Tatget","values":[0.0]},
# 	{"name":"Achieved", "values":[0.0]},
# 	{"name":"Variance","values":[0.0]}
# 	]
	
# 	# if prospecting:
# 	# 	datasets[0]["values"] = [prospecting]
	
# 	datasets[0]["values"] = [total_target]
# 	datasets[1]["values"] = [total_achieved]
# 	datasets[2]["values"] = [total_variance]
		

# 	return {
#         'title':"Chart Based On Target",
#         'data':{
#             'labels':labels,
#             'datasets':datasets
#         },
#         'type':'bar',
#         'height':300,
# 		'fieldtype':'Currency',
# 		'colors':["#FBC543", "#82C272", "#9C2162"],
#     }



