
from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate
from frappe.utils import get_timespan_date_range

from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import (
    get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data,get_monthly_data)


@frappe.whitelist()
def get_sales_person():
    current_user = frappe.session.user
    # 1. If Administrator or System Manager → return **all Sales Persons**
    if current_user == "Administrator" or "System Manager" in frappe.get_roles(current_user):
        #return frappe.get_all("Sales Person", pluck="name")
        sales_persons = frappe.get_all("Sales Person",filters={"enabled": 1}, pluck="name")
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
        filters={"parent_sales_person": current_sales_person,"enabled":1},
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

