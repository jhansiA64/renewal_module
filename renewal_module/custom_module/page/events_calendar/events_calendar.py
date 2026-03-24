import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate

from frappe.utils import get_datetime, strip_html



@frappe.whitelist()
def get_unified_calendar_events(start, end):
    from frappe.utils import get_datetime
    start = get_datetime(start)
    end = get_datetime(end)

    # If start and end are same day → extend end to end-of-day
    if start.date() == end.date():
        end = end.replace(hour=23, minute=59, second=59)

    events = []

    # --- Appointments ---
    try:
        appointments = frappe.get_all(
            "Appointment",
            fields=["*"],
            filters=[
                ["custom_start_date", ">=", start],
                ["custom_end_date", "<=", end]
            ]
        )
        #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(appointments)))
        for appt in appointments:
            #frappe.msgprint("Appointment")
            events.append({
                "name":appt.name,
                "title": f"Appointment: {appt.customer_name}",
                "customer": appt.customer_name,
                "customer_email": appt.customer_email,
                "start_date": appt.custom_start_date,
                "start_time": appt.custom_start_time,
                "end_time": appt.custom_end_time,
                "end_date": appt.custom_end_date,
                "start_date_time": f"{appt.custom_start_date} {appt.custom_start_time}",
                "end_date_time":f"{appt.custom_end_date} {appt.custom_end_time}",
                "color": "#2196f3",
                "doctype": "Appointment"
            })
    except Exception as e:
        frappe.log_error(f"Failed to fetch appointments: {e}", "Unified Calendar")


    # --- Calendar ---
    try:
        calendar = frappe.get_all(
            "Custom Calendar",
            fields=["name", "Subject", "start_date", "end_date"],
            filters=[
                ["start_date", ">=", start],
                ["end_date", "<=", end]
            ]
        )
        for appt in calendar:
            events.append({
                "name":appt.name,
                "title": f"Meetings: {appt.subject}",
                "start": appt.start_date,
                "end": appt.end_date,
                "color": "#4caf50",
                "doctype": "Custom Calendar"
            })
    except Exception as e:
        frappe.log_error(f"Failed to fetch appointments: {e}", "Unified Calendar")    

    # Add similar blocks for Events and Holidays...

    # 2. Events
    event_docs = frappe.get_all("Event", fields=["name", "subject", "starts_on", "ends_on"], filters={"starts_on": ["between", [start, end]]})
    for e in event_docs:
        events.append({
            "name":e.name,
            "title": f"Event: {e.subject}",
            "start": e.starts_on,
            "end": e.ends_on,
            "color": "#4caf50",  # green
            "doctype": "Event"
        })

    # 3. Holidays
    holidays = frappe.get_all("Holiday", fields=["holiday_date", "description"], filters={"holiday_date": ["between", [start, end]]})
    for h in holidays:
        #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(holidays)))
        events.append({
            "name":h.name,
            "title": f"Holiday: {strip_html(h.description)}",
            "start": h.holiday_date,
            "end": h.holiday_date,
            "allDay": 1,
            "color": "#f44336",  # red
            "doctype": "Holiday"
        })

    return events



@frappe.whitelist()
def create_event(details, start_date, start_time, end_date, end_time, status, scheduled_time,
                 customer_email=None, customer_name=None, phone_number=None,
                 appointment_with=None, party=None):

    #frappe.msgprint(f"Debug -> start_date: {start_date}, end_date: {end_date}")
    try:
        appointment = frappe.new_doc("Appointment")

        # Required fields (these must match your Appointment doctype fields)
        appointment.customer_name = customer_name or "Unknown"
        #appointment.start_date = start_date        # ✅ correct field
        #appointment.end_date = end_date            # ✅ correct field
        appointment.scheduled_time = scheduled_time  # ✅ correct field
        appointment.custom_start_date = start_date
        appointment.custom_end_date = end_date

        # Optional
        appointment.details = details
        appointment.custom_start_time = start_time
        appointment.custom_end_time = end_time
        appointment.customer_email = customer_email
        appointment.phone_number = phone_number
        appointment.appointment_with = appointment_with
        appointment.party = party
        appointment.status = status

        appointment.insert(ignore_permissions=True)
        frappe.db.commit()

        return {
            "status": "success",
            "message": "Appointment created successfully",
            "appointment_name": appointment.name
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Custom Calendar: create_event failed")
        return {
            "status": "error",
            "message": str(e)
        }