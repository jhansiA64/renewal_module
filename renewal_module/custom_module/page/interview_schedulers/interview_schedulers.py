import json

import frappe


LIST_FIELDS = [
    "name",
    "interview_round",
    "job_applicant",
    "job_opening",
    "designation",
    "status",
    "scheduled_on",
    "from_time",
    "to_time",
    "average_rating",
    "interview_summary",
    "creation",
    "modified",
]


STATUSES = ["Pending", "Under Review", "Cleared", "Rejected", "Cancelled"]


def _parse_payload(data):
    if isinstance(data, str):
        return json.loads(data) if data else {}
    return data or {}


def _normalize(value):
    if value is None:
        return ""
    return str(value).strip()


def _serialize_interview(row, applicant_name=None, interviewers=None):
    source = {}
    if row is None:
        source = {}
    else:
        try:
            as_dict = getattr(row, "as_dict", None)
            if as_dict and getattr(as_dict, "__call__", None):
                source = as_dict() or {}
            elif isinstance(row, dict):
                source = row
            elif hasattr(row, "items"):
                source = dict(row.items())
            else:
                source = dict(row)
        except Exception:
            source = row if isinstance(row, dict) else {}
    return {
        "id": source.get("name"),
        "interview_round": source.get("interview_round"),
        "job_applicant": source.get("job_applicant"),
        "job_applicant_name": applicant_name or source.get("job_applicant_name") or source.get("job_applicant"),
        "job_opening": source.get("job_opening"),
        "designation": source.get("designation"),
        "status": source.get("status"),
        "scheduled_on": source.get("scheduled_on"),
        "from_time": source.get("from_time"),
        "to_time": source.get("to_time"),
        "average_rating": source.get("average_rating"),
        "interview_summary": source.get("interview_summary"),
        "interviewers": interviewers or [],
        "creation": source.get("creation"),
        "modified": source.get("modified"),
    }


def _set_interview_values(doc, data):
    if "interview_round" in data:
        doc.interview_round = _normalize(data.get("interview_round"))

    if "job_applicant" in data:
        doc.job_applicant = _normalize(data.get("job_applicant"))

    if "status" in data:
        status = _normalize(data.get("status"))
        doc.status = status if status in STATUSES else "Pending"

    if "scheduled_on" in data:
        doc.scheduled_on = data.get("scheduled_on") or None

    if "from_time" in data:
        doc.from_time = data.get("from_time") or None

    if "to_time" in data:
        doc.to_time = data.get("to_time") or None

    if "interview_summary" in data:
        doc.interview_summary = data.get("interview_summary") or ""

    if "interviewers" in data:
        interviewers = data.get("interviewers") or []
        doc.set("interview_details", [])
        for interviewer in interviewers:
            user_id = _normalize(interviewer)
            if user_id:
                doc.append("interview_details", {"interviewer": user_id})

    if not getattr(doc, "status", None):
        doc.status = "Pending"


@frappe.whitelist()
def get_interview_schedulers(filters=None, start=0, page_length=20):
    filters = _parse_payload(filters)
    start = int(start or 0)
    page_length = int(page_length or 20)

    db_filters = []
    status = _normalize(filters.get("status"))
    name_filter = _normalize(filters.get("name"))
    round_filter = _normalize(filters.get("interview_round"))
    applicant_filter = _normalize(filters.get("job_applicant"))

    if status:
        db_filters.append(["status", "=", status])
    if name_filter:
        db_filters.append(["name", "like", f"%{name_filter}%"])
    if round_filter:
        db_filters.append(["interview_round", "like", f"%{round_filter}%"])
    if applicant_filter:
        db_filters.append(["job_applicant", "like", f"%{applicant_filter}%"])

    rows = frappe.get_all(
        "Interview",
        filters=db_filters,
        fields=LIST_FIELDS,
        start=start,
        page_length=page_length,
        order_by="modified desc",
    )

    applicant_ids = [row.get("job_applicant") for row in rows if row.get("job_applicant")]
    applicant_map = {}
    if applicant_ids:
        applicant_rows = frappe.get_all(
            "Job Applicant",
            filters={"name": ["in", list(set(applicant_ids))]},
            fields=["name", "applicant_name"],
        )
        applicant_map = {row.name: row.applicant_name for row in applicant_rows}

    total = frappe.db.count("Interview", filters=db_filters)

    return {
        "status": "success",
        "data": [
            _serialize_interview(row, applicant_name=applicant_map.get(row.get("job_applicant")))
            for row in rows
        ],
        "total": total,
    }


@frappe.whitelist()
def get_interview_scheduler(name):
    try:
        doc = frappe.get_doc("Interview", name)
        applicant_name = frappe.db.get_value("Job Applicant", doc.job_applicant, "applicant_name")
        interviewers = [row.interviewer for row in (doc.interview_details or []) if row.interviewer]

        return {
            "status": "success",
            "data": _serialize_interview(doc, applicant_name=applicant_name, interviewers=interviewers),
        }
    except frappe.DoesNotExistError:
        return {"status": "error", "message": f"Interview '{name}' not found", "data": None}
    except Exception as exc:
        frappe.log_error(frappe.get_traceback(), "Interview Scheduler - get_interview_scheduler")
        return {"status": "error", "message": str(exc), "data": None}


@frappe.whitelist()
def create_interview_scheduler(data):
    try:
        payload = _parse_payload(data)
        doc = frappe.new_doc("Interview")
        _set_interview_values(doc, payload)
        doc.insert(ignore_permissions=False)
        frappe.db.commit()

        return {
            "status": "success",
            "message": f"Interview '{doc.name}' created successfully",
            "data": {"id": doc.name},
        }
    except Exception as exc:
        frappe.log_error(frappe.get_traceback(), "Interview Scheduler - create_interview_scheduler")
        return {"status": "error", "message": str(exc), "data": None}


@frappe.whitelist()
def update_interview_scheduler(name, data):
    try:
        payload = _parse_payload(data)
        doc = frappe.get_doc("Interview", name)
        _set_interview_values(doc, payload)
        doc.save(ignore_permissions=False)
        frappe.db.commit()

        return {
            "status": "success",
            "message": f"Interview '{doc.name}' updated successfully",
            "data": {"id": doc.name},
        }
    except Exception as exc:
        frappe.log_error(frappe.get_traceback(), "Interview Scheduler - update_interview_scheduler")
        return {"status": "error", "message": str(exc), "data": None}


@frappe.whitelist()
def delete_interview_scheduler(name):
    try:
        frappe.delete_doc("Interview", name, ignore_permissions=False)
        frappe.db.commit()
        return {"status": "success", "message": "Interview deleted successfully"}
    except Exception as exc:
        frappe.log_error(frappe.get_traceback(), "Interview Scheduler - delete_interview_scheduler")
        return {"status": "error", "message": str(exc)}


@frappe.whitelist()
def get_interview_round_options():
    rounds = frappe.get_all(
        "Interview Round",
        fields=["name", "designation", "interview_type", "expected_average_rating"],
        order_by="name asc",
    )
    return {"status": "success", "data": rounds}


@frappe.whitelist()
def get_job_applicant_options(search_text=""):
    search_text = _normalize(search_text)
    filters = {}
    if search_text:
        filters = [["name", "like", f"%{search_text}%"]]

    applicants = frappe.get_all(
        "Job Applicant",
        filters=filters,
        fields=["name", "applicant_name", "job_title", "email_id"],
        order_by="modified desc",
        page_length=50,
    )

    return {"status": "success", "data": applicants}
