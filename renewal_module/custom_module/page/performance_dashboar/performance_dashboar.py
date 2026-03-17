import frappe
from datetime import date, timedelta

@frappe.whitelist()
def get_performance_data(timespan):
    data = []

    if timespan == "Yearly":
        # Example logic: return months
        for month in range(1, 13):
            data.append({
                "label": f"Month {month}",
                "committed": 50000 * month,
                "achieved": 45000 * month
            })

    elif timespan == "Quarterly":
        quarters = ["Q1", "Q2", "Q3", "Q4"]
        for q in quarters:
            data.append({
                "label": q,
                "committed": 200000,
                "achieved": 180000
            })

    elif timespan == "Monthly":
        # Show weeks
        for week in range(1, 5):
            data.append({
                "label": f"Week {week}",
                "committed": 30000,
                "achieved": 25000
            })

    elif timespan == "Weekly":
        # Show daily breakdown
        for d in range(1, 7):
            data.append({
                "label": f"Day {d}",
                "committed": 5000,
                "achieved": 4000
            })

    return data

import frappe
from frappe.utils import getdate
from datetime import timedelta
from dateutil.relativedelta import relativedelta
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import get_data
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import get_timespan_date_range






from frappe.utils import getdate, add_days, nowdate, add_months, add_years, get_first_day, get_last_day

from frappe.utils import cint, flt, formatdate
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from dateutil import relativedelta


from erpnext.accounts.report.utils import convert
from renewal_module.renewal_module.report.opportunity_data.opportunity_data import (
    get_data, get_columns,get_chart_data,get_brand_data,get_item_group_data, get_sales_stage_data,get_monthly_data)

from renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar import (
    get_periods
)

@frappe.whitelist()
def get_open_opp(time_filter, periodicity="Weekly", sales_person=None, from_date=None, to_date=None):
    """
    Returns an array of dicts: {period, status, count, amount}
    """
    #frappe.msgprint("<pre>SALES STAGE: {}</pre>".format(frappe.as_json(sales_stages)))  
    # Step 1: Get date range
    if not (from_date and to_date):
        from_date, to_date = get_timespan_date_range(time_filter)

    periods = get_periods(from_date, to_date, periodicity)

    # Ensure sales_stages is a list (handle cases where it comes as JSON string)
    # if isinstance(sales_stages, str):
    #     import json
    #     sales_stages = json.loads(sales_stages)
    # frappe.msgprint("<pre>PERIODS: {}</pre>".format(frappe.as_json(periods)))    

    result = []

    # Step 2: Loop through periods and collect data
    for period in periods:
        filters_data = {
            "based_on": "Expected Date",
            "brand": [],
            "company": "64 Network Security Pvt Ltd - TG",
            "from_date": period["from_date"],
            "to_date": period["to_date"],
            "sales_stage": ["Proposal","Initial Analysis","POC/Demos/Webinar/Session","Negotiation","Order Expected"],
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
            "amount": total_amount,
            "row":data
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

    return result

@frappe.whitelist()
def get_committed_opp(time_filter, periodicity="Weekly", sales_person=None, from_date=None, to_date=None):
    """
    Returns an array of dicts: {period, status, count, amount}
    """
    #frappe.msgprint("<pre>SALES STAGE: {}</pre>".format(frappe.as_json(sales_stages)))  
    # Step 1: Get date range
    if not (from_date and to_date):
        from_date, to_date = get_timespan_date_range(time_filter)

    periods = get_periods(from_date, to_date, periodicity)

      

    result = []

    # Step 2: Loop through periods and collect data
    for period in periods:
        filters_data = {
            "based_on": "Committed Date",
            "brand": [],
            "company": "64 Network Security Pvt Ltd - TG",
            "from_date": period["from_date"],
            "to_date": period["to_date"],
            "sales_stage": ["Proposal","Initial Analysis","POC/Demos/Webinar/Session","Negotiation","Order Expected","Closed Won"],
            "forecast": "Include",
            "timespan": "custom"
        }

        if sales_person:
            filters_data["sales_person"] = [sales_person]

        data = get_data(filters_data)

        total_amount = 0
        total_count = 0
        # frappe.msgprint("<pre>Committed Data: {}</pre>".format(frappe.as_json(data)))

        for row in data:
            amount = row.get("amount", 0) or 0
            total_amount += amount
            total_count += 1

        result.append({
            "period": period["label"],
            "count": total_count,
            "amount": total_amount,
            "row":data
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

    return result


@frappe.whitelist()
def get_won_opp(time_filter, periodicity="Weeklyly", sales_person=None, from_date=None, to_date=None):
    """
    Returns an array of dicts: {period, status, count, amount}
    """
    #frappe.msgprint("<pre>SALES STAGE: {}</pre>".format(frappe.as_json(sales_stages)))  
    # Step 1: Get date range
    if not (from_date and to_date):
        from_date, to_date = get_timespan_date_range(time_filter)

    periods = get_periods(from_date, to_date, periodicity)

    # Ensure sales_stages is a list (handle cases where it comes as JSON string)
    # if isinstance(sales_stages, str):
    #     import json
    #     sales_stages = json.loads(sales_stages)
    # frappe.msgprint("<pre>PERIODS: {}</pre>".format(frappe.as_json(periods)))    

    result = []

    # Step 2: Loop through periods and collect data
    for period in periods:
        filters_data = {
            "based_on": "Expected Date",
            "brand": [],
            "company": "64 Network Security Pvt Ltd - TG",
            "from_date": period["from_date"],
            "to_date": period["to_date"],
            "sales_stage": ["Closed Won"],
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
            "amount": total_amount,
            "row":data
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

    return result


@frappe.whitelist()
def get_committed_child_row(name, opp_item_name=None):
    """Return all matching committed rows for that item"""
    doc = frappe.get_doc("Opportunity", name)
    if not opp_item_name:
        return []
    matched_rows = []
    for row in doc.committed_data_details:
        if row.opp_item_name == opp_item_name:
            matched_rows.append({
                "committed_date": row.committed_date,
                "reason": row.reason,
                "opp_item_name": row.opp_item_name
            })
    return matched_rows


@frappe.whitelist()
def save_committed_child_row(name, committed_date=None, reason=None, opp_item_name=None):
    if not name:
        frappe.throw("Opportunity name is required.")

    if not opp_item_name:
        frappe.throw("Opportunity Item Name (opp_item_name) is required.")

    doc = frappe.get_doc("Opportunity", name)
    if committed_date:
        committed_date = frappe.utils.getdate(committed_date)
        if opp_item_name:
            # Update the child row through the parent doc
            for item in doc.items:  # assuming the child table fieldname is 'items'
                if item.name == opp_item_name:
                    item.custom_committed_date = committed_date
                    # frappe.msgprint(f"Set custom_committed_date on item {item.name}")

            # Save parent doc to commit changes to child table
            doc.save()
            # frappe.msgprint(f"Updated custom_committed_date for row: {opp_item_name}")
        else:
            frappe.msgprint("No row name passed from JS")
    # Check if a row already exists WITH SAME opp_item_name and SAME committed_date
    existing_row = None
    for row in doc.committed_data_details:
        if row.opp_item_name == opp_item_name and row.committed_date == committed_date:
            existing_row = row
            break

    if existing_row:
        # Update ONLY reason
        existing_row.reason = reason

    else:
        # Create NEW ROW always when committed_date different
        doc.append("committed_data_details", {
            "opp_item_name": opp_item_name,
            "committed_date": committed_date,
            "reason": reason
        })

    doc.save(ignore_permissions=True)

    return {
        "status": "success",
        "saved": True,
        "opp_item_name": opp_item_name,
        "committed_date": committed_date,
        "reason": reason
    }


@frappe.whitelist()
def get_last_committed_row(name, opp_item_name=None):
    """Return the latest committed row for that item (or empty if none)."""

    if not opp_item_name:
        return {}
    doc = frappe.get_doc("Opportunity", name)
    matched_rows = [
        row for row in doc.committed_data_details
        if row.opp_item_name == opp_item_name
    ]
    if not matched_rows:
        return {}   # return empty when no rows exist
    # Sort by committed_date and return the latest
    matched_rows.sort(key=lambda x: x.committed_date or frappe.utils.getdate("1900-01-01"))
    last = matched_rows[-1]
    return {
        "committed_date": last.committed_date,
        "reason": last.reason,
        "opp_item_name": last.opp_item_name
    }
