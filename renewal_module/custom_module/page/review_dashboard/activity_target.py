import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate
from datetime import date

from frappe.utils import getdate, formatdate

from dateutil import relativedelta

@frappe.whitelist()
def get_calls_tm(sales_person=None):
    
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"
    data = get_activity_target("Calls",condition)  
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))  
    
    if data:
        return {"target":data[0][0],"achieved":"achieved"}

@frappe.whitelist()
def get_appointments_tm(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"

    data = get_activity_target("Appointments",condition)   
    if data:
        return {"target":data[0][0],"achieved":0} 
    
    return {"target":"data","achieved":"achieved"}

@frappe.whitelist()
def get_demos_tm(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"
    
    data = get_activity_target("Demos",condition)
    return {"target":"target","achieved":"achieved"}

@frappe.whitelist()
def get_leads_tm(sales_person=None):
    condition  = ""
    if sales_person:
        condition = f"and `tabSales Target`.sales_person = '{sales_person}'"
    
    data = get_activity_target("Leads",condition)
    return {"target":"target","achieved":"achieved"}

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