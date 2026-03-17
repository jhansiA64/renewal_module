import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate
from frappe.utils import get_timespan_date_range
from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.renewals_based_on_timespam.renewals_based_on_timespam import get_data, get_columns,get_chart_data



#renewal list

@frappe.whitelist()
def get_rnwls_new_opp_count(time_filter2,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
    #"timespan": "last week",
    "timespan": time_filter2,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter2 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date  
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl  and i.status == "New Opp":
            list_rnwl.append(i.name)
            count += 1
    new_opp = []
    for j in data:
        if j.name not in i and j.status == "New Opp":
            new_opp.append(j)
    
    return count,new_opp


@frappe.whitelist()
def get_rnwls_cofed_count(time_filter2,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
    #"timespan": "last week",
    "timespan": time_filter2,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter2 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date  
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl  and i.status == "Cofed":
            list_rnwl.append(i.name)
            count += 1
    cofed = []
    for j in data:
        if j.name not in i and j.status == "Cofed":
            cofed.append(j)
    
    return count,cofed

@frappe.whitelist()
def get_rnwls_lost_count(time_filter2,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    # "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
   # "timespan": "last week",
    "timespan": time_filter2,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter2 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date 
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters_data)))     
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl  and i.status == "Lost":
            list_rnwl.append(i.name)
            count += 1
    lost = []
    for j in data:
        if j.name not in i and j.status == "Lost":
            lost.append(j)
    return count,lost

@frappe.whitelist()
def get_rnwls_renewed_count(time_filter2,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_stage": [],
    #"timespan": "last week",
    "timespan": time_filter2,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter2 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date  
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl  and i.status == "Renewed":
            list_rnwl.append(i.name)
            count += 1
    renewed=[]
    for j in data:
        if j.name not in i and j.status == "Renewed":
            renewed.append(j)        
    
    return count,renewed

@frappe.whitelist()
def get_rnwls_pending_count(time_filter2,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    # "sales_stage": [],
    #"timespan": "last week",
    "timespan": time_filter2,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter2 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date  
    columns = get_columns(filters_data)	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl  and i.status == "Active":
            list_rnwl.append(i.name)
            count += 1
    pending = []
    for j in data:
        if j.name not in i and j.status == "Active":
            pending.append(j)
    
    return count,pending