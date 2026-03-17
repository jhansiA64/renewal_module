from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.renewals_based_on_timespam.renewals_based_on_timespam import get_data, get_columns,get_chart_data




@frappe.whitelist()
def get_rnwls_count_tw(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "status": ["Active"],
    "party_name": [],
    "timespan": "this week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl and i.status in ["Active","New Opp"]:
            list_rnwl.append(i.name)
            count += 1
    
    return count

@frappe.whitelist()
def get_rnwls_amount_tw(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "timespan": "this week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl and i.status in ["Active","New Opp"]:
            list_rnwl.append(i.name)
            sum += flt(i.get("total_amount"))
    
    return sum

@frappe.whitelist()
def get_rnwls_count_tm(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "timespan": "this month",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
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
def get_rnwls_amount_tm(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "timespan": "this month",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]

    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    sum =0.0
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl and i.status in ["Active","New Opp"]:
            list_rnwl.append(i.name)
            sum += flt(i.get("total_amount"))
    
    return sum

