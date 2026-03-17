import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate
from frappe.utils import get_timespan_date_range
from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.renewals_based_on_timespam.renewals_based_on_timespam import get_data, get_columns,get_chart_data



#renewal list

@frappe.whitelist()
def get_rnwls_new_opp_count(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
    "timespan": "last week",
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
        if i.name not in list_rnwl  and i.status == "New Opp":
            list_rnwl.append(i.name)
            count += 1
    
    return count

@frappe.whitelist()
def get_rnwls_active_count(sales_person=None):

    condition = ""
    if sales_person:
        condition = f"WHERE sales_person = '{sales_person}'"

    name = frappe.db.sql(f"""
        SELECT COUNT(DISTINCT name) AS name FROM `tabOpportunity` {condition}
    """, as_dict=True)[0].name or 0

    return name

@frappe.whitelist()
def get_rnwls_cofed_count(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
    "timespan": "last week",
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
        if i.name not in list_rnwl  and i.status == "Cofed":
            list_rnwl.append(i.name)
            count += 1
    
    return count

@frappe.whitelist()
def get_rnwls_lost_count(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
    "timespan": "last week",
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
        if i.name not in list_rnwl  and i.status == "Lost":
            list_rnwl.append(i.name)
            count += 1
    
    return count  

@frappe.whitelist()
def get_rnwls_renewed_count(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
    "timespan": "last week",
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
        if i.name not in list_rnwl  and i.status == "Renewed":
            list_rnwl.append(i.name)
            count += 1
    
    return count

@frappe.whitelist()
def get_rnwls_pending_count(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
    "timespan": "last week",
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
        if i.name not in list_rnwl  and i.status == "Active":
            list_rnwl.append(i.name)
            count += 1
    
    return count