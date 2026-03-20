import builtins
import json

import frappe
from frappe.utils import flt, getdate, today
from hrms.hr.doctype.job_requisition.job_requisition import make_job_opening


LIST_FIELDS = [
	"name",
	"designation",
	"department",
	"company",
	"status",
	"no_of_positions",
	"expected_compensation",
	"requested_by",
	"requested_by_name",
	"requested_by_dept",
	"requested_by_designation",
	"posting_date",
	"expected_by",
	"completed_on",
	"time_to_fill",
	"description",
	"reason_for_requesting",
	"creation",
	"modified",
]


def _parse_payload(data):
	if isinstance(data, str):
		return json.loads(data) if data else {}
	return data or {}


def _normalize(value):
	if value is None:
		return ""
	return str(value).strip()


def _resolve_link_value(doctype, value, search_fields=None):
	value = _normalize(value)
	if not value:
		return ""

	if frappe.db.exists(doctype, value):
		return value

	search_fields = tuple(search_fields or ())
	for fieldname in search_fields:
		exact_match = frappe.db.get_value(doctype, {fieldname: value}, "name")
		if exact_match:
			return exact_match

	conditions = ["LOWER(name) = LOWER(%s)"]
	values = [value]
	for fieldname in search_fields:
		conditions.append(f"LOWER(IFNULL({fieldname}, '')) = LOWER(%s)")
		values.append(value)

	rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tab{doctype}`
		WHERE {' OR '.join(conditions)}
		LIMIT 1
		""",
		tuple(values),
		as_dict=True,
	)

	return rows[0].name if rows else ""


def _serialize_linked_opening(row):
	return {
		"name": row.get("name"),
		"job_title": row.get("job_title"),
		"status": row.get("status"),
		"department": row.get("department"),
		"vacancies": row.get("vacancies"),
	}


def _serialize_job_requisition(doc, linked_openings=None, referral_count=None):
	data = {}
	if doc is None:
		data = {}
	else:
		try:
			as_dict = getattr(doc, "as_dict", None)
			if as_dict and getattr(as_dict, "__call__", None):
				data = as_dict() or {}
			elif isinstance(doc, builtins.dict):
				data = doc
			elif hasattr(doc, "items"):
				data = builtins.dict(doc.items())
			else:
				data = builtins.dict(doc)
		except Exception:
			data = doc if isinstance(doc, builtins.dict) else {}
	return {
		"id": data.get("name"),
		"designation": data.get("designation"),
		"department": data.get("department"),
		"company": data.get("company"),
		"status": data.get("status"),
		"no_of_positions": data.get("no_of_positions"),
		"expected_compensation": data.get("expected_compensation"),
		"requested_by": data.get("requested_by"),
		"requested_by_name": data.get("requested_by_name"),
		"requested_by_dept": data.get("requested_by_dept"),
		"requested_by_designation": data.get("requested_by_designation"),
		"posting_date": data.get("posting_date"),
		"expected_by": data.get("expected_by"),
		"completed_on": data.get("completed_on"),
		"time_to_fill": data.get("time_to_fill"),
		"description": data.get("description"),
		"reason_for_requesting": data.get("reason_for_requesting"),
		"creation": data.get("creation"),
		"modified": data.get("modified"),
		"linked_job_openings": linked_openings or [],
		"pending_referrals": referral_count if referral_count is not None else 0,
	}


def _apply_job_requisition_values(doc, data):
	if "designation" in data:
		doc.designation = _resolve_link_value("Designation", data.get("designation"), ("designation_name",))
	if "department" in data:
		doc.department = _resolve_link_value("Department", data.get("department"), ("department_name",))
	if "company" in data:
		doc.company = _resolve_link_value("Company", data.get("company"), ("company_name", "abbr"))
	if "requested_by" in data:
		doc.requested_by = _resolve_link_value("Employee", data.get("requested_by"), ("employee_name",))
	if "status" in data:
		doc.status = _normalize(data.get("status")) or doc.status
	if "no_of_positions" in data:
		doc.no_of_positions = int(data.get("no_of_positions") or 0)
	if "expected_compensation" in data:
		doc.expected_compensation = flt(data.get("expected_compensation") or 0)
	if "posting_date" in data:
		doc.posting_date = data.get("posting_date") or None
	if "expected_by" in data:
		doc.expected_by = data.get("expected_by") or None
	if "completed_on" in data:
		doc.completed_on = data.get("completed_on") or None
	if "description" in data:
		doc.description = data.get("description") or ""
	if "reason_for_requesting" in data:
		doc.reason_for_requesting = data.get("reason_for_requesting") or ""
	if "naming_series" in data:
		doc.naming_series = data.get("naming_series") or "HR-HIREQ-"

	if not getattr(doc, "naming_series", None):
		doc.naming_series = "HR-HIREQ-"
	if not getattr(doc, "posting_date", None):
		doc.posting_date = today()
	if getattr(doc, "status", None) == "Filled" and not getattr(doc, "completed_on", None):
		doc.completed_on = getdate()
	if getattr(doc, "status", None) != "Filled" and "status" in data and "completed_on" not in data:
		doc.completed_on = None


def _get_linked_job_openings(job_requisition):
	rows = frappe.get_all(
		"Job Opening",
		filters={"job_requisition": job_requisition},
		fields=["name", "job_title", "status", "department", "vacancies"],
		order_by="creation desc",
	)
	return [_serialize_linked_opening(row) for row in rows]


@frappe.whitelist()
def get_job_requisitions(filters=None, start=0, page_length=20):
	filters = _parse_payload(filters)
	start = int(start or 0)
	page_length = int(page_length or 20)

	db_filters = []
	status = _normalize(filters.get("status"))
	request_id = _normalize(filters.get("request_id"))
	designation = _normalize(filters.get("designation"))
	department = _normalize(filters.get("department"))

	if status:
		db_filters.append(["status", "=", status])
	if request_id:
		db_filters.append(["name", "like", f"%{request_id}%"])
	if designation:
		db_filters.append(["designation", "like", f"%{designation}%"])
	if department:
		db_filters.append(["department", "like", f"%{department}%"])

	rows = frappe.get_all(
		"Job Requisition",
		filters=db_filters,
		fields=LIST_FIELDS,
		start=start,
		page_length=page_length,
		order_by="modified desc",
	)
	total = frappe.db.count("Job Requisition", filters=db_filters)

	return {
		"status": "success",
		"data": [_serialize_job_requisition(row) for row in rows],
		"total": total,
	}


@frappe.whitelist()
def get_job_requisition(job_name):
	try:
		doc = frappe.get_doc("Job Requisition", job_name)
		linked_openings = _get_linked_job_openings(job_name)
		referral_count = frappe.db.count(
			"Employee Referral",
			filters={
				"for_designation": doc.designation,
				"status": "Pending",
			},
		)
		return {
			"status": "success",
			"data": _serialize_job_requisition(doc, linked_openings, referral_count),
		}
	except frappe.DoesNotExistError:
		return {"status": "error", "message": f"Job Requisition '{job_name}' not found", "data": None}
	except Exception as exc:
		frappe.log_error(frappe.get_traceback(), "Job Request - get_job_requisition")
		return {"status": "error", "message": str(exc), "data": None}


@frappe.whitelist()
def create_job_requisition(data):
	try:
		payload = _parse_payload(data)
		doc = frappe.new_doc("Job Requisition")
		_apply_job_requisition_values(doc, payload)
		doc.insert(ignore_permissions=False)
		frappe.db.commit()
		return {
			"status": "success",
			"message": f"Job Requisition '{doc.name}' created successfully",
			"data": {"id": doc.name},
		}
	except Exception as exc:
		frappe.log_error(frappe.get_traceback(), "Job Request - create_job_requisition")
		return {"status": "error", "message": str(exc), "data": None}


@frappe.whitelist()
def update_job_requisition(job_name, data):
	try:
		payload = _parse_payload(data)
		doc = frappe.get_doc("Job Requisition", job_name)
		_apply_job_requisition_values(doc, payload)
		doc.save(ignore_permissions=False)
		frappe.db.commit()
		return {
			"status": "success",
			"message": f"Job Requisition '{doc.name}' updated successfully",
			"data": {"id": doc.name},
		}
	except Exception as exc:
		frappe.log_error(frappe.get_traceback(), "Job Request - update_job_requisition")
		return {"status": "error", "message": str(exc), "data": None}


@frappe.whitelist()
def delete_job_requisition(job_name):
	try:
		frappe.delete_doc("Job Requisition", job_name, ignore_permissions=False)
		frappe.db.commit()
		return {"status": "success", "message": "Job Requisition deleted successfully"}
	except Exception as exc:
		frappe.log_error(frappe.get_traceback(), "Job Request - delete_job_requisition")
		return {"status": "error", "message": str(exc)}


@frappe.whitelist()
def create_job_opening_from_requisition(job_name):
	try:
		job_opening = make_job_opening(job_name)
		job_opening.insert(ignore_permissions=False)
		frappe.db.commit()
		return {
			"status": "success",
			"message": f"Job Opening '{job_opening.name}' created successfully",
			"data": {"name": job_opening.name},
		}
	except Exception as exc:
		frappe.log_error(frappe.get_traceback(), "Job Request - create_job_opening_from_requisition")
		return {"status": "error", "message": str(exc), "data": None}


@frappe.whitelist()
def associate_job_opening(job_name, job_opening):
	try:
		doc = frappe.get_doc("Job Requisition", job_name)
		doc.associate_job_opening(job_opening)
		frappe.db.commit()
		return {
			"status": "success",
			"message": f"Job Opening '{job_opening}' associated successfully",
		}
	except Exception as exc:
		frappe.log_error(frappe.get_traceback(), "Job Request - associate_job_opening")
		return {"status": "error", "message": str(exc)}
