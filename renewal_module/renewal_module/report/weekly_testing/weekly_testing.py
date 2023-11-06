# Copyright (c) 2023, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe

import frappe
from frappe import _
from datetime import datetime
from dateutil import relativedelta
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
		value.update({"sales_person": key[0], "category_type": key[1], "category":key[2],"target_uom":key[3]})

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
			"fieldname":"category_type",
			"label":_("Category Type"),
			"fieldtype":"Data",
			"width":130
		},
		{
			"fieldname":"category",
			"label":_("Category"),
			"fieldtype":"Data",
			"width":130
		},
        
		{
			"label": _("Target UOM"),
			"fieldname": "target_uom",
			"fieldtype": "Data",
			"width": 100,
		},
        {
			"fieldname":"topline_target",
		    "label":_("Topline Target"),
		    "fieldtype": "Data",	    
			"width":180
		},
        {
			"fieldname":"bottomline_target",
		    "label":_("Bottomline Target"),
		    "fieldtype": "Data",	    
			"width":180
		},
		
		# {
		# 	"fieldname":"target_value",
		#     "label":_("Target Value"),
		#     "fieldtype": "Float",		    
		# 	"width":180
		# },
		
		
		{
			"fieldname":"achieved_value",
		    "label":_("Achieved Value"),
		    "fieldtype": "Float",
			"width":150
		},
		
		
		{
			"fieldname":"shortfall",
		    "label":_("Shortfall"),
		    "fieldtype": "Float",
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
        if d.category_type == "Item Group" and d.category:
            sales_user_wise_item_groups[d.parent].append(d.category)
            # sales_user_wise_item_groups[d.parent].append(d.custom_brand)
			
        if d.category_type == "Brand" and d.category:
            sales_user_wise_brand[d.parent].append(d.category)	

    date_field = "transaction_date"

    # actual_data = get_actual_data(filters, sales_users, date_field, sales_field)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_user_wise_item_groups)))
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
            key = (d.parent, d.category_type, d.category, d.target_uom)

            if key not in rows:
                rows.setdefault(key, {"topline_target":0, "bottomline_target":0 ,"achieved_value":0 ,"shortfall":0})

            details = rows[key]
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))

            # target_qty_key = "target_{}".format(p_key)
            # variance_key = "variance_{}".format(p_key)
            details["topline_target"] = (d.get("topline_target") * months) / 12
            details["bottomline_target"] = (d.get("bottomline_target") * months) / 12
            details["shortfall"] = 0
            # details["total_target"] += details[target_key]
        

            for r in sales_data:
                if (
                    r.sales_person == d.parent
                    and (sales_user_wise_item_groups.get(d.parent)[0] == r.item_group and d.category_type == "Item Group" and r.item_group == d.category)
                ):
                    if d.target_uom == "Qty":
                        details["achieved_value"] += r.get("sales_qty", 0)
                    else:
                        details["achieved_value"] += r.get("profit", 0)
                    details["shortfall"] = details.get("achieved_value") - details.get("bottomline_target")
                    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_user_wise_item_groups.get(d.parent))))
                elif (
                    r.sales_person == d.parent
                    and (not sales_user_wise_item_groups.get(d.parent) or(d.category_type == "Brand" and  r.brand == d.category))
                ):
                    if d.target_uom == "Qty":
                        details["achieved_value"] += r.get("sales_qty", 0)
                    else:
                        details["achieved_value"] += r.get("profit", 0)
                    details["shortfall"] = details.get("achieved_value") - details.get("bottomline_target")
                    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))
                elif (
                    r.sales_person == d.parent
                    and (r.brand not in sales_user_wise_brand.get(d.parent))
				    and (r.item_group not in sales_user_wise_item_groups.get(d.parent))
                    and (d.category_type == "Other" )
                ):
                    if d.target_uom == "Qty":
                        details["achieved_value"] += r.get("sales_qty", 0)
                    else:
                        details["achieved_value"] += r.get("profit", 0)
                    details["shortfall"] = details.get("achieved_value") - details.get("bottomline_target")
                      
    


                # elif(r.sales_person == d.parent) :
                #   details["achieved_qty"] += r.get("sales_qty", 0)
                #   details["achieved_amount"] += r.get("profit", 0)
                #   details["shortfall"] = details.get("achieved_amount") - details.get("target_amount")
                #   frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))

            # details["achieved_amount"] += details.get("achieved_amount")
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(details)))
            details["shortfall"] = details.get("achieved_value") - details.get("bottomline_target")

    return rows


def get_parents_data(filters, partner_doctype):
    filters_dict = {"parenttype": partner_doctype}

    # target_qty_amt_field = "target_qty" if filters.get("target_on") == "Quantity" else "target_amount"

    if filters.get("fiscal_year"):
        filters_dict["fiscal_year"] = filters.get("fiscal_year")

    return frappe.get_all(
        "Sub Target Details",
        filters=filters_dict,
        fields=["parent", "category_type", "category", "target_type", "target_uom", "topline_target", "bottomline_target", "fiscal_year", "distribution_id"],
    )