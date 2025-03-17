from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.renewals_based_on_timespam.renewals_based_on_timespam import get_data, get_columns,get_chart_data




@frappe.whitelist()
def get_rnwls_count(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [sales_person],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl and i.status in ["Active","New Opp"]:
            list_rnwl.append(i.name)
            count += 1
    
    return count

@frappe.whitelist()
def get_cofed_rnwls(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [sales_person],
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl  and i.status == "Cofed":
            list_rnwl.append(i.name)
            count += 1
    
    return count


@frappe.whitelist()
def get_pending_rnwls(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [sales_person],
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl  and i.status == "Active":
            list_rnwl.append(i.name)
            count += 1
    
    return count


@frappe.whitelist()
def get_lost_rnwls(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [sales_person],
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl  and i.status == "Lost":
            list_rnwl.append(i.name)
            count += 1
    
    return count  