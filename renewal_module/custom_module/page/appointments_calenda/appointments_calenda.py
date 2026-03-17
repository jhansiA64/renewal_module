import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate

from frappe.utils import get_datetime, strip_html


# @frappe.whitelist()
# def get_unified_calendar_events(start, end, users=None):
#     import frappe
#     from frappe.utils import getdate
    
#     start = getdate(start)
#     end = getdate(end)

#     events = []

#     # fetch Appointments (your existing logic)
#     appointments = frappe.get_all("Appointment", 
#         filters={"custom_start_date": (">=", start), "custom_end_date": ("<=", end)},
#         fields=["name", "customer_name", "customer_email", "custom_start_date", "custom_end_date", "customer_details"])
    
#     for appt in appointments:
#         events.append({
#             "name": appt.name,
#             "title": appt.name,
#             "assigned_to": appt.customer_email,
#             "start": appt.custom_start_date,
#             "end": appt.custom_end_date,
#             "color": "#2196f3",
#             "doctype": "Appointment"
#         })

#     # fetch Holidays only from ERPNext Holiday List
#     # holidays = frappe.get_all("Holiday",
#     #     filters={"holiday_date": (">=", start), "holiday_date": ("<=", end)},
#     #     fields=["name", "holiday_date", "description"])
    
#     # for h in holidays:
#     #     events.append({
#     #         "name": h.name,
#     #         "title": h.description or "Holiday",
#     #         "start": h.holiday_date,
#     #         "end": h.holiday_date,
#     #         "color": "#DB4437",  # red for holidays
#     #         "doctype": "Holiday"
#     #     })
#     holidays = frappe.get_all("Holiday", fields=["holiday_date", "description"], filters={"holiday_date": ["between", [start, end]]})
#     for h in holidays:
#         # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(holidays)))
#         events.append({
#             "name":h.name,
#             "title": f"Holiday: {strip_html(h.description)}",
#             "start": h.holiday_date,
#             "end": h.holiday_date,
#             "allDay": 1,
#             "color": "#f44336",  # red
#             "doctype": "Holiday"
#         })


#     # 2. Events
#     event_docs = frappe.get_all("Event", fields=["name", "subject", "starts_on", "ends_on"], filters={"starts_on": ["between", [start, end]]})
#     for e in event_docs:
#         events.append({
#             "name":e.name,
#             "title": f"Event: {e.subject}",
#             "start": e.starts_on,
#             "end": e.ends_on,
#             "color": "#4caf50",  # green
#             "doctype": "Event"
#         })    

#     return events


















import frappe
from frappe.utils import getdate, strip_html

@frappe.whitelist()
def get_unified_calendar_events(start, end, users=None):
    start = getdate(start)
    end = getdate(end)

    events = []

    # Parse users safely
    user_filter = []
    if users:
        try:
            import json
            users = json.loads(users) if isinstance(users, str) else users
            user_filter = [["customer_email", "in", users]]
        except Exception as e:
            frappe.log_error(f"Error parsing users: {e}", "Calendar User Filter")

    # ------------------ Appointments -------------------
    appt_filters = {
        "custom_start_date": (">=", start),
        "custom_end_date": ("<=", end)
    }
    if user_filter:
        appt_filters["customer_email"] = ("in", users)

    appointments = frappe.get_all("Appointment", 
        filters=appt_filters,
        fields=["name", "custom_start_date", "custom_end_date", "customer_email"])

    for appt in appointments:
        events.append({
            "name": appt.name,
            "title": appt.name,
            "assigned_to": appt.customer_email,
            "start": appt.custom_start_date,
            "end": appt.custom_end_date,
            "color": "#2196f3",
            "doctype": "Appointment"
        })

    # ------------------ Holidays -------------------
    holidays = frappe.get_all("Holiday", 
        fields=["name", "holiday_date", "description"], 
        filters={"holiday_date": ["between", [start, end]]})

    for h in holidays:
        events.append({
            "name": h.name,
            "title": f"Holiday: {strip_html(h.description)}" if h.description else "Holiday",
            "start": h.holiday_date,
            "end": h.holiday_date,
            "allDay": 1,
            "color": "#f44336",  # red
            "doctype": "Holiday"
        })

    # ------------------ Events -------------------
    event_filters = {
        "starts_on": ["between", [start, end]]
    }
    if user_filter:
        # Assuming you link events to users (if not, skip this)
        event_filters["owner"] = ("in", users)

    event_docs = frappe.get_all("Event", 
        filters=event_filters, 
        fields=["name", "subject", "starts_on", "ends_on"])

    for e in event_docs:
        events.append({
            "name": e.name,
            "title": f"Event: {e.subject}",
            "start": e.starts_on,
            "end": e.ends_on,
            "color": "#4caf50",
            "doctype": "Event"
        })

    return events
