# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _
from datetime import datetime
from dateutil import relativedelta
from frappe.utils import add_days, add_to_date, flt, getdate,get_timespan_date_range
from renewal_module.renewal_module.report.overall_sales_report.overall_sales_report import (
	get_data,
)
from erpnext.accounts.utils import get_fiscal_year


def execute(filters=None):
	data = []
	session_user = frappe.session.user
	sales_data = get_data(filters)
	# if session_user == "Administrator":
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(session_user)))
	columns, rows = get_columns(), get_target_data(filters, sales_data)
	# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(rows)))

	if not rows:
		return columns, data


	for key, value in rows.items():
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(key)))
		# frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(value)))
		value.update({"sales_person": key[0], "item_group": key[1], "brand":key[2]})

		data.append(value)

	currency = filters.presentation_currency or frappe.get_cached_value(
		"Company", filters.company, "default_currency"
    )

    # report_summary = get_report_summary(filters,columns, currency, data)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_data)))

    # chart = get_chart_data(filters, columns, data)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart)))

	return columns, data

def get_columns():
	columns = [
		{
			"fieldname":"sales_person",
			"label":_("Sales Person"),
			"fieldtype":"Link",
			"options":"Sales Person",
			"width":180
		},
		{
			"fieldname":"item_group",
			"label":_("Item Group"),
			"fieldtype":"Data",
			"width":130
		},
		{
			"fieldname":"brand",
			"label":_("Brand"),
			"fieldtype":"Data",
			"width":130
		},
		{
			"label": _("Target Qty"),
			"fieldname": "target_qty",
			"fieldtype": "Data",
			"width": 100,
		},
		{
			"label": _("Achieved Qty"),
			"fieldname": "achieved_qty",
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"fieldname":"target_amount",
		    "label":_("Target Amount"),
		    "fieldtype": "Currency",		    
			"width":180
		},
		
		
		{
			"fieldname":"achieved_amount",
		    "label":_("Achieved Amount"),
		    "fieldtype": "Currency",
			"width":150
		},
		
		
		{
			"fieldname":"shortfall",
		    "label":_("Shortfall"),
		    "fieldtype": "Currency",
			"width":150
		},
		
		
	]
	return columns

def get_target_data(filters, sales_data):
    sales_users_data = get_parents_data(filters, "Sales Person")
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
            # sales_user_wise_item_groups[d.parent].append(d.custom_brand)
			
        # if d.custom_brand:
        #     sales_user_wise_brand[d.parent].append(d.custom_brand)	

    date_field = "transaction_date"

    # actual_data = get_actual_data(filters, sales_users, date_field, sales_field)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(actual_data)))
    return prepare_data(
        filters,
        sales_users_data,
        sales_user_wise_item_groups,
        sales_user_wise_brand,
        sales_data,
        date_field,
        "Sales Person"
    )           
    

def prepare_data(filters,sales_users_data,sales_user_wise_item_groups,sales_user_wise_brand,sales_data,date_field,sales_field,
):
    rows = {}

    # target_qty_amt_field = "target_qty" if filters.get("target_on") == "Quantity" else "target_amount"

    # qty_or_amount_field = "qty" if filters.get("target_on") == "Quantity" else "amount"

    fiscal_year = get_fiscal_year(fiscal_year=filters.get("fiscal_year"), as_dict=1)
    dates = [fiscal_year.year_start_date, fiscal_year.year_end_date]

    d1 = filters.get("from_date")
    d2 = filters.get("to_date")

    # convert string to date object
    start_date = datetime.strptime(d1, "%Y-%m-%d")
    end_date = datetime.strptime(d2, "%Y-%m-%d")

    # Get the relativedelta between two dates
    delta = relativedelta.relativedelta(end_date, start_date)
    months = delta.months + 1
    

    if datetime.date(datetime.strptime(filters.get("from_date"),"%Y-%m-%d"))>= fiscal_year.year_start_date and datetime.date(datetime.strptime(filters.get("to_date"),"%Y-%m-%d")) <= fiscal_year.year_end_date:
        for d in sales_users_data:
	        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_user_wise_item_groups.get(d.parent))))
            key = (d.parent, d.item_group, d.custom_brand)

            if key not in rows:
                rows.setdefault(key, {"target_qty":0,"achieved_qty":0 ,"target_amount":0 ,"achieved_amount":0 ,"shortfall":0})

            details = rows[key]
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))

            # target_qty_key = "target_{}".format(p_key)
            # variance_key = "variance_{}".format(p_key)
            details["target_qty"] = (d.get("target_qty") * months) / 12
            details["target_amount"] = (d.get("target_amount") * months) / 12
            details["shortfall"] = 0
            # details["total_target"] += details[target_key]
        

            for r in sales_data:
                if (
                    r.sales_person == d.parent
                    and (not sales_user_wise_item_groups.get(d.parent) or r.item_group == d.item_group )
                ):
                    details["achieved_qty"] += r.get("sales_qty", 0)
                    details["achieved_amount"] += r.get("profit", 0)
                    details["shortfall"] = details.get("achieved_amount") - details.get("target_amount")
                    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))

                elif(r.sales_person == d.parent
				and (r.brand not in sales_user_wise_brand.get(d.parent))
				and (r.item_group not in sales_user_wise_item_groups.get(d.parent)) 
				and not d.item_group and not d.custom_brand) :
                  details["achieved_qty"] += r.get("sales_qty", 0)
                  details["achieved_amount"] += r.get("profit", 0)
                  details["shortfall"] = details.get("achieved_amount") - details.get("target_amount")
                #   frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))

            # details["achieved_amount"] += details.get("achieved_amount")
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))
            details["shortfall"] = details.get("achieved_amount") - details.get("target_amount")

    return rows


def get_parents_data(filters, partner_doctype):
    filters_dict = {"parenttype": partner_doctype}

    # target_qty_amt_field = "target_qty" if filters.get("target_on") == "Quantity" else "target_amount"

    if filters.get("fiscal_year"):
        filters_dict["fiscal_year"] = filters.get("fiscal_year")

    return frappe.get_all(
        "Target Detail",
        filters=filters_dict,
        fields=["parent", "item_group", "custom_brand", "target_qty", "target_amount", "fiscal_year", "distribution_id"],
    )