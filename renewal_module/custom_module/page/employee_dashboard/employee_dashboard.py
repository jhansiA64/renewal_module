from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import (
    get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data,get_monthly_data)




@frappe.whitelist()
def get_monthly_opp_data(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Won"],
    "timespan": "this year",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_monthly_data(filters_data)
    months = []
    amounts = [] 
    counts = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        months.append(i.month[:3])
        amounts.append(flt(i.get("amount")))
        counts.append(i.qty)

    return {"months": months, "amounts": amounts, "counts": counts}




@frappe.whitelist()
def get_brand_wise_data(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    
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
def get_brand_wise_data_tw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    
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
def get_brand_wise_data_tm(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    
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
def get_item_group_wise_data(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
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
def get_funnel_data(sales_person= None):
   
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_sales_stage_data(filters_data)
    funnel = []
    amounts = [] 
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        funnel.append(i.sales_stage)
        amounts.append(flt(i.get("amount")))
        

    return {"funnel": funnel, "amounts": amounts}

  

@frappe.whitelist()
def get_total_amount(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        
        sum += flt(i.get("amount"))

    return sum


@frappe.whitelist()
def get_won_amount(sales_person=None):
   
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum

@frappe.whitelist()
def get_lost_amount(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Lost"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum


@frappe.whitelist()
def get_opp_count(sales_person=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
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
def get_won_amount_tm(sales_person=None):
   
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum

@frappe.whitelist()
def get_lost_amount_tm(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Lost"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum


@frappe.whitelist()
def get_opp_count_tm(sales_person=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "this month",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
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
def get_sales_person():
    user = frappe.session.user 

    if user == "Administrator":

        sales_persons = frappe.get_all("Sales Person", filters={"employee": ["is", "set"]},pluck="name")
        # sales_persons = frappe.get_all("Sales Person", filters={"docstatus": 1}, pluck="name") 
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_persons)))
        return sales_persons 

    else:
        employee = frappe.get_value("Employee", {"user_id": user}, "name") 
        if employee:
            sales_person = frappe.get_value("Sales Person", {"employee": employee}, "name") 
            return [sales_person] if sales_person else [] 

    return []    


@frappe.whitelist()
def get_closure_opp_count_tw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "this week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_opp :
            
            list_opp.append(i.name)
            count += 1
    
    return count

@frappe.whitelist()
def get_closure_opp_amount_tw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "this week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum

@frappe.whitelist()
def get_closure_opp_count_tm(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "this month",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_opp :
            
            list_opp.append(i.name)
            count += 1
    
    return count

@frappe.whitelist()
def get_closure_opp_amount_tm(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "this month",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum

@frappe.whitelist()
def get_rnwls_count_lw(sales_person=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
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
def get_rnwls_amount_lw(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.opportunity_type in ["Renewal","Additional"]:
            sum += flt(i.get("amount"))

    return sum


#target Dashboard

@frappe.whitelist()
def get_target_data(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["Closed Won"],
    "timespan": "this year",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_monthly_data(filters_data)
    months = []
    amounts = [] 
    counts = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        months.append(i.month[:3])
        amounts.append(flt(i.get("amount")))
        counts.append(i.qty)

    return {"months": months, "amounts": amounts, "counts": counts}





