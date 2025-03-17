
from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data



@frappe.whitelist()
def get_total_amount(sales_person=None):
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
def get_won_amount(sales_person=None):
   
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [sales_person],
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
def get_lost_amount(sales_person=None):
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [sales_person],
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
def get_opp_count(sales_person=None):
    
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



@frappe.whitelist()
def get_opportunity_data(sales_person=None):
    # frappe.msgprint("brand")
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "item_group": [],
    "opportunity_type": [],
    "party_name": [],
    "sales_person": [sales_person],
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_brand_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))
    return data    


@frappe.whitelist()
def get_item_group(sales_person=None):
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
    "sales_person": [sales_person],
    "sales_stage": ["Closed Won"],
    "timespan": "last week",
    "to_date": "2025-03-07"
    }
    columns = get_columns()	
    data = get_item_group_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))
    return data



#funnel data
@frappe.whitelist()
def get_funnel_data(sales_person= None):
    # frappe.msgprint("funnel")
    # frappe.msgprint(sales_person)
    # Count Active Leads
    # active_leads = frappe.db.sql(
    #     """SELECT COUNT(*) FROM `tabLead`""", as_list=True
    # )[0][0]

    # Count Opportunities from Leads
    # opportunities = frappe.db.sql(
    #     """SELECT COUNT(*) FROM `tabOpportunity` 
    #     WHERE opportunity_from = 'Lead'""", as_list=True
    # )[0][0]

    # # Count Quotations Linked to Opportunities or Leads
    # quotations = frappe.db.sql(
    #     """SELECT COUNT(*) FROM `tabQuotation`
    #     WHERE docstatus = 1 
    #     AND (opportunity IS NOT NULL AND opportunity != '' OR quotation_to = 'Lead')""", 
    #     as_list=True
    # )[0][0]

    # # Count Converted Leads (Leads that became Customers)
    # converted = frappe.db.sql(
    #     """SELECT COUNT(*) FROM `tabCustomer`
    #     WHERE lead_name IS NOT NULL""", as_list=True
    # )[0][0]

    # return [
    #     {"title": _("Active Leads"), "value": active_leads, "color": "#B03B46"},
    #     {"title": _("Opportunities"), "value": opportunities, "color": "#F09C00"},
    #     {"title": _("Quotations"), "value": quotations, "color": "#006685"},
    #     {"title": _("Converted"), "value": converted, "color": "#00AD65"},
    # ]
    filters_data = {
    "based_on": "Expected Date",
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
    data = get_sales_stage_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        # j = {i.items()}
        if i["sales_stage"] == "Closed Won":
            i["color"] = "#00AD65"
        if i["sales_stage"] == "Initial Analysis":
            i["color"] = "#f09124"
        if i["sales_stage"] == "Proposal":
            i["color"] = "#f7d76d"
        if i["sales_stage"] == "Negotiation":
            i["color"] = "#4ff5f7"            
        if i["sales_stage"] == "Dead":
            i["color"] = "#ed091c"
        if i["sales_stage"] == "Closed lost":
            i["color"] = "#ed091c"            
        list_opp.append(i)    


    return list_opp
         
#sales person
@frappe.whitelist()
def get_sales_person():
    user = frappe.session.user  # Get the logged-in user

    if user == "Administrator":
        sales_persons = frappe.get_all("Sales Person", pluck="name")  # Get all salespersons
        return sales_persons  # Return list of all salespersons

    else:
        employee = frappe.get_value("Employee", {"user_id": user}, "name")  # Find Employee linked to user
        if employee:
            sales_person = frappe.get_value("Sales Person", {"employee": employee}, "name")  # Get Sales Person linked to Employee
            return [sales_person] if sales_person else []  # Return list with single salesperson

    return []  # Return empty list if no salesperson is found         