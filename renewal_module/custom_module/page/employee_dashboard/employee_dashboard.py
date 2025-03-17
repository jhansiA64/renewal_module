from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import (
    get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data,get_monthly_data)




@frappe.whitelist()
def get_monthly_opp_data():
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": ["Closed Won"],
    "timespan": "this year",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_monthly_data(filters_data)
    months = []
    amounts = [] 
    counts = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        months.append(i.month)
        amounts.append(flt(i.get("amount")))
        counts.append(i.qty)

    return {"months": months, "amounts": amounts, "counts": counts}




@frappe.whitelist()
def get_brand_wise_data():
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_brand_data(filters_data)
    brand = []
    amounts = [] 
    counts = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        brand.append(i.brand)
        amounts.append(flt(i.get("amount")))
        

    return {"brand": brand, "amounts": amounts}



@frappe.whitelist()
def get_item_group_wise_data():
    # frappe.msgprint("group")
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_item_group_data(filters_data)
    list_opp = []
    amount =[]
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        list_opp.append(i.item_group)
        amount.append(flt(i.get("amount")))
    return {"item_group": list_opp, "amounts": amount}



@frappe.whitelist()
def get_total_amount():
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        
        sum += flt(i.get("amount"))

    return sum


@frappe.whitelist()
def get_won_amount():
   
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum

@frappe.whitelist()
def get_lost_amount():
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": ["Closed Lost"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum


@frappe.whitelist()
def get_opp_count():
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_opp:
            list_opp.append(i.name)
            count += 1
    
    return count


@frappe.whitelist()
def get_renewal_count():
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_opp and i.opportunity_type in ["Renewal","Additional"]:
            
            list_opp.append(i.name)
            count += 1
    
    return count

@frappe.whitelist()
def get_renewal_amount():
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [],
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.opportunity_type in ["Renewal","Additional"]:
            sum += flt(i.get("amount"))

    return sum

    