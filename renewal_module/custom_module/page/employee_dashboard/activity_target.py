import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate
from datetime import date

from frappe.utils import getdate, formatdate
from frappe.utils import get_first_day, get_last_day, nowdate
from dateutil import relativedelta
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import (
    get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data,get_monthly_data)

@frappe.whitelist()
def get_calls_tm(sales_person=None):
    
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"
    data = get_activity_target("Calls",condition)  
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    achv_data = get_calls_achieved_tm(sales_person)
    count = 0
    if achv_data:
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(achv_data)))
        for each in achv_data:
            count += 1  
            
    
    if data:
        return {"target":data[0][0],"achieved":count}
    
@frappe.whitelist()
def get_calls_achieved_tm(sales_person=None):
    start = get_first_day(nowdate())
    end = get_last_day(nowdate())
    condition = ""
    if sales_person:
        condition = f" AND st.sales_person = '{sales_person}'"

    data = frappe.db.sql(f"""
        SELECT
            c.name as call_id,
            c.related_to as related_to,
            c.name1 as customer_contact,
            c.subject as subject,
            c.start_date as start_date,
            c.start_timing as starting_time,
            c.end_date as end_date,
            c.end_timing as end_timing,
            c.status as status,
            c.direction as direction,
            c.description as description,
            st.sales_person as sales_person
        FROM `tabCall List` as c
        Left Join `tabSales Team` as st on st.parent=c.name
        WHERE 1=1 {condition} AND c.creation BETWEEN '{start}' AND '{end}'
        ORDER BY c.start_date DESC
    """, as_dict=True)
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))  
    return data


@frappe.whitelist()
def get_appointments_tm(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"

    data = get_activity_target("Appointments",condition)
    achv_data = get_appointment_achieved_tm(sales_person)
    count = 0
    if achv_data:
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(achv_data)))
        for each in achv_data:
            count += 1   
    if data:
        return {"target":data[0][0],"achieved":count} 
    
    return {"target":"data","achieved":0}

@frappe.whitelist()
def get_appointment_achieved_tm(sales_person=None):
    start = get_first_day(nowdate())
    end = get_last_day(nowdate())
    sales_person = sales_person
    email_id = None
    condition = ""

    if sales_person:
        employee = frappe.db.get_value("Sales Person", sales_person, "employee")
        if employee:
            email_id = frappe.db.get_value("Employee", employee, "user_id")
            condition = f" AND a.creation = '{sales_person}'"
    data = frappe.db.sql(f"""
        SELECT
            a.name as appointment_id,
            a.scheduled_time as scheduled_time,
            a.customer_name as customer_name,
            a.customer_email as email,
            a.status as status,
            a.appointment_with as appointment_with,
            a.party as party
        FROM `tabAppointment` as a
                         WHERE 1=1 {condition} and a.creation BETWEEN '{start}' AND '{end}'
    """, as_dict=True)
    return data



@frappe.whitelist()
def get_demos_tm(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"
    
    data = get_activity_target("Demos",condition)
    return {"target":"target","achieved":"achieved"}

@frappe.whitelist()
def get_demos_achieved_tm(sales_person=None):

    filters_data = {
    "based_on": "Creation",
    "brand": [],
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "sales_stage": ["POC/Demos/Webinar/Session"],
    "timespan": "this month",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    #columns = get_columns()	
    data = get_data(filters_data)
    
    return data

@frappe.whitelist()
def get_leads_tm(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"
    
    data = get_activity_target("Leads",condition)
    return {"target":"target","achieved":"achieved"}

@frappe.whitelist()
def get_leads_achieved_tm():
    data = frappe.db.sql(f"""
        SELECT
            l.name as lead_id,
            l.lead_name as lead_name,
            l.job_title as job_title,
            l.type as type,
            l.status as status,
            l.lead_owner as lead_owner,
            l.source
        FROM `tabLead` as l
    """, as_dict=True)
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))  
    return data

@frappe.whitelist()
def get_sessions_tm(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"
    
    data = get_activity_target("Sessions",condition)
    return {"target":"target","achieved":"achieved"}

@frappe.whitelist()
def get_trainings_tm(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"
    
    return {"target":"target","achieved":"achieved"}


def get_activity_target(type,condition):
    # Get the current date
    current_date = date.today()

    # Get the current fiscal year
    current_fiscal_year = frappe.get_all('Fiscal Year', filters={'year_start_date': ['<=', current_date], 'year_end_date': ['>=', current_date]}, fields=['name'])
    fiscal_year1 = current_fiscal_year[0]['name'] 

    result = frappe.db.sql(f"""
            SELECT 
            sum((CASE 
                        when tatd.target_distribution="Daily"   then tatd.target_value * 20
                        when tatd.target_distribution="Weekly"   then tatd.target_value * 4
                        when tatd.target_distribution="Monthly"   then tatd.target_value
                        when tatd.target_distribution="Quarterly"   then tatd.target_value /3
                        when tatd.target_distribution="Yearly"   then tatd.target_value/12
                        else 0  END ))as target
            FROM
            `tabActivity Target Details` tatd 
            inner join `tabSales Target`  on `tabSales Target`.name = tatd.parent 
            WHERE tatd.category_type = '{type}' and `tabSales Target`.fiscal_year= '{fiscal_year1}' {condition}
        """)
    return result


@frappe.whitelist()
def get_fixed_amount(sales_person=None):

    return {"fixed_amount":"fixed_amount"}

@frappe.whitelist()
def get_variable_amount(sales_person=None):
    
    return {"variable_amount":"variable_amount"}