
from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate
from frappe.utils import get_timespan_date_range


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import (
    get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data,get_monthly_data)


@frappe.whitelist()
# def get_sales_person():
#     user = frappe.session.user 

#     if user == "Administrator":

#         # sales_persons = frappe.get_all("Sales Person", filters={"employee": ["is", "set"]},pluck="name")
#         # sales_persons = frappe.get_all("Sales Person", filters={"docstatus": 1}, pluck="name") 
#         # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_persons)))
#         # Step 1: Get all Sales Persons where employee is set
#         sales_persons = frappe.get_all("Sales Person", filters={"employee": ["is", "set"]}, fields=["name", "employee"])

#         filtered_sales_persons = []

#         # Step 2 & 3: For each Sales Person, check if their linked User has either Sales User or Sales Manager role
#         for sp in sales_persons:
#             # Get the User linked to the Employee
#             user = frappe.db.get_value("Employee", sp.employee, "user_id")
#             if not user:
#                 continue

#             # Check if the user is enabled (active)
#             is_active = frappe.db.get_value("User", user, "enabled")
#             if not is_active:
#                 continue

#             # Check if User has either 'Sales User' or 'Sales Manager' role
#             has_role = frappe.db.exists("Has Role", {
#                 "parent": user,
#                 "role": ["in", ["Sales User", "Sales Manager"]]
#             })

#             if has_role:
#                 filtered_sales_persons.append(sp.name)

        

#         return filtered_sales_persons 

#     else:
#         employee = frappe.get_value("Employee", {"user_id": user}, "name") 
#         if employee:
#             sales_person = frappe.get_value("Sales Person", {"employee": employee}, "name") 
#             return [sales_person] if sales_person else [] 

#     return []    

# @frappe.whitelist()
# def get_sales_person():
#     current_user = frappe.session.user

#     # 1. Admin/System Manager - show all sales persons with valid user & roles
#     if current_user == "Administrator" or "System Manager" in frappe.get_roles(current_user):    
#         sales_persons = frappe.get_all("Sales Person", filters={"employee": ["is", "set"]}, fields=["name", "employee"])
#         filtered_sales_persons = []

#         for sp in sales_persons:
#             user_id = frappe.db.get_value("Employee", sp.employee, "user_id")
#             if not user_id:
#                 continue

#             is_active = frappe.db.get_value("User", user_id, "enabled")
#             if not is_active:
#                 continue

#             has_role = frappe.db.exists("Has Role", {
#                 "parent": user_id,
#                 "role": ["in", ["Sales User", "Sales Manager"]]
#             })

#             if has_role:
#                 filtered_sales_persons.append(sp.name)

#         return filtered_sales_persons

#     # 2. For other users — get their Sales Person name from Employee
#     employee = frappe.get_value("Employee", {"user_id": current_user}, "name")
#     if not employee:
#         return []

#     current_sales_person = frappe.get_value("Sales Person", {"employee": employee}, "name")
#     if not current_sales_person:
#         return []

#     # 2a. Check if this user is a Sales Team Leader (parent of other Sales Persons)
#     child_sales_persons = frappe.get_all("Sales Person", filters={"parent_sales_person": current_sales_person}, pluck="name")

#     if child_sales_persons:
#         # Return self + children
#         return [current_sales_person] + child_sales_persons

#     # 3. Normal salesperson - only their own name
#     return [current_sales_person]

@frappe.whitelist()
def get_sales_person():
    current_user = frappe.session.user

    # 1. If Administrator or System Manager → return **all Sales Persons**
    if current_user == "Administrator" or "System Manager" in frappe.get_roles(current_user):
        #return frappe.get_all("Sales Person", pluck="name")
        sales_persons = frappe.get_all("Sales Person", pluck="name")
        return {
            "sales_person_list": sales_persons,
            "default_sales_person": ""
        }

    # 2. For normal users — get their Sales Person name via linked Employee
    employee = frappe.get_value("Employee", {"user_id": current_user}, "name")
    if not employee:
        #return []
        return {"sales_person_list": [], "default_sales_person": ""}

    current_sales_person = frappe.get_value("Sales Person", {"employee": employee}, "name")
    if not current_sales_person:
        #return []
        return {"sales_person_list": [], "default_sales_person": ""}

    # 2a. If this salesperson is a team leader, return self + children
    child_sales_persons = frappe.get_all(
        "Sales Person",
        filters={"parent_sales_person": current_sales_person},
        pluck="name"
    )

    if child_sales_persons:
        return {
            "sales_person_list": [current_sales_person] + child_sales_persons,
            "default_sales_person": current_sales_person
        }
        #return [current_sales_person] + child_sales_persons

    # 3. Just return the current salesperson
    #return [current_sales_person]
    return {
        "sales_person_list": [current_sales_person],
        "default_sales_person": current_sales_person
    }
# first row 

@frappe.whitelist()
def get_leads_count(sales_person=None):
    # Get the "last week" date range
    from_date, to_date = get_timespan_date_range("last week")
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(from_date)))

    condition = ""
    # if sales_person:
    #     condition = f"and sales_person = '{sales_person}' "

    name = frappe.db.sql(f"""
        SELECT COUNT(DISTINCT name) AS name FROM `tabLead`
                         WHERE creation BETWEEN '{from_date}' AND '{to_date}'  {condition}
    """, as_dict=True)[0].name or 0

    return name

@frappe.whitelist()
def get_quoted_count(sales_person=None):
    from_date, to_date = get_timespan_date_range("last week")

    condition = ""
    if sales_person:
        condition = f"and sales_person = '{sales_person}'"

    name = frappe.db.sql(f"""
        SELECT COUNT(DISTINCT name) AS name FROM `tabOpportunity`
                         where creation BETWEEN '{from_date}' AND '{to_date}' and status="Quotation" {condition}
    """, as_dict=True)[0].name or 0

    return name

@frappe.whitelist()
def get_demo_count(sales_person=None):

    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["POC/Demos/Webinar/Session"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    #columns = get_columns()	
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
def get_new_customer_count(sales_person=None):
    from_date, to_date = get_timespan_date_range("last week")

    condition = ""
    if sales_person:
        condition = f"and sales_person = '{sales_person}'"

    name = frappe.db.sql(f"""
        SELECT COUNT(DISTINCT tc.name) AS name
                          FROM tabCustomer tc 
        left join `tabDynamic Link` tdl on tdl.link_name = tc.name 
        LEFT JOIN tabContact tc2 on tdl.parent = tc2.name
              WHERE tc2.name is NOT NULL and tc.creation BETWEEN '{from_date}' AND '{to_date}'  {condition}
    """, as_dict=True)[0].name or 0

    return name

@frappe.whitelist()
def get_appointment_count(sales_person=None):
    from_date, to_date = get_timespan_date_range("last week")

    condition = ""
    # if sales_person:
    #     condition = f"and sales_person = '{sales_person}'"

    name = frappe.db.sql(f"""
        SELECT COUNT(DISTINCT name) AS name FROM `tabAppointment`
        WHERE creation BETWEEN '{from_date}' AND '{to_date}'   {condition}
    """, as_dict=True)[0].name or 0

    return name

@frappe.whitelist()
def get_client_visit_count(sales_person=None):
    from_date, to_date = get_timespan_date_range("last week")

    condition = ""
    # if sales_person:
    #     condition = f"and sales_person = '{sales_person}'"

    name = frappe.db.sql(f"""
        SELECT COUNT(DISTINCT name) AS name FROM `tabAppointment`
        WHERE creation BETWEEN '{from_date}' AND '{to_date}'  {condition}
    """, as_dict=True)[0].name or 0

    return name

# @frappe.whitelist()
# def get_calls_count(salesperson=None):

#     return name
# @frappe.whitelist()
# def get_training_count(salesperson=None):

#     return name
# @frappe.whitelist()
# def get_sessions_count(salesperson=None):

#     return name



#last Week

@frappe.whitelist()
def get_opp_count_lw(sales_person=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": [],
    "forecast":"Include",
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
    
    return count,data

@frappe.whitelist()
def get_closed_won_amount_lw(sales_person=None):
   
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
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

    return sum,data


@frappe.whitelist()
def get_closed_lost_amount_lw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
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

    return sum,data 

@frappe.whitelist()
def get_renewal_count_lw(sales_person=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
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
    
    return count,data

@frappe.whitelist()
def get_renewal_amount_lw(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
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

    return sum,data

@frappe.whitelist()
def get_profit_amount_lw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    #columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("margin"))

    return sum,data


@frappe.whitelist()
def get_brand_wise_data_lw(time_filter1,sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    #"timespan": "last week",
    "timespan":time_filter1,
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
def get_item_group_wise_data_lw(time_filter1,sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    #"timespan": "last week",
    "timespan":time_filter1,
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


#this month

@frappe.whitelist()
def get_opp_count_tm(time_filter1, sales_person=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    #"timespan": "this month",
    "timespan": time_filter1,
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
    
    return count,data

@frappe.whitelist()
def get_closed_won_amount_tm(time_filter1,sales_person=None):
   
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    #"timespan": "this month",
    "timespan": time_filter1,
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

    return sum ,data 


# @frappe.whitelist()
# def get_widget_details(widget_type, time_filter1, sales_person=None):
#     filters_data = {
#         "brand": [],
#         "company": "64 Network Security Pvt Ltd - TG",
#         "forecast": "Include",
#         "from_date": "2025-02-28",
#         "to_date": "2025-03-07",
#         "timespan": time_filter1
#     }

#     if sales_person:
#         filters_data["sales_person"] = [sales_person]

#     # Adjust filters based on widget type
#     if widget_type == "opp_count":
#         filters_data["based_on"] = "Creation"

#     elif widget_type == "closed_won":
#         filters_data["based_on"] = "Expected Date"
#         filters_data["sales_stage"] = ["Closed Won"]

#     elif widget_type == "closed_lost":
#         filters_data["based_on"] = "Expected Date"
#         filters_data["sales_stage"] = ["Closed Lost"]

#     elif widget_type == "renewal_count" or widget_type == "renewal_amount":
#         filters_data["based_on"] = "Creation"
#         filters_data["sales_stage"] = []
#         filters_data["opportunity_type"] = ["Renewal", "Additional"]

#     elif widget_type == "profit_amount":
#         filters_data["based_on"] = "Expected Date"
#         filters_data["sales_stage"] = ["Closed Won"]

#     # Get data
#     data = get_data(filters_data)

#     # Filter renewals if needed
#     if widget_type in ["renewal_count", "renewal_amount"]:
#         data = [d for d in data if d.get("opportunity_type") in ["Renewal", "Additional"]]

#     # Prepare output
#     out = []
#     for row in data:
#         out.append({
#             "name": row.get("name"),
#             "item_code": row.get("item_code"),
#             "party_name": row.get("party_name"),
#             "qty": row.get("qty"),
#             "amount": flt(row.get("amount")),
#             "expected_date": row.get("expected_date"),
#             "forecast": row.get("forecast"),
#             "opportunity_type": row.get("opportunity_type"),
#             "sales_person": row.get("sales_person"),
#             "sales_stage": row.get("sales_stage"),
#             "item_group": row.get("item_group"),
#             "brand": row.get("brand"),
#             "territory": row.get("territory"),
#             "buying_amount": flt(row.get("buying_amount")),
#             "margin": flt(row.get("margin")),
#             "gross_profit": flt(row.get("gross_profit")),
#             "net_profit": flt(row.get("net_profit")),
#             "mdf": flt(row.get("mdf")) or 0.0,
#             "orc": flt(row.get("orc")) or 0.0,
#             "support": flt(row.get("support"))
            
#         })


#     return out



@frappe.whitelist()
def get_closed_lost_amount_tm(time_filter1,sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Lost"],
    #"timespan": "this month",
    "timespan": time_filter1,
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

    return sum,data

@frappe.whitelist()
def get_renewal_count_tm(time_filter1,sales_person=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    #"timespan": "this month",
    "timespan": time_filter1,
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
    
    return count,data

@frappe.whitelist()
def get_renewal_amount_tm(time_filter1,sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    #"timespan": "this month",
    "timespan": time_filter1,
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

    return sum,data

@frappe.whitelist()
def get_profit_amount_tm(time_filter1,sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    #"timespan": "this month",
    "timespan": time_filter1,
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
        sum += flt(i.get("margin"))

    return sum,data    



@frappe.whitelist()
def get_funnel_data(time_filter1,sales_person= None):
   
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    #"timespan": "this month",
    "timespan": time_filter1,
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


#closures this week 
@frappe.whitelist()
def get_closure_opp_count_tw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
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
    
    return count,data

@frappe.whitelist()
def get_closure_opp_amount_tw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "forecast":"Include",
    "from_date": "2025-02-28",
    "sales_stage": ["Proposal","Initial Analysis","POC/Demos/Webinar/Session","Negotiation","Order Expected"],
    "timespan": "this week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    #columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum,data

@frappe.whitelist()
def get_closures_rnwls_count_tw(sales_person=None):
    # frappe.msgprint(sales_person)
    
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "forecast":"Include",
    "from_date": "2025-02-28",
    "timespan": "this week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl and i.opportunity_type in ["Renewal","Additional"]:
            list_rnwl.append(i.name)
            count += 1
    
    return count,data

@frappe.whitelist()
def get_closures_rnwls_amount_tw(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "forecast":"Include",
    "from_date": "2025-02-28",
    "timespan": "this week",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_rnwl = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl and i.opportunity_type in ["Renewal","Additional"]:
            list_rnwl.append(i.name)
            sum += flt(i.get("amount"))
    
    return sum,data

@frappe.whitelist()
def get_brand_wise_data_tw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    "timespan": "this week",
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
def get_item_group_wise_data_tw(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    "timespan": "this week",
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


#closures this month
@frappe.whitelist()
def get_closure_opp_count_tm(sales_person=None):
    week_date1, week_date2 = get_timespan_date_range("next week")
    from_date, to_date = get_timespan_date_range("this month")
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(week_date1)))
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(to_date)))
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "forecast":"Include",
    "from_date": week_date1,
    "sales_stage": [],
    "timespan": "custom",
    "to_date": to_date
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
    
    return count,data



@frappe.whitelist()
def get_closure_opp_amount_tm(sales_person=None):
    week_date1, week_date2 = get_timespan_date_range("next week")
    from_date, to_date = get_timespan_date_range("this month")
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "forecast":"Include",
    "from_date": week_date1,
    "sales_stage": [],
    "timespan": "custom",
    "to_date": to_date
    }
    
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum,data

@frappe.whitelist()
def get_closures_rnwls_count_tm(sales_person=None):
    # frappe.msgprint(sales_person)
    week_date1, week_date2 = get_timespan_date_range("next week")
    from_date, to_date = get_timespan_date_range("this month")
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "forecast":"Include",
    "from_date": week_date1,
    "sales_stage": [],
    "timespan": "custom",
    "to_date": to_date
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns()	
    data = get_data(filters_data)
    list_rnwl = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl and i.opportunity_type in ["Renewal","Additional"]:
            list_rnwl.append(i.name)
            count += 1
    
    return count,data

@frappe.whitelist()
def get_closures_rnwls_amount_tm(sales_person=None):
    # frappe.msgprint(sales_person)
    week_date1, week_date2 = get_timespan_date_range("next week")
    from_date, to_date = get_timespan_date_range("this month")
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "forecast":"Include",
    "from_date": week_date1,
    "sales_stage": [],
    "timespan": "custom",
    "to_date": to_date
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]

    columns = get_columns()	
    data = get_data(filters_data)
    list_rnwl = []
    sum =0.0
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_rnwl and i.opportunity_type in ["Renewal","Additional"]:
            list_rnwl.append(i.name)
            sum += flt(i.get("amount"))
    
    return sum,data

@frappe.whitelist()
def get_brand_wise_data_tm(sales_person=None):
    week_date1, week_date2 = get_timespan_date_range("next week")
    from_date, to_date = get_timespan_date_range("this month")
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": week_date1,
    "sales_stage": [],
    "timespan": "custom",
    "to_date": to_date
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
def get_item_group_wise_data_tm(sales_person=None):
    week_date1, week_date2 = get_timespan_date_range("next week")
    from_date, to_date = get_timespan_date_range("this month")
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": week_date1,
    "sales_stage": [],
    "timespan": "custom",
    "to_date": to_date
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
def get_open_opportunity_amount_tm(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "forecast":"Include",
    "from_date": "2025-02-28",
    "sales_stage": ["Proposal","Initial Analysis","POC/Demos/Webinar/Session","Negotiation","Order Committed","Prospecting"],
    "timespan": "this month",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    #columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    return sum

# # target this month

# @frappe.whitelist()
# def get_target_amount_tm(sales_person=None):
#     from_date, to_date = get_timespan_date_range("last week")
#     #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(from_date)))
    

#     condition = ""
#     if sales_person:
#         condition = f" and `tabSales Target`.sales_person  = '{sales_person}'"

#     total = frappe.db.sql(f"""
#         SELECT 
#              `tabSales Target`.bottomline_target   ,          
#             SUM(`tabSales Target`.bottomline_target / 12) AS monthly_average_target
#             FROM `tabSales Target`
#             LEFT JOIN `tabFiscal Year` ON `tabSales Target`.fiscal_year = `tabFiscal Year`.name
#             WHERE `tabFiscal Year`.year_start_date >= '{from_date}' {condition}
#         """, as_dict=True)
#     frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(total)))


#     return total 
 
from datetime import datetime
import frappe

@frappe.whitelist()
def get_target_amount(sales_person=None):
    conditions = ""
    values = []

    # Add sales person filter if provided
    if sales_person:
        conditions += " AND tsop.sales_person = %s"
        values.append(sales_person)

    # Get the current fiscal year
    current_date = datetime.today().date()
    current_fiscal_year = frappe.db.get_value(
        "Fiscal Year", 
        {
            "year_start_date": ["<=", current_date],
            "year_end_date": [">=", current_date]
        }, 
        "name"
    )

    if not current_fiscal_year:
        return {
            "bottomline_target": 0
        }

    # Add fiscal year condition
    conditions += " AND tsop.fiscal_year = %s"
    values.append(current_fiscal_year)

    # Final query
    result = frappe.db.sql(
        f"""
        SELECT 
            SUM(tsop.bottomline_target / 12) AS bottom
        FROM `tabSales Target` tsop
        WHERE 1=1 {conditions}
        """,
        values,
        as_dict=True
    )

    if result and result[0]:
        return {
            "bottomline_target": result[0].get("bottom", 0)
        }

    return {
        "bottomline_target": 0
    }

@frappe.whitelist()
def get_achieved_amount_tm(sales_person=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
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
        sum += flt(i.get("margin"))

    return sum,data  

