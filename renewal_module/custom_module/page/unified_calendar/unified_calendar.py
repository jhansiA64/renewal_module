import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate

from frappe.utils import get_datetime, strip_html



@frappe.whitelist()
def get_unified_calendar_events(start, end):
    from frappe.utils import get_datetime
    start = get_datetime(start)
    end = get_datetime(end)

    events = []

    # --- Appointments ---
    try:
        appointments = frappe.get_all(
            "Appointment",
            fields=["name", "patient", "start_time", "end_time"],
            filters=[
                ["start_time", ">=", start],
                ["end_time", "<=", end]
            ]
        )
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(appointments)))
        for appt in appointments:
            # frappe.msgprint("Appointment")
            events.append({
                "name":appt.name,
                "title": f"Appointment: {appt.patient}",
                "start": appt.start_time,
                "end": appt.end_time,
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
        # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(holidays)))
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
def update_event_datetime(name,doctype, start, end):
    # frappe.msgprint("Hello")
    """
    Update the start and end datetime of an event-like document.
    """
    if not name:
        frappe.throw(_("Missing event name"))

    doc = frappe.get_doc(doctype, name)  # Change "Event" to your actual DocType if needed
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(doc)))

    # Optionally: permission check
    if not frappe.has_permission(doc.doctype, "write", doc):
        frappe.throw(_("You do not have permission to edit this event"))

    doc.start = start
    doc.end = end
    doc.save()
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(doc)))
    frappe.db.commit()

    return {"status": "success", "message": _("Event updated successfully")}

