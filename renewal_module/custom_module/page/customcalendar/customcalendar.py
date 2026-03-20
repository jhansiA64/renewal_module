import json
import re
from datetime import datetime, time

import frappe
from frappe.utils import add_days, get_datetime, getdate


def _to_datetime(date_value, time_value=None):
	"""Build a datetime from date + optional time strings safely."""
	if not date_value:
		return None
	if isinstance(date_value, datetime):
		return date_value

	base_date = getdate(date_value)
	if not time_value:
		return datetime.combine(base_date, time.min)

	if isinstance(time_value, datetime):
		return time_value

	time_str = str(time_value).strip()
	for fmt in ("%H:%M:%S", "%H:%M"):
		try:
			parsed_time = datetime.strptime(time_str, fmt).time()
			return datetime.combine(base_date, parsed_time)
		except ValueError:
			continue

	return datetime.combine(base_date, time.min)


def _resolve_holiday_list(explicit_holiday_list=None):
	if explicit_holiday_list:
		return explicit_holiday_list

	user = frappe.session.user
	employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
	if employee:
		shift_type = frappe.db.get_value("Employee", employee, "default_shift")
		if shift_type:
			holiday_list = frappe.db.get_value("Shift Type", shift_type, "holiday_list")
			if holiday_list:
				return holiday_list

	default_company = frappe.defaults.get_user_default("Company")
	if default_company:
		company_holiday_list = frappe.db.get_value("Company", default_company, "default_holiday_list")
		if company_holiday_list:
			return company_holiday_list

	return None


def _normalize_for_compare(dt_value):
	"""Normalize datetimes to naive local values for safe comparisons."""
	if not dt_value:
		return None
	if dt_value.tzinfo is not None and dt_value.utcoffset() is not None:
		return dt_value.astimezone().replace(tzinfo=None)
	return dt_value


def _clean_title(value, fallback=""):
	"""Return a safe, single-line title for calendar event labels."""
	text = frappe.utils.strip_html_tags(str(value or "")).strip()
	if not text:
		text = fallback
	return re.sub(r"\s+", " ", text)


@frappe.whitelist()
def get_calendar_events(start=None, end=None, sources=None, holiday_list=None):
	"""Return normalized FullCalendar events from multiple doctypes."""
	start_dt = get_datetime(start) if start else get_datetime(add_days(frappe.utils.today(), -30))
	end_dt = get_datetime(end) if end else get_datetime(add_days(frappe.utils.today(), 90))
	start_dt = _normalize_for_compare(start_dt)
	end_dt = _normalize_for_compare(end_dt)

	try:
		sources_list = json.loads(sources) if isinstance(sources, str) else (sources or [])
	except Exception:
		sources_list = []

	if not sources_list:
		sources_list = ["holidays", "appointments", "call_lists", "tasks"]

	events = []
	summary = {
		"holidays": 0,
		"appointments": 0,
		"call_lists": 0,
		"tasks": 0,
	}

	if "holidays" in sources_list:
		selected_holiday_list = _resolve_holiday_list(holiday_list)
		holiday_filters = {
			"holiday_date": ["between", [start_dt.date(), end_dt.date()]],
		}
		if selected_holiday_list:
			holiday_filters["parent"] = selected_holiday_list

		holidays = frappe.get_all(
			"Holiday",
			filters=holiday_filters,
			fields=["name", "holiday_date", "description", "weekly_off", "parent"],
			order_by="holiday_date asc",
		)

		for row in holidays:
			event_title = _clean_title(row.description, "Holiday")
			events.append(
				{
					"id": f"Holiday::{row.name}",
					"title": event_title,
					"start": str(row.holiday_date),
					"end": str(add_days(row.holiday_date, 1)),
					"allDay": True,
					"classNames": ["evt-holiday"],
					"extendedProps": {
						"source": "holiday",
						"holiday_list": row.parent,
						"weekly_off": bool(row.weekly_off),
					},
				}
			)
		summary["holidays"] = len(holidays)

	if "appointments" in sources_list:
		appointment_fields = [
			"name",
			"status",
			"customer_name",
			"scheduled_time",
		]
		if frappe.db.has_column("Appointment", "custom_start_date"):
			appointment_fields.append("custom_start_date")
		if frappe.db.has_column("Appointment", "custom_start_time"):
			appointment_fields.append("custom_start_time")
		if frappe.db.has_column("Appointment", "custom_end_date"):
			appointment_fields.append("custom_end_date")
		if frappe.db.has_column("Appointment", "custom_end_time"):
			appointment_fields.append("custom_end_time")

		appointments = frappe.get_all(
			"Appointment",
			fields=appointment_fields,
			order_by="scheduled_time asc",
			limit_page_length=500,
		)

		for row in appointments:
			start_value = _to_datetime(
				getattr(row, "custom_start_date", None),
				getattr(row, "custom_start_time", None),
			)
			if not start_value and row.get("scheduled_time"):
				start_value = get_datetime(row.scheduled_time)
			start_value = _normalize_for_compare(start_value)

			end_value = _to_datetime(
				getattr(row, "custom_end_date", None),
				getattr(row, "custom_end_time", None),
			)
			end_value = _normalize_for_compare(end_value)

			if not start_value:
				continue
			if start_value > end_dt or start_value < start_dt:
				continue

			event_title = _clean_title(row.customer_name or row.name, row.name)
			events.append(
				{
					"id": f"Appointment::{row.name}",
					"title": f"Appointment: {event_title}",
					"start": start_value.isoformat(),
					"end": end_value.isoformat() if end_value else None,
					"allDay": False,
					"classNames": ["evt-appointment"],
					"extendedProps": {
						"source": "appointment",
						"docname": row.name,
						"doctype": "Appointment",
						"route": f"/app/appointments/{row.name}",
						"status": row.status,
					},
				}
			)
		summary["appointments"] = len([e for e in events if e.get("extendedProps", {}).get("source") == "appointment"])

	if "call_lists" in sources_list:
		call_lists = frappe.get_all(
			"Call List",
			fields=["name", "subject", "status", "start_date", "start_timing", "end_date", "end_timing"],
			order_by="start_date asc",
			limit_page_length=500,
		)

		for row in call_lists:
			start_value = _to_datetime(row.start_date, row.start_timing)
			end_value = _to_datetime(row.end_date, row.end_timing)
			start_value = _normalize_for_compare(start_value)
			end_value = _normalize_for_compare(end_value)
			if not start_value:
				continue
			if start_value > end_dt or start_value < start_dt:
				continue

			call_subject = _clean_title(row.subject, row.name)

			events.append(
				{
					"id": f"CallList::{row.name}",
					"title": f"Call: {call_subject}",
					"start": start_value.isoformat(),
					"end": end_value.isoformat() if end_value else None,
					"allDay": False,
					"classNames": ["evt-call-list"],
					"extendedProps": {
						"source": "call_list",
						"docname": row.name,
						"doctype": "Call List",
						"route": f"/app/call-lists/{row.name}",
						"status": row.status,
					},
				}
			)
		summary["call_lists"] = len([e for e in events if e.get("extendedProps", {}).get("source") == "call_list"])

	if "tasks" in sources_list:
		tasks = frappe.get_all(
			"Task",
			fields=["name", "subject", "status", "exp_start_date", "exp_end_date"],
			order_by="exp_start_date asc",
			limit_page_length=500,
		)

		for row in tasks:
			start_value = get_datetime(row.exp_start_date) if row.exp_start_date else None
			end_value = get_datetime(row.exp_end_date) if row.exp_end_date else None
			start_value = _normalize_for_compare(start_value)
			end_value = _normalize_for_compare(end_value)
			if not start_value and end_value:
				start_value = end_value
			if not start_value:
				continue
			if start_value > end_dt or start_value < start_dt:
				continue

			task_subject = _clean_title(row.subject, row.name)

			events.append(
				{
					"id": f"Task::{row.name}",
					"title": f"Task: {task_subject}",
					"start": start_value.isoformat(),
					"end": end_value.isoformat() if end_value else None,
					"allDay": False,
					"classNames": ["evt-task"],
					"extendedProps": {
						"source": "task",
						"docname": row.name,
						"doctype": "Task",
						"route": f"/app/tasks/{row.name}",
						"status": row.status,
					},
				}
			)
		summary["tasks"] = len([e for e in events if e.get("extendedProps", {}).get("source") == "task"])

	return {"events": events, "summary": summary}
