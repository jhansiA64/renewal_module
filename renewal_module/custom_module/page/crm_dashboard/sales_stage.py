#filter data
import frappe
from frappe.utils import getdate, add_days, nowdate, add_months, add_years, get_first_day, get_last_day

from frappe.utils import cint, flt, formatdate
from frappe.utils import get_timespan_date_range


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import (
    get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data,get_monthly_data)


@frappe.whitelist()
def get_filtered_opportunities( time_filter,from_date=None, to_date=None,sales_person=None):
    # frappe.msgprint("Hello")
    try:
        data = []
        if time_filter == "custom":
            from_date = getdate(from_date)
            to_date = getdate(to_date)
            filters_data = {
            "based_on": "Expected Date",
            "brand": [],
            "company": "64 Network Security Pvt Ltd - TG",
            "from_date": from_date,
            "forecast":"Include",
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
            
        else:
            # frappe.msgprint("else class")

            filters_data = {
            "based_on": "Expected Date",
            "brand": [],
            "company": "64 Network Security Pvt Ltd - TG",
            "from_date": "2025-02-28",
            "forecast":"Include",
            "sales_stage": [],
            "timespan": time_filter,
            "to_date": "2025-03-07"
            }
            if sales_person == "":
                pass
            else:
                filters_data["sales_person"] = [sales_person]
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(filters_data)))    
            columns = get_columns()	
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(columns)))
            data = get_data(filters_data)
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
           # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json("data")))
            # list_opp = []
            # sum =0.0


        sales_stages= []
        stages = frappe.db.sql("""
                          Select name from `tabSales Stage`
                """,as_dict=1)
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(stages)))        
        
        for stage in stages:
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(stage))) 
            sales_stages.append(stage["name"])
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_stages)))    




        if data:
            # frappe.msgprint("if data")
            funnel_data={}
            # sales_stage_totals = {}
            # for each in data: 
            #     stage = each.get("sales_stage", "Unknown")
            #     amount = each.get("amount", 0.0)
            #     funnel_data[stage] = funnel_data.get(stage, 0.0) + amount
                # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(each)))


            # Initialize all stages with 0.0
            funnel_data = {stage: 0.0 for stage in sales_stages}

            # Sum amounts from the data
            for each in data: 
                stage = each.get("sales_stage", "Unknown")
                amount = each.get("amount", 0.0)

                if stage in funnel_data:
                    funnel_data[stage] += amount
                else:
                    # Handle unknown stages if needed
                    funnel_data["Unknown"] = funnel_data.get("Unknown", 0.0) + amount

                  
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(funnel_data)))    

        return {
            "opportunities": data,
            "funnel_data": funnel_data,
            
        }        


       

        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "get_filtered_opportunities Error")
        return {
            "opportunities": [],
            "closed_won_total": 0,
            "closed_lost_total":0,
            "proposal_total":0,
            "initial_analysis_total":0,
            "dead_total":0
        }


def get_time_range(filter_value):
    today = getdate(nowdate())

    if filter_value == "this_week":
        from_date = add_days(today, -today.weekday())
        to_date = add_days(from_date, 6)
    elif filter_value == "last_week":
        from_date = add_days(today, -today.weekday() - 7)
        to_date = add_days(from_date, 6)
    elif filter_value == "this_month":
        from_date = get_first_day(today)
        to_date = get_last_day(today)
    elif filter_value == "last_month":
        last_month = add_months(today, -1)
        from_date = get_first_day(last_month)
        to_date = get_last_day(last_month)
    elif filter_value == "this_quarter":
        month = today.month
        quarter_start = month - ((month - 1) % 3)
        from_date = getdate(f"{today.year}-{quarter_start:02d}-01")
        to_date = get_last_day(add_months(from_date, 2))
    elif filter_value == "this_year":
        from_date = getdate(f"{today.year}-01-01")
        to_date = getdate(f"{today.year}-12-31")
    else:
        from_date = to_date = today

    return from_date, to_date