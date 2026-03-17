
from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import (
    get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data,get_monthly_data)


# @frappe.whitelist()
# def get_sales_person():
#     current_user = frappe.session.user

#     # 1. If Administrator or System Manager → return **all Sales Persons**
#     if current_user == "Administrator" or "System Manager" in frappe.get_roles(current_user):
#         sales_persons = frappe.get_all("Sales Person",filters={"enabled": 1}, pluck="name")
#         return {
#             "sales_person_list": sales_persons,
#             "default_sales_person": ""
#         }

#     # 2. For normal users — get their Sales Person name via linked Employee
#     employee = frappe.get_value("Employee", {"user_id": current_user}, "name")
#     if not employee:
#         return {"sales_person_list": [], "default_sales_person": ""}

#     current_sales_person = frappe.get_value("Sales Person", {"employee": employee}, "name")
#     if not current_sales_person:
#         return {"sales_person_list": [], "default_sales_person": ""}

#     # 2a. If this salesperson is a team leader, return self + children
#     child_sales_persons = frappe.get_all(
#         "Sales Person",
#         filters={"parent_sales_person": current_sales_person,"enabled":1},
#         pluck="name"
#     )

#     if child_sales_persons:
#         return {
#             "sales_person_list": [current_sales_person] + child_sales_persons,
#             "default_sales_person": current_sales_person
#         }
    
#     return {
#         "sales_person_list": [current_sales_person],
#         "default_sales_person": current_sales_person
#     }

@frappe.whitelist()
def get_sales_person():
    current_user = frappe.session.user

    # 1. If Administrator or System Manager → return all active Sales Persons (linked to active employees)
    if current_user == "Administrator" or "System Manager" in frappe.get_roles(current_user):
        # Get all Sales Persons with enabled=1 and linked to active employees
        sales_persons = frappe.db.sql("""
            SELECT sp.name
            FROM `tabSales Person` sp
            LEFT JOIN `tabEmployee` e ON sp.employee = e.name
            WHERE sp.enabled = 1 AND e.status = 'Active'
        """, as_dict=True)
        return {
            "sales_person_list": [sp["name"] for sp in sales_persons],
            "default_sales_person": ""
        }

    # 2. For normal users — get their Sales Person name via linked Employee
    employee = frappe.get_value("Employee", {"user_id": current_user, "status": "Active"}, "name")
    if not employee:
        return {"sales_person_list": [], "default_sales_person": ""}

    current_sales_person = frappe.get_value("Sales Person", {"employee": employee, "enabled": 1}, "name")
    if not current_sales_person:
        return {"sales_person_list": [], "default_sales_person": ""}

    # 2a. If this salesperson is a team leader, return self + active children
    child_sales_persons = frappe.db.sql("""
        SELECT sp.name
        FROM `tabSales Person` sp
        LEFT JOIN `tabEmployee` e ON sp.employee = e.name
        WHERE sp.parent_sales_person = %s AND sp.enabled = 1 AND e.status = 'Active'
    """, (current_sales_person,), as_dict=True)

    child_names = [sp["name"] for sp in child_sales_persons]
    return {
        "sales_person_list": [current_sales_person] + child_names,
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
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_person)))
    from_date, to_date = get_timespan_date_range("last week")

    condition = ""
    if sales_person:
        condition = f"and sales_person = '{sales_person}'"

    name = frappe.db.sql(f"""
        SELECT COUNT(DISTINCT tc.name) AS name
        FROM tabCustomer tc 
        WHERE tc.creation BETWEEN '{from_date}' AND '{to_date}'  {condition}
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

@frappe.whitelist()
def get_calls_count(sales_person=None):
    from_date, to_date = get_timespan_date_range("last week")
    
    condition = ""
    values = [from_date, to_date]

    if sales_person:
        condition = "AND st.sales_person = %s"
        values.append(sales_person)

    query = f"""
        SELECT COUNT(DISTINCT cl.name) AS total 
        FROM `tabCall List` AS cl
        LEFT JOIN `tabSales Team` AS st ON st.parent = cl.name
        WHERE cl.creation BETWEEN %s AND %s {condition}
    """

    result = frappe.db.sql(query, values, as_dict=True)

    return result[0]["total"] if result else 0


# @frappe.whitelist()
# def get_training_count(sales_person=None):

#     return name
# @frappe.whitelist()
# def get_sessions_count(sales_person=None):

#     return name


import frappe
from frappe.utils import  getdate
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta
from datetime import timedelta

@frappe.whitelist()
def get_weekly_activity_data(sales_person=None):
    try:
        from_date, to_date = get_timespan_date_range("last week")
        # Initialize filters
        employee = None
        email_id = None

        if sales_person:
            employee = frappe.db.get_value("Sales Person", sales_person, "employee")
            if employee:
                email_id = frappe.db.get_value("Employee", employee, "user_id")

        def get_data(doctype, date_field):
            condition = ""
            params = [from_date, to_date]

            if sales_person:
                if doctype in ["Customer", "Call List"]:
                    condition += f"""
                        AND EXISTS (
                            SELECT 1 FROM `tabSales Team` st
                            WHERE st.parent = `{doctype}`.name AND st.sales_person = %s
                        )
                    """
                    params.append(sales_person)
                elif doctype == "Appointment" and email_id:
                    condition += " AND `{}`.owner = %s".format(doctype)
                    params.append(email_id)

            query = f"""
                SELECT DATE({date_field}) AS day, COUNT(*) AS total
                FROM `tab{doctype}` `{doctype}`
                WHERE {date_field} BETWEEN %s AND %s {condition}
                GROUP BY DATE({date_field})
                ORDER BY day
            """

            try:
                data = frappe.db.sql(query, tuple(params), as_dict=True)
                # Format date as dd-mm-yy
                return {row.day.strftime("%d-%m-%y"): row.total for row in data}
            except Exception as e:
                frappe.log_error(frappe.get_traceback(), f"Error fetching {doctype} data")
                return {}

        # Get data
        customers = get_data("Customer", "creation")
        appointments = get_data("Appointment", "creation")
        calls = get_data("Call List", "creation")

        # Week days in dd-mm-yy format
        days = []
        current = getdate(from_date)
        while current <= getdate(to_date):
            days.append(current.strftime("%d-%m-%y"))
            current += timedelta(days=1)

        return {
            "labels": days,
            "datasets": {
                "customers": [customers.get(day, 0) for day in days],
                "appointments": [appointments.get(day, 0) for day in days],
                "calls": [calls.get(day, 0) for day in days],
            }
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_weekly_activity_data Error")
        frappe.throw("Server Error. Please check error log.")



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
    "to_date": "2025-03-07",
    "opportunity_type": ["Renewal","Additional"]
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
    "to_date": "2025-03-07",
    "opportunity_type": ["Renewal","Additional"]
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
        sum += flt(i.get("net_profit"))

    return sum,data


@frappe.whitelist()
def get_brand_wise_data_lw(time_filter1,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    #"timespan": "last week",
    "timespan":time_filter1,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter1 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date  
    
    columns = get_columns()	
    data = get_brand_data(filters_data)
    data1 = get_data(filters_data)
    brand = []
    amounts = [] 
    counts = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        brand.append(i.brand)
        amounts.append(flt(i.get("amount")))
        

    return {"brand": brand,"data":data1, "amounts": amounts}

@frappe.whitelist()
def get_item_group_wise_data_lw(time_filter1,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    #"timespan": "last week",
    "timespan":time_filter1,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter1 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date  
    columns = get_columns()	
    data = get_item_group_data(filters_data)
    data1 = get_data(filters_data)
    list_opp = []
    amount =[]
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        list_opp.append(i.item_group)
        amount.append(flt(i.get("amount")))
    return {"item_group": list_opp, "amounts": amount,"data":data1}  


#this month

@frappe.whitelist()
def get_opp_count_tm(time_filter1, sales_person=None,from_date=None, to_date=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    #"timespan": "this month",
    "timespan": time_filter1,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter1 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date    
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_opp:
            list_opp.append(i.name)
            count += 1
    
    #return count,data
    return {"count": count, "data": data}

@frappe.whitelist()
def get_closed_won_amount_tm(time_filter1,sales_person=None,from_date=None, to_date=None):
   
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    #"timespan": "this month",
    "timespan": time_filter1,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter1 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date     
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    #return sum ,data 
    return {"sum": sum, "data": data}



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
def get_closed_lost_amount_tm(time_filter1,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Lost"],
    #"timespan": "this month",
    "timespan": time_filter1,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter1 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date 
    columns = get_columns()	
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters_data)))
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("amount"))

    #return sum,data
    return {"sum": sum, "data": data}

@frappe.whitelist()
def get_renewal_count_tm(time_filter1,sales_person=None,from_date=None, to_date=None):
    
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    #"timespan": "this month",
    "timespan": time_filter1,
    #"to_date": "2025-03-07",
    "opportunity_type": ["Renewal","Additional"]
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter1 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date 
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    count =0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.name not in list_opp and i.opportunity_type in ["Renewal","Additional"]:
            
            list_opp.append(i.name)
            count += 1
    
    #return count,data
    return {"count": count, "data": data}

@frappe.whitelist()
def get_renewal_amount_tm(time_filter1,sales_person=None,from_date=None, to_date=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    #"timespan": "this month",
    "timespan": time_filter1,
    #"to_date": "2025-03-07",
    "opportunity_type": ["Renewal","Additional"]
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter1 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date 
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        if i.opportunity_type in ["Renewal","Additional"]:
            sum += flt(i.get("amount"))

    #return sum,data
    return {"sum": sum, "data": data}

@frappe.whitelist()
def get_profit_amount_tm(time_filter1,sales_person=None,from_date=None, to_date=None):
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    #"from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": ["Closed Won"],
    #"timespan": "this month",
    "timespan": time_filter1,
    #"to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    # Use custom date range if provided
    if time_filter1 == "custom" and from_date and to_date:
        filters_data["from_date"] = from_date
        filters_data["to_date"] = to_date 
    columns = get_columns()	
    data = get_data(filters_data)
    list_opp = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        sum += flt(i.get("net_profit"))

    #return sum,data 
    return {"sum": sum, "data": data}   



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
    
    return {"count": count, "data": data}

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

    return {"sum": sum, "data": data}

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
    "to_date": "2025-03-07",
    "opportunity_type": ["Renewal","Additional"]
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
    
    return {"count": count, "data": data}

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
    "to_date": "2025-03-07",
    "opportunity_type": ["Renewal","Additional"]
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
    
    return {"sum": sum, "data": data}

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
    data1 = get_data(filters_data)
    brand = []
    amounts = [] 
    counts = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        brand.append(i.brand)
        amounts.append(flt(i.get("amount")))
        

    return {"brand": brand, "amounts": amounts,"data": data1}

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
    data1 = get_data(filters_data)
    list_opp = []
    amount =[]
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        list_opp.append(i.item_group)
        amount.append(flt(i.get("amount")))
    return {"item_group": list_opp, "amounts": amount,"data":data1}  


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
    
    return {"count": count, "data": data}



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

    return {"sum": sum, "data": data}

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
    "to_date": to_date,
    "opportunity_type": ["Renewal","Additional"]
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
    
    return {"count": count, "data": data}

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
    "to_date": to_date,
    "opportunity_type": ["Renewal","Additional"]
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
    
    return {"sum": sum, "data": data}

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
    data1 = get_data(filters_data)
    brand = []
    amounts = [] 
    counts = []
    sum =0.0
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        brand.append(i.brand)
        amounts.append(flt(i.get("amount")))
        

    return {"brand": brand, "amounts": amounts,"data": data1}

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
    data1 = get_data(filters_data)
    list_opp = []
    amount =[]
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    for i in data:
        list_opp.append(i.item_group)
        amount.append(flt(i.get("amount")))
    return {"item_group": list_opp, "amounts": amount,"data":data1}  

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

    return sum,data

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
 
from datetime import datetime, date
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
        sum += flt(i.get("net_profit"))

    return sum,data  

@frappe.whitelist()
def get_opportunity_target_data(sales_person=None):
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json("hello")))
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Team`.sales_person = '{sales_person}'"
    
    
    # Get the current date
    current_date = date.today()

    # Get the current fiscal year
    current_fiscal_year = frappe.get_all('Fiscal Year', filters={'year_start_date': ['<=', current_date], 'year_end_date': ['>=', current_date]}, fields=['name'])
    fiscal_year1 = current_fiscal_year[0]['name']
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(fiscal_year1)))
    # Fetch actual data
    
    sales_data = frappe.db.sql(f"""
        select             tsop.fiscal_year,  
            CASE
                WHEN MONTH(tsop.expected_date) >= MONTH(tsop.year_start_date)
                THEN MONTH(tsop.expected_date) - MONTH(tsop.year_start_date) + 1
                ELSE MONTH(tsop.expected_date) + 12 - MONTH(tsop.year_start_date) + 1
            END AS fiscal_month,
            CASE
                WHEN MONTH(tsop.expected_date) >= MONTH(tsop.year_start_date)
                THEN
                CASE MONTH(tsop.expected_date) - MONTH(tsop.year_start_date) + 1
                    WHEN 1 THEN CONCAT('Apr ', YEAR(tsop.year_start_date))
                    WHEN 2 THEN CONCAT('May ', YEAR(tsop.year_start_date))
                    WHEN 3 THEN CONCAT('Jun ', YEAR(tsop.year_start_date))
                    WHEN 4 THEN CONCAT('Jul ', YEAR(tsop.year_start_date))
                    WHEN 5 THEN CONCAT('Aug ', YEAR(tsop.year_start_date))
                    WHEN 6 THEN CONCAT('Sep ', YEAR(tsop.year_start_date))
                    WHEN 7 THEN CONCAT('Oct ', YEAR(tsop.year_start_date))
                    WHEN 8 THEN CONCAT('Nov ', YEAR(tsop.year_start_date))
                    WHEN 9 THEN CONCAT('Dec ', YEAR(tsop.year_start_date))
                    WHEN 10 THEN CONCAT('Jan ', YEAR(tsop.year_start_date) + 1) -- For the next year
                    WHEN 11 THEN CONCAT('Feb ', YEAR(tsop.year_start_date) + 1)
                    WHEN 12 THEN CONCAT('Mar ', YEAR(tsop.year_start_date) + 1)
                END
                ELSE
                    CASE MONTH(tsop.expected_date) + 12 - MONTH(tsop.year_start_date) + 1
                        WHEN 1 THEN CONCAT('Apr ', YEAR(tsop.year_start_date))
                        WHEN 2 THEN CONCAT('May ', YEAR(tsop.year_start_date))
                        WHEN 3 THEN CONCAT('Jun ', YEAR(tsop.year_start_date))
                        WHEN 4 THEN CONCAT('Jul ', YEAR(tsop.year_start_date))
                        WHEN 5 THEN CONCAT('Aug ', YEAR(tsop.year_start_date))
                        WHEN 6 THEN CONCAT('Sep ', YEAR(tsop.year_start_date))
                        WHEN 7 THEN CONCAT('Oct ', YEAR(tsop.year_start_date))
                        WHEN 8 THEN CONCAT('Nov ', YEAR(tsop.year_start_date))
                        WHEN 9 THEN CONCAT('Dec ', YEAR(tsop.year_start_date))
                        WHEN 10 THEN CONCAT('Jan ', YEAR(tsop.year_start_date) + 1) -- For the next year
                        WHEN 11 THEN CONCAT('Feb ', YEAR(tsop.year_start_date) + 1)
                        WHEN 12 THEN CONCAT('Mar ', YEAR(tsop.year_start_date) + 1)
                    END
            END AS Month,
            (SUM(DISTINCT `bottomline_target`)* COUNT(DISTINCT `tabSales Target`.`sales_person`))/(12*COUNT(DISTINCT `bottomline_target`))  AS `Bottomline Target`,
             SUM(tsop.net_profit) AS `Achieved`,
                ((SUM(DISTINCT `bottomline_target`)* COUNT(DISTINCT `tabSales Target`.`sales_person`))/(12*COUNT(DISTINCT `bottomline_target`)) - SUM(tsop.net_profit)) as Variance,
                AVG(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Average,
                MAX(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Max_Achieved,
                MIN(SUM(tsop.net_profit)) OVER (PARTITION BY tsop.fiscal_year) AS Min_Achieved
            from
            `tabSales Target`
            Inner join
            (
            select
				toi.parent,
				toi.expected_date as expected_date,
				`tabFiscal Year`.name as fiscal_year,
				`tabFiscal Year`.year_start_date as year_start_date,
				`tabFiscal Year`.year_end_date as year_end_date,
				`tabOpportunity`.party_name,
				 toi.item_code,
				toi.item_name, toi.description,
				toi.item_group,
				toi.brand, 
				toi.qty as qty,
				toi.rate, toi.amount,
				(CASE when tpq.qty IS NULL  then 0 
				else tpq.qty END )as purchase_qty ,
				(CASE when tpq.rate IS NULL  then 0 
				else tpq.rate END )as buying_rate,
				(CASE when tpq.amount IS NULL  then 0
				else tpq.amount END )as buying_amount,
				(CASE when tpq.amount IS NULL  then  0
				else toi.amount - tpq.amount END )as margin,
				(CASE when toi.orc = 1 then torc.commission_amount
				else 0 END) as orc,
				(CASE 
				when tpq.amount  IS NULL and torc.commission_amount IS NULL  then 0
				when tpq.amount  IS NULL and torc.commission_amount IS not NULL  then toi.amount - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS not NULL then (toi.amount - tpq.amount) - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS NULL then toi.amount - tpq.amount
				else 0  END )as profit ,
				(CASE 
				when tpq.amount  IS NULL and torc.commission_amount IS NULL  then 0
				when tpq.amount  IS NULL and torc.commission_amount IS not NULL  then toi.amount - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS not NULL then (toi.amount - tpq.amount) - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS NULL then toi.amount - tpq.amount
				else 0  END )* 0.1 as support,
				(CASE 
				when tpq.amount  IS NULL and torc.commission_amount IS NULL  then 0
				when tpq.amount  IS NULL and torc.commission_amount IS not NULL  then toi.amount - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS not NULL then (toi.amount - tpq.amount) - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS NULL then toi.amount - tpq.amount
				else 0  END) * 0.1 as MDF,
				(CASE 
				when tpq.amount  IS NULL and torc.commission_amount IS NULL  then 0
				when tpq.amount  IS NULL and torc.commission_amount IS not NULL  then toi.amount - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS not NULL then (toi.amount - tpq.amount) - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS NULL then toi.amount - tpq.amount
				else 0  END ) -( (CASE 
				when tpq.amount  IS NULL and torc.commission_amount IS NULL  then 0
				when tpq.amount  IS NULL and torc.commission_amount IS not NULL  then toi.amount - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS not NULL then (toi.amount - tpq.amount) - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS NULL then toi.amount - tpq.amount
				else 0  END )*0.1 +(CASE 
				when tpq.amount  IS NULL and torc.commission_amount IS NULL  then 0
				when tpq.amount  IS NULL and torc.commission_amount IS not NULL  then toi.amount - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS not NULL then (toi.amount - tpq.amount) - torc.commission_amount
				WHEN tpq.amount is not NULL and torc.commission_amount IS NULL then toi.amount - tpq.amount
				else 0  END)* 0.1) as net_profit,
				`tabSales Team`.sales_person,
				(CASE when tpq.supplier IS NULL  then Null
				else tpq.supplier END )as supplier,
				(CASE when tpq.name IS NULL   then Null
				else tpq.name END )as supplier_quotation,
				tu.full_name as user
	from
			    `tabOpportunity` inner join `tabOpportunity Item` toi on toi.parent = `tabOpportunity`.name
				left join
				(SELECT tsq.name as name, tsq.supplier as supplier  , tsqi.item_code as item_code , tsqi.rate as rate ,
				 tsqi.qty as qty, tsqi.amount as amount, tsq.opportunity as opportunity, tsqi.description as description
				from `tabSupplier Quotation` tsq 
				left join 
				(SELECT parent , item_code , rate, qty, amount, description   FROM `tabSupplier Quotation Item`  WHERE recommended_ =1
				) as
				tsqi on tsqi.parent = tsq.name 
				) as
				tpq on tpq.opportunity = toi.parent and toi.item_code = tpq.item_code and toi.qty = tpq.qty and tpq.description = toi.description
				LEFT JOIN 
				(SELECT toi2.commission_amount as commission_amount, tol.opportunity_id as opportunity_id,
				toi2.item_code as item_code , toi2.qty as qty ,
				toi2.rate as rate , toi2.description as description 
				FROM `tabORC Item` toi2 
				left join `tabORC List` tol on toi2.parent = tol.name
				WHERE tol.docstatus  = 1) as torc on  torc.opportunity_id = toi.parent and toi.item_code = torc.item_code 
				and toi.qty = torc.qty and toi.rate = torc.rate and toi.description = torc.description
				LEFT JOIN `tabSales Team` on toi.parent = `tabSales Team`.parent
				LEFT JOIN `tabUser` tu on `tabSales Team`.sales_person = tu.full_name
				LEFT JOIN `tabFiscal Year`  on `tabFiscal Year`.year_start_date <= toi.expected_date  and toi.expected_date <= `tabFiscal Year`.year_end_date
        where
                  toi.sales_stage="Closed Won" AND  `tabFiscal Year`.name = '{fiscal_year1}' {condition}
                GROUP BY
                        toi.name
                order by
                    `tabOpportunity`.name desc) as tsop on `tabSales Target`.sales_person = tsop.sales_person and
                    `tabSales Target`.fiscal_year= tsop.fiscal_year
        GROUP BY
        tsop.fiscal_year, Month        
    ORDER BY
        tsop.fiscal_year DESC, fiscal_month ASC;
	
    """, as_dict=True)

    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_data)))
    
    
    result = []

    for data in sales_data:
        
        
        
        result.append({
            "fiscal_year": data.fiscal_year,
            "fiscal_month": data.month,
            "Month": data.month,
            "Bottomline Target": data.bottomline_target,
            "Achieved": data.achieved,
            "Variance": data.variance  # Corrected ABS usage
        })
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(result)))    

    return sales_data   

#target Section
from datetime import datetime, date
import frappe

@frappe.whitelist()
def get_topline_target(sales_person=None):
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
            "topline_target": 0
        }

    # Add fiscal year condition
    conditions += " AND tsop.fiscal_year = %s"
    values.append(current_fiscal_year)

    # Final query
    result = frappe.db.sql(
        f"""
        SELECT 
            SUM(tsop.topline_target / 12) AS top
        FROM `tabSales Target` tsop
        WHERE 1=1 {conditions}
        """,
        values,
        as_dict=True
    )

    if result and result[0]:
        return {
            "topline_target": result[0].get("top", 0)
        }

    return {
        "topline_target": 0
    }

@frappe.whitelist()
def get_topline_achieved(sales_person=None):
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
        sum += flt(i.get("amount"))

    return {"topline_achieved": sum, "data": data}

@frappe.whitelist()
def get_bottomline_target(sales_person=None):
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
def get_bottomline_achieved(sales_person=None):
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
        sum += flt(i.get("net_profit"))

    return {"bottomline_achieved": sum, "data": data}



@frappe.whitelist()
def get_renewal_amount(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    "timespan": "this month",
    "to_date": "2025-03-07",
    "opportunity_type": ["Renewal","Additional"]
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
            sum += flt(i.get("net_profit"))

    return {"amount": sum, "data": data}


@frappe.whitelist()
def get_new_amount(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    "timespan": "this month",
    "to_date": "2025-03-07",
    "opportunity_type": ["New"]
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
        if i.opportunity_type in ["New"]:
            sum += flt(i.get("net_profit"))

    return {"amount": sum, "data": data}  

@frappe.whitelist()
def get_renewal_amount_tt(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    "timespan": "this month",
    "to_date": "2025-03-07",
    "opportunity_type": ["Renewal","Additional"]
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

    return {"amount": sum, "data": data}


@frappe.whitelist()
def get_new_amount_tt(sales_person=None):
    # frappe.msgprint(sales_person)
    filters_data = {
    "based_on": "Expected Date",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "forecast":"Include",
    "sales_stage": [],
    "timespan": "this month",
    "to_date": "2025-03-07",
    "opportunity_type": ["New"]
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
        if i.opportunity_type in ["New"]:
            sum += flt(i.get("amount"))

    return {"amount": sum, "data": data}       


# bar chart of opportunity status
# @frappe.whitelist()
# def get_opp_status_chart(time_filter5, periodicity="monthly", sales_person=None, from_date=None, to_date=None):
#     filters_data = {
#         "based_on": "Expected Date",
#         "company": "64 Network Security Pvt Ltd - TG",
#         "forecast": "Include",
#         "timespan": time_filter5,
#     }
#     if sales_person:
#         filters_data["sales_person"] = [sales_person]

#     if time_filter5 == "custom" and from_date and to_date:
#         filters_data["from_date"] = from_date
#         filters_data["to_date"] = to_date

#     data = get_data(filters_data)
#     frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters_data)))
#     result = []
#     for i in data:
#         status = i.get("sales_stage")
#         amount = flt(i.get("amount"))
#         opp_date = i.get("expected_date")
#         opp_date = frappe.utils.getdate(opp_date)  # always a date object now

#         # Group by granularity
#         if periodicity == "daily":
#             period = opp_date.strftime("%Y-%m-%d")
#         elif periodicity == "weekly":
#             year, week_no, _ = opp_date.isocalendar()  # ISO week
#             period = f"Week {week_no} {year}"
#         elif periodicity == "monthly":
#             period = opp_date.strftime("%b %Y")
#         elif periodicity == "quarterly":
#             quarter = (opp_date.month - 1) // 3 + 1
#             period = f"Q{quarter}-{opp_date.year}"
#         else:  # yearly
#             period = str(opp_date.year)
#         frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(periodicity)))    

#         result.append({
#             "period": period,
#             "status": status,
#             "count": 1,
#             "amount": amount
#         })
    # chart_data = []
    # for row in result:
    #     existing = next((x for x in chart_data if x["period"] == row["period"] and x["status"] == row["status"]), None)
    #     if existing:
    #         existing["count"] += row["count"]
    #         existing["amount"] += row["amount"]
    #     else:
    #         chart_data.append({
    #             "period": row["period"],
    #             "status": row["status"],
    #             "count": row["count"],
    #             "amount": row["amount"]
    #         })
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(chart_data)))
    # return chart_data




import frappe
from frappe.utils import getdate, formatdate, add_months
from datetime import timedelta
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import get_data

@frappe.whitelist()
def get_opp_status_chart(time_filter5, periodicity="Monthly", sales_person=None, from_date=None, to_date=None,  sales_stages=None):
    """
    Returns an array of dicts: {period, status, count, amount}
    """
    #frappe.msgprint("<pre>SALES STAGE: {}</pre>".format(frappe.as_json(sales_stages)))  
    # Step 1: Get date range
    if not (from_date and to_date):
        from_date, to_date = get_timespan_date_range(time_filter5)

    periods = get_periods(from_date, to_date, periodicity)

    # Ensure sales_stages is a list (handle cases where it comes as JSON string)
    if isinstance(sales_stages, str):
        import json
        sales_stages = json.loads(sales_stages)
    #frappe.msgprint("<pre>PERIODS: {}</pre>".format(frappe.as_json(sales_stages)))    

    result = []

    # Step 2: Loop through periods and collect data
    for period in periods:
        filters_data = {
            "based_on": "Expected Date",
            "brand": [],
            "company": "64 Network Security Pvt Ltd - TG",
            "from_date": period["from_date"],
            "to_date": period["to_date"],
            "sales_stage": sales_stages,
            "forecast": "Include",
            "timespan": "custom"
        }

        if sales_person:
            filters_data["sales_person"] = [sales_person]

        data = get_data(filters_data)

        total_amount = 0
        total_count = 0

        for row in data:
            amount = row.get("amount", 0) or 0
            total_amount += amount
            total_count += 1

        result.append({
            "period": period["label"],
            "count": total_count,
            "amount": total_amount
        })

    # Step 3: Aggregate by period + status
    chart_data = []
    for row in result:
        existing = next((x for x in chart_data if x["period"] == row["period"] ), None)
        if existing:
            existing["count"] += row["count"]
            existing["amount"] += row["amount"]
        else:
            chart_data.append({
                "period": row["period"],
                "count": row["count"],
                "amount": row["amount"]
            })

    return chart_data


# def get_periods(from_date, to_date, periodicity):
#     """
#     Splits a date range into periods based on periodicity.
#     Returns a list of dicts with 'from_date', 'to_date', 'label'.
#     """
#     from_date = getdate(from_date)
#     to_date = getdate(to_date)
#     periods = []

#     current_start = from_date

#     while current_start <= to_date:
#         if periodicity.lower() == "monthly":
#             next_start = add_months(current_start, 1)
#         elif periodicity.lower() == "quarterly":
#             next_start = add_months(current_start, 3)
#         elif periodicity.lower() == "yearly":
#             next_start = add_months(current_start, 12)
#         elif periodicity.lower() == "weekly":
#             next_start = current_start + timedelta(days=7)
#         else:
#             next_start = add_months(current_start, 1)  # default to monthly

#         current_end = min(to_date, next_start - timedelta(days=1))
#         label = f"{formatdate(current_start)} to {formatdate(current_end)}"

#         periods.append({
#             "from_date": current_start,
#             "to_date": current_end,
#             "label": label
#         })

#         current_start = next_start

#     return periods


from frappe.utils import getdate
from datetime import timedelta
from dateutil.relativedelta import relativedelta  # ✅ Correct import

def get_periods(from_date, to_date, periodicity):
    from_date = getdate(from_date)
    to_date = getdate(to_date)
    periods = []

    current_start = from_date

    while current_start <= to_date:
        if periodicity.lower() == "monthly":
            next_start = current_start + relativedelta(months=1)
            label = current_start.strftime("%b %Y")

        elif periodicity.lower() == "quarterly":
            quarter = ((current_start.month - 1) // 3) + 1
            label = f"Q{quarter} {current_start.year}"
            next_start = current_start + relativedelta(months=3)

        elif periodicity.lower() == "yearly":
            label = str(current_start.year)
            next_start = current_start + relativedelta(months=12)

        elif periodicity.lower() == "weekly":
            week_number = current_start.isocalendar()[1]
            label = f"Week {week_number}, {current_start.strftime('%b %Y')}"
            next_start = current_start + timedelta(days=7)

        else:
            # fallback to monthly
            next_start = current_start + relativedelta(months=1)
            label = current_start.strftime("%b %Y")

        current_end = min(to_date, next_start - timedelta(days=1))

        periods.append({
            "from_date": current_start,
            "to_date": current_end,
            "label": label
        })

        current_start = next_start

    return periods

@frappe.whitelist()
def get_opp_table_data(period, time_filter5=None, periodicity=None, from_date=None, to_date=None,sales_person=None , sales_stages=None):
    """
    Fetch opportunity records for clicked bar (status + period).
    Defensive: return JSON-friendly error dict on problems and log traceback.
    """
    try:
        # Debug (remove after troubleshooting)
        #frappe.msgprint(f"DEBUG input =>period={period}, time_filter5={time_filter5}, "
                        #f"periodicity={periodicity}, from_date={from_date}, to_date={to_date}, sales_person={sales_person}")
        #frappe.msgprint("<pre>SALES STAGE: {}</pre>".format(frappe.as_json(sales_stages)))
        if isinstance(sales_stages, str):
            import json
            try:
                sales_stages = json.loads(sales_stages)
            except Exception:
                sales_stages = []
        # 1) If not custom, derive from_date/to_date from the timespan helper
        if time_filter5 and time_filter5 != "custom":
            from_date, to_date = get_timespan_date_range(time_filter5)

        # 2) If custom, ensure values exist and are valid dates
        if time_filter5 == "custom":
            if not (from_date and to_date):
                # return structured error (no HTML 500)
                return {"error": "Custom timespan requires from_date and to_date"}

            # convert to date objects safely
            try:
                from_date = getdate(from_date)
                to_date = getdate(to_date)
            except Exception as e:
                return {"error": f"Invalid date format for from_date/to_date: {e}"}

        # 3) Build periods; guard against unexpected None / empty returns
        periods = get_periods(from_date, to_date, periodicity)
        #frappe.msgprint("<pre>PERIODS: {}</pre>".format(frappe.as_json(periods)))

        if not periods:
            return []  # no periods => nothing to show

        period_range = next((p for p in periods if p.get("label") == period), None)
        #frappe.msgprint("<pre>PERIOD RANGE: {}</pre>".format(frappe.as_json(period_range)))

        if not period_range:
            return []

        # 4) Prepare filters and fetch data
        filters_data = {
            "based_on": "Expected Date",
            "brand": [],
            "from_date": period_range["from_date"],
            "to_date": period_range["to_date"],
            "forecast": "Include",
            "timespan": "custom",
            "company": "64 Network Security Pvt Ltd - TG",
            "sales_stage": sales_stages
        }
        if sales_person:
            filters_data["sales_person"] = [sales_person]

        data = get_data(filters_data)
        return data

    except Exception as e:
        # log full traceback to Frappe error log, return tidy error to client
        frappe.log_error(frappe.get_traceback(), "get_opp_table_data")
        return {"error": f"Server error: {e}"}

