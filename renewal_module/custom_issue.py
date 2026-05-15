import frappe
from frappe.utils import now_datetime
from datetime import datetime, timedelta
from frappe.utils import get_datetime
from frappe import _


def _to_time(value):
    return (datetime.min + value).time() if value else None


def _get_employee_details(user):
    return frappe.db.get_value(
        "Employee",
        {"user_id": user},
        ["name", "default_shift", "reports_to"],
        as_dict=True,
    )


def _get_manager_user(employee_doc):
    if not employee_doc or not employee_doc.get("reports_to"):
        return None

    return frappe.db.get_value("Employee", employee_doc.get("reports_to"), "user_id")


def _get_shift_details(shift_type):
    if not shift_type:
        return None
    return frappe.db.get_value(
        "Shift Type",
        shift_type,
        ["name", "start_time", "end_time", "holiday_list"],
        as_dict=True,
    )


def _get_shift_bounds(current_day, shift_start, shift_end):
    shift_start_dt = datetime.combine(current_day, shift_start)
    shift_end_dt = datetime.combine(current_day, shift_end)
    if shift_end_dt <= shift_start_dt:
        shift_end_dt += timedelta(days=1)
    return shift_start_dt, shift_end_dt


def _approval_token(issue_name, user, work_date):
    return f"OT-APPROVAL|{issue_name}|{user}|{work_date}"


def _request_marker(token):
    return f"[OT_REQUEST] {token}"


def _approved_marker(token):
    return f"[OT_APPROVED] {token}"


def _rejected_marker(token):
    return f"[OT_REJECTED] {token}"


def _extract_approver_from_content(content):
    for line in (content or "").splitlines():
        if line.startswith("approver:"):
            value = line.split(":", 1)[1].strip()
            return value or None
    return None


def _extract_approved_by_from_content(content):
    for line in (content or "").splitlines():
        if line.startswith("approved_by:"):
            value = line.split(":", 1)[1].strip()
            return value or None
    return None


def _extract_request_token(content):
    marker = "[OT_REQUEST]"
    for line in (content or "").splitlines():
        value = (line or "").strip()
        if value.startswith(marker):
            token = value.replace(marker, "", 1).strip()
            return token or None
    return None


def _extract_approval_token(content):
    marker = "[OT_APPROVED]"
    for line in (content or "").splitlines():
        value = (line or "").strip()
        if value.startswith(marker):
            token = value.replace(marker, "", 1).strip()
            return token or None
    return None


def _parse_approval_token(token):
    parts = (token or "").split("|")
    if len(parts) != 4 or parts[0] != "OT-APPROVAL":
        return None
    return {
        "issue_name": parts[1],
        "requester_user": parts[2],
        "work_date": parts[3],
    }


def _is_system_manager(user):
    return "System Manager" in (frappe.get_roles(user) or [])


def _get_pending_request(issue_name, user, work_date, approver_user=None):
    token = _approval_token(issue_name, user, work_date)
    filters = {
        "reference_doctype": "Issue",
        "reference_name": issue_name,
        "content": ["like", f"%{_request_marker(token)}%"],
    }
    if approver_user:
        filters["content"] = ["like", f"%{_request_marker(token)}%approver:{approver_user}%"]

    rows = frappe.get_all(
        "Comment",
        filters=filters,
        fields=["name", "content", "owner", "creation"],
        order_by="creation desc",
        limit=50,
    )

    for row in rows:
        if _has_overtime_decision_after_request(issue_name, token, row.creation):
            continue
        return row

    return None


def _has_overtime_decision_after_request(issue_name, token, request_creation):
    approved_exists = frappe.db.exists(
        "Comment",
        {
            "reference_doctype": "Issue",
            "reference_name": issue_name,
            "creation": [">", request_creation],
            "content": ["like", f"%{_approved_marker(token)}%"],
        },
    )
    if approved_exists:
        return True

    rejected_exists = frappe.db.exists(
        "Comment",
        {
            "reference_doctype": "Issue",
            "reference_name": issue_name,
            "creation": [">", request_creation],
            "content": ["like", f"%{_rejected_marker(token)}%"],
        },
    )
    return bool(rejected_exists)


def _get_latest_request(issue_name, user, work_date):
    token = _approval_token(issue_name, user, work_date)
    rows = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Issue",
            "reference_name": issue_name,
            "content": ["like", f"%{_request_marker(token)}%"],
        },
        fields=["name", "content", "owner", "creation"],
        order_by="creation desc",
        limit=1,
    )
    return rows[0] if rows else None


def _has_overtime_approval(issue_name, user, work_date):
    details = _get_overtime_approval_details(issue_name, user, work_date)
    return bool(details.get("approved"))


def _has_overtime_approval_any(issue_name, user, work_dates):
    for work_date in work_dates or []:
        if not work_date:
            continue
        if _has_overtime_approval(issue_name, user, work_date):
            return True
    return False


def _get_overtime_approval_details(issue_name, user, work_date):
    token = _approval_token(issue_name, user, work_date)
    approved_rows = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Issue",
            "reference_name": issue_name,
            "content": ["like", f"%{_approved_marker(token)}%"],
        },
        fields=["name", "content", "owner", "creation"],
        order_by="creation desc",
        limit=10,
    )
    if not approved_rows:
        return {"approved": False, "approved_at": None}

    employee_doc = _get_employee_details(user)
    manager_user = _get_manager_user(employee_doc) if employee_doc else None
    latest_request = _get_latest_request(issue_name, user, work_date)
    requested_approver = _extract_approver_from_content(latest_request.content) if latest_request else None
    approved_times = []

    for row in approved_rows:
        approved_by = _extract_approved_by_from_content(row.content) or row.owner
        if manager_user and approved_by == manager_user:
            approved_times.append(get_datetime(row.creation))
            continue
        if requested_approver and approved_by == requested_approver:
            approved_times.append(get_datetime(row.creation))
            continue
        if approved_by and _is_system_manager(approved_by):
            approved_times.append(get_datetime(row.creation))

    if not approved_times:
        return {"approved": False, "approved_at": None}

    return {
        "approved": True,
        "approved_at": min(approved_times),
    }


def _has_day_overtime_approval(user, work_date):
    work_date_str = str(work_date)
    approved_rows = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Issue",
            "content": ["like", f"%[OT_APPROVED] OT-APPROVAL|%|{user}|{work_date_str}%"],
        },
        fields=["name", "content", "owner", "creation", "reference_name"],
        order_by="creation desc",
        limit=50,
    )
    if not approved_rows:
        return False

    employee_doc = _get_employee_details(user)
    manager_user = _get_manager_user(employee_doc) if employee_doc else None

    for row in approved_rows:
        token = _extract_approval_token(row.content)
        parsed = _parse_approval_token(token)
        if not parsed:
            continue
        if parsed.get("requester_user") != user or parsed.get("work_date") != work_date_str:
            continue

        issue_name = parsed.get("issue_name") or row.reference_name
        latest_request = _get_latest_request(issue_name, user, work_date)
        requested_approver = _extract_approver_from_content(latest_request.content) if latest_request else None
        approved_by = _extract_approved_by_from_content(row.content) or row.owner

        if manager_user and approved_by == manager_user:
            return True
        if requested_approver and approved_by == requested_approver:
            return True
        if approved_by and _is_system_manager(approved_by):
            return True

    return False


def _validate_approver_user(approver_user, requester_user):
    if not approver_user:
        return False

    if approver_user == requester_user:
        return False

    if not frappe.db.exists("User", approver_user):
        return False

    user_enabled = frappe.db.get_value("User", approver_user, "enabled")
    return bool(user_enabled)


def _queue_or_send_overtime_email(issue_name, requester_user, work_date, approver_user, token):
    if not approver_user:
        return "error", _("Approver is not configured.")

    if not frappe.db.exists("User", approver_user):
        return "error", _("Approver user not found.")

    approver_doc = frappe.get_doc("User", approver_user)
    approver_email = (approver_doc.email or "").strip()
    if not approver_email:
        return "error", _("Approver email is not configured.")

    default_outgoing = frappe.db.get_value(
        "Email Account",
        {"default_outgoing": 1, "enable_outgoing": 1},
        "name",
    )
    any_outgoing = default_outgoing or frappe.db.get_value(
        "Email Account",
        {"enable_outgoing": 1},
        "name",
    )
    if not any_outgoing:
        return "error", _("Outgoing email account is not configured. Please configure Email Account.")

    issue_doc = frappe.get_doc("Issue", issue_name)
    requester_doc = frappe.get_doc("User", requester_user)
    approval_link = frappe.utils.get_url(f"/app/ticketss/{issue_name}")

    subject = f"Overtime Approval Request - Issue #{issue_name}"
    message = f"""
    <p>Dear {approver_doc.first_name or approver_user},</p>

    <p>{requester_doc.first_name or requester_user} has requested overtime approval for work on {work_date}.</p>

    <p><strong>Issue Details:</strong></p>
    <ul>
        <li><strong>Issue ID:</strong> {issue_name}</li>
        <li><strong>Subject:</strong> {issue_doc.subject}</li>
        <li><strong>Work Date:</strong> {work_date}</li>
        <li><strong>Requester:</strong> {requester_user}</li>
    </ul>

    <p><strong>Actions:</strong></p>
    <p>
        <a href="{approval_link}?overtime_action=approve&token={token}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
            ✓ Approve
        </a>
        &nbsp;&nbsp;
        <a href="{approval_link}?overtime_action=reject&token={token}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
            ✗ Reject
        </a>
    </p>

    <p>Or visit the issue directly: <a href="{approval_link}">{approval_link}</a></p>

    <p>Best regards,<br/>System</p>
    """

    try:
        # delayed=True ensures Email Queue entry is created and processed by scheduler worker
        frappe.sendmail(
            recipients=[approver_email],
            subject=subject,
            message=message,
            reference_doctype="Issue",
            reference_name=issue_name,
            delayed=True,
        )
        frappe.db.commit()
        return "queued", _("Email queued to approver.")
    except Exception as e:
        raw_error = (str(e) or "").strip()
        if not raw_error:
            raw_error = _("Unknown email error while queueing email. Please check Email Account and scheduler worker.")
        frappe.log_error(frappe.get_traceback(), f"Error queueing overtime approval email: {raw_error}")
        return "error", raw_error


def _create_overtime_approval_request(issue_name, user, work_date, approver_user=None):
    employee_doc = _get_employee_details(user)
    if not employee_doc:
        return {"status": "blocked", "message": _("Employee record not found for this user.")}

    manager_user = _get_manager_user(employee_doc)
    resolved_approver = approver_user if _validate_approver_user(approver_user, user) else manager_user

    if not resolved_approver:
        return {
            "status": "blocked",
            "message": _("Manager is not configured in Employee reports_to for this user."),
        }

    token = _approval_token(issue_name, user, work_date)

    existing_pending = _get_pending_request(issue_name, user, work_date, approver_user=resolved_approver)
    if existing_pending:
        existing_content = existing_pending.get("content") if isinstance(existing_pending, dict) else getattr(existing_pending, "content", None)
        existing_approver = _extract_approver_from_content(existing_content) if existing_content else None
        final_approver = existing_approver or resolved_approver
        email_status, email_message = _queue_or_send_overtime_email(issue_name, user, work_date, final_approver, token)
        return {
            "status": "approval_requested",
            "message": _("Overtime approval request is already pending with approver."),
            "manager_user": manager_user,
            "approver_user": final_approver,
            "email_status": email_status,
            "email_message": email_message,
        }

    if _has_overtime_approval(issue_name, user, work_date):
        return {
            "status": "approved",
            "message": _("Overtime already approved."),
            "manager_user": manager_user,
            "approver_user": resolved_approver,
        }

    request_comment = frappe.get_doc(
        {
            "doctype": "Comment",
            "comment_type": "Info",
            "reference_doctype": "Issue",
            "reference_name": issue_name,
            "content": (
                f"{_request_marker(token)}\n"
                f"requester:{user}\n"
                f"approver:{resolved_approver}\n"
                f"work_date:{work_date}\n"
                f"Request overtime approval for this issue."
            ),
        }
    )
    request_comment.insert(ignore_permissions=True)
    frappe.db.commit()
    email_status, email_message = _queue_or_send_overtime_email(issue_name, user, work_date, resolved_approver, token)

    return {
        "status": "approval_requested",
        "message": _("Overtime approval request sent to approver."),
        "manager_user": manager_user,
        "approver_user": resolved_approver,
        "email_status": email_status,
        "email_message": email_message,
    }


@frappe.whitelist()
def get_overtime_approval_status(issue_name, user=None, work_date=None):
    target_user = user or frappe.session.user
    target_date = get_datetime(work_date).date() if work_date else now_datetime().date()

    employee_doc = _get_employee_details(target_user)
    if not employee_doc:
        return {
            "status": "blocked",
            "message": _("Employee record not found for this user."),
            "manager_user": None,
            "issue_name": issue_name,
            "work_date": str(target_date),
        }

    manager_user = _get_manager_user(employee_doc)
    if not manager_user:
        return {
            "status": "blocked",
            "message": _("Manager is not configured in Employee reports_to for this user."),
            "manager_user": None,
            "issue_name": issue_name,
            "work_date": str(target_date),
        }

    token = _approval_token(issue_name, target_user, target_date)

    if _has_overtime_approval(issue_name, target_user, target_date):
        return {
            "status": "approved",
            "message": _("Overtime is approved by manager."),
            "manager_user": manager_user,
            "issue_name": issue_name,
            "work_date": str(target_date),
        }

    pending_request = _get_pending_request(issue_name, target_user, target_date)

    if pending_request:
        return {
            "status": "pending",
            "message": _("Approval request is pending with approver."),
            "manager_user": manager_user,
            "approver_user": _extract_approver_from_content(pending_request.content),
            "issue_name": issue_name,
            "work_date": str(target_date),
        }

    return {
        "status": "not_requested",
        "message": _("No approval request found for this issue/date."),
        "manager_user": manager_user,
        "issue_name": issue_name,
        "work_date": str(target_date),
    }


@frappe.whitelist()
def get_timer_permission_status(issue_name, user=None, dt_str=None):
    target_user = user or frappe.session.user
    now_dt = get_datetime(dt_str) if dt_str else now_datetime()

    if is_working_time(target_user, now_dt.strftime("%Y-%m-%d %H:%M:%S")):
        return {
            "can_start": True,
            "requires_approval": False,
            "status": "within_shift",
            "message": _("Within shift time. Timer can start."),
        }

    employee_doc = _get_employee_details(target_user)
    manager_user = _get_manager_user(employee_doc) if employee_doc else None

    approval_dates = [now_dt.date()]
    open_log = frappe.db.get_value(
        "Issue Time Log",
        {
            "parent": issue_name,
            "user": target_user,
            "to_time": ["is", "not set"],
        },
        ["from_time"],
        as_dict=True,
        order_by="from_time desc",
    )
    open_log_from = get_datetime(open_log.from_time) if open_log and open_log.get("from_time") else None
    if open_log_from and open_log_from.date() not in approval_dates:
        approval_dates.append(open_log_from.date())

    approved = _has_overtime_approval_any(issue_name, target_user, approval_dates)

    if approved:
        return {
            "can_start": True,
            "requires_approval": False,
            "status": "approved",
            "manager_user": manager_user,
            "message": _("Overtime is approved. Timer can start."),
        }

    pending_request = _get_pending_request(issue_name, target_user, now_dt.date())
    if not pending_request and open_log_from:
        pending_request = _get_pending_request(issue_name, target_user, open_log_from.date())
    if pending_request:
        return {
            "can_start": False,
            "requires_approval": True,
            "status": "pending",
            "manager_user": manager_user,
            "approver_user": _extract_approver_from_content(pending_request.content),
            "message": _("Overtime approval is pending."),
        }

    return {
        "can_start": False,
        "requires_approval": True,
        "status": "not_requested",
        "manager_user": manager_user,
        "message": _("Overtime approval is required before starting timer."),
    }

@frappe.whitelist()
def add_time_log_row(issue_name):
    doc = frappe.get_doc("Issue", issue_name)
    now = now_datetime()

    doc.append("time_logs", {
        "user": frappe.session.user,
        "from_time": now
    })

    if doc.status != "Open":
        doc.status = "Open"

    doc.save()


from datetime import time as dtime

@frappe.whitelist()
def is_working_time(user, dt_str=None):
    dt = get_datetime(dt_str) if dt_str else frappe.utils.now_datetime()
    
    # Check if the day is Sunday (Python: 6=Sunday)
    if dt.weekday() == 6:
        return False

    # Get the employee for this user
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return False

    # Get Shift Type assigned to the employee
    shift_type = frappe.db.get_value("Employee", employee, "default_shift")
    if not shift_type:
        return False

    # Check if it's a holiday from Shift Type's assigned Holiday List
    holiday_list = frappe.db.get_value("Shift Type", shift_type, "holiday_list")
    if holiday_list:
        holidays = frappe.get_all(
            "Holiday",
            filters={"parent": holiday_list},
            fields=["holiday_date"]
        )
        holiday_dates = {h.holiday_date for h in holidays}
        if dt.date() in holiday_dates:
            return False

    # Get working hours from Shift Type
    shift_details = frappe.get_all("Shift Type", filters={"name": shift_type}, fields=["start_time", "end_time"])
    if not shift_details:
        return False

    # Convert timedelta to time (if needed)
    shift_start = (dt.min + shift_details[0].start_time).time()
    shift_end = (dt.min + shift_details[0].end_time).time()

    # Current time
    t = dt.time()

    # Check if current time is within shift hours
    if shift_start <= shift_end:
        if shift_start <= t < shift_end:
            return True
    else: # Night shift
        if shift_start <= t or t < shift_end:
            return True

    return False


@frappe.whitelist()
def get_elapsed_working_seconds(user, from_time_str, to_time_str=None, issue_name=None):
    frappe.logger().info(f"[get_elapsed_working_seconds] Called for {user} from {from_time_str}")

    from_dt = get_datetime(from_time_str)
    to_dt = get_datetime(to_time_str) if to_time_str else now_datetime()
    is_within_shift = is_working_time(user, to_dt.strftime("%Y-%m-%d %H:%M:%S"))

    if from_dt >= to_dt:
        to_time_str_final = to_dt.strftime("%Y-%m-%d %H:%M:%S")
        return {
            "seconds": 0,
            "regular_seconds": 0,
            "overtime_seconds": 0,
            "is_within_shift": is_within_shift,
            "to_time_str": to_time_str_final,
            "end_date": to_dt.strftime("%Y-%m-%d"),
            "end_time": to_dt.strftime("%H:%M:%S")
        }

    # Get the employee and shift
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        to_time_str_final = to_dt.strftime("%Y-%m-%d %H:%M:%S")
        return {
            "seconds": int((to_dt - from_dt).total_seconds()),
            "regular_seconds": 0,
            "overtime_seconds": int((to_dt - from_dt).total_seconds()),
            "is_within_shift": is_within_shift,
            "to_time_str": to_time_str_final,
            "end_date": to_dt.strftime("%Y-%m-%d"),
            "end_time": to_dt.strftime("%H:%M:%S")
        }

    shift_type = frappe.db.get_value("Employee", employee, "default_shift")
    if not shift_type:
        to_time_str_final = to_dt.strftime("%Y-%m-%d %H:%M:%S")
        return {
            "seconds": int((to_dt - from_dt).total_seconds()),
            "regular_seconds": 0,
            "overtime_seconds": int((to_dt - from_dt).total_seconds()),
            "is_within_shift": is_within_shift,
            "to_time_str": to_time_str_final,
            "end_date": to_dt.strftime("%Y-%m-%d"),
            "end_time": to_dt.strftime("%H:%M:%S")
        }

    shift = frappe.get_doc("Shift Type", shift_type)

    # Holidays
    holiday_dates = set()
    if shift.holiday_list:
        holidays = frappe.get_all(
            "Holiday",
            filters={"parent": shift.holiday_list},
            fields=["holiday_date"]
        )
        holiday_dates = {h.holiday_date for h in holidays}

    # Assume weekoffs Sun (6)
    weekoffs = {6}

    regular_seconds = 0
    overtime_seconds = 0
    current_day = from_dt.date()

    def overlap_seconds(start_a, end_a, start_b, end_b):
        start = max(start_a, start_b)
        end = min(end_a, end_b)
        return max(0, int((end - start).total_seconds()))

    requires_approval = False

    while current_day <= to_dt.date():
        day_key = current_day
        day_start_dt = datetime.combine(current_day, datetime.min.time())
        day_end_dt = day_start_dt + timedelta(days=1)

        active_start = max(from_dt, day_start_dt)
        active_end = min(to_dt, day_end_dt)

        if active_end <= active_start:
            current_day += timedelta(days=1)
            continue

        day_active_seconds = int((active_end - active_start).total_seconds())
        is_holiday = current_day in holiday_dates
        is_weekoff = current_day.weekday() in weekoffs
        shift_start_dt = None
        shift_end_dt = None

        day_overtime_seconds = 0
        day_regular_seconds = 0

        if is_holiday or is_weekoff:
            day_overtime_seconds = day_active_seconds
            current_day += timedelta(days=1)
        else:
            shift_start_dt = datetime.combine(current_day, (datetime.min + shift.start_time).time())
            shift_end_dt = datetime.combine(current_day, (datetime.min + shift.end_time).time())

            if shift_end_dt <= shift_start_dt:
                shift_end_dt += timedelta(days=1)

            day_regular_seconds = overlap_seconds(active_start, active_end, shift_start_dt, shift_end_dt)
            day_overtime_seconds = max(0, day_active_seconds - day_regular_seconds)

            current_day += timedelta(days=1)

        approved_for_day = True
        approved_at_for_day = None
        if day_overtime_seconds > 0 and issue_name:
            approval_details = _get_overtime_approval_details(issue_name, user, day_key)
            approved_for_day = bool(approval_details.get("approved"))
            approved_at_for_day = approval_details.get("approved_at")

            # Keep a running overtime log continuous across midnight when OT was already
            # approved for the day on which the timer started.
            if not approved_for_day and from_dt.date() != day_key:
                rollover_approval = _get_overtime_approval_details(issue_name, user, from_dt.date())
                if rollover_approval.get("approved"):
                    approved_for_day = True
                    approved_at_for_day = rollover_approval.get("approved_at")

        regular_seconds += day_regular_seconds
        if day_overtime_seconds > 0:
            if not approved_for_day:
                if current_day == to_dt.date():
                    requires_approval = True
                continue

            if not approved_at_for_day:
                overtime_seconds += day_overtime_seconds
                continue

            approved_window_start = max(active_start, approved_at_for_day)
            if approved_window_start >= active_end:
                if current_day == to_dt.date():
                    requires_approval = True
                continue

            approved_active_seconds = int((active_end - approved_window_start).total_seconds())

            if is_holiday or is_weekoff:
                approved_overtime_seconds = max(0, approved_active_seconds)
            else:
                approved_regular_seconds = overlap_seconds(
                    approved_window_start,
                    active_end,
                    shift_start_dt,
                    shift_end_dt,
                )
                approved_overtime_seconds = max(0, approved_active_seconds - approved_regular_seconds)

            overtime_seconds += approved_overtime_seconds

    result = int(regular_seconds + overtime_seconds)
    to_time_str_final = to_dt.strftime("%Y-%m-%d %H:%M:%S")

    frappe.logger().info(
        f"[get_elapsed_working_seconds] Result: total={result}, regular={regular_seconds}, overtime={overtime_seconds}, to_time={to_time_str_final}"
    )

    approval_status = "none"
    if issue_name and not is_within_shift:
        # Outside shift, always expose latest approval state for frontend timer decisions.
        req_status = get_overtime_approval_status(issue_name, user, to_dt.date())
        approval_status = req_status.get("status", "none")
        if approval_status != "approved" and from_dt.date() != to_dt.date():
            fallback_req = get_overtime_approval_status(issue_name, user, from_dt.date())
            if fallback_req.get("status") == "approved":
                approval_status = "approved"
        requires_approval = approval_status in {"pending", "not_requested", "blocked"}
    elif requires_approval and issue_name:
        req_status = get_overtime_approval_status(issue_name, user, to_dt.date())
        approval_status = req_status.get("status", "none")
        if approval_status != "approved" and from_dt.date() != to_dt.date():
            fallback_req = get_overtime_approval_status(issue_name, user, from_dt.date())
            if fallback_req.get("status") == "approved":
                approval_status = "approved"
        if approval_status == "approved":
            requires_approval = False

    return {
        "seconds": result,
        "regular_seconds": int(regular_seconds),
        "overtime_seconds": int(overtime_seconds),
        "requires_approval": requires_approval,
        "approval_status": approval_status,
        "is_within_shift": is_within_shift,
        "to_time_str": to_time_str_final,
        "end_date": to_dt.strftime("%Y-%m-%d"),
        "end_time": to_dt.strftime("%H:%M:%S")
    }


@frappe.whitelist()
def request_overtime_approval(issue_name):
    user = frappe.session.user
    work_date = now_datetime().date()
    return _create_overtime_approval_request(issue_name, user, work_date)


@frappe.whitelist()
def request_overtime_approval_to_user(issue_name, approver_user, work_date=None):
    user = frappe.session.user
    target_date = get_datetime(work_date).date() if work_date else now_datetime().date()

    if not _validate_approver_user(approver_user, user):
        frappe.throw(_("Selected approver user is invalid or inactive."))

    return _create_overtime_approval_request(issue_name, user, target_date, approver_user=approver_user)


@frappe.whitelist()
def get_my_pending_overtime_request(issue_name):
    actor = frappe.session.user

    rows = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Issue",
            "reference_name": issue_name,
            "content": ["like", "%[OT_REQUEST]%"],
        },
        fields=["name", "content", "owner", "creation"],
        order_by="creation desc",
        limit=50,
    )

    for row in rows:
        token = _extract_request_token(row.content)
        if not token:
            continue

        parts = token.split("|")
        if len(parts) != 4 or parts[0] != "OT-APPROVAL":
            continue

        request_issue, requester_user, work_date = parts[1], parts[2], parts[3]
        if request_issue != issue_name:
            continue

        if _has_overtime_decision_after_request(issue_name, token, row.creation):
            continue

        request_approver = _extract_approver_from_content(row.content)
        requester_employee = _get_employee_details(requester_user)
        requester_manager = _get_manager_user(requester_employee) if requester_employee else None

        can_actor_approve = (
            (request_approver and actor == request_approver)
            or (requester_manager and actor == requester_manager)
            or _is_system_manager(actor)
        )
        if not can_actor_approve:
            continue

        return {
            "status": "pending",
            "token": token,
            "issue_name": issue_name,
            "requester_user": requester_user,
            "work_date": work_date,
            "approver_user": request_approver or requester_manager,
            "requested_on": row.creation,
            "message": _("Pending overtime approval request found."),
        }

    return {
        "status": "none",
        "issue_name": issue_name,
        "approver_user": actor,
        "message": _("No pending overtime approval request for current user."),
    }


@frappe.whitelist()
def approve_overtime_request(issue_name, user, work_date=None):
    approver_actor = frappe.session.user
    target_date = get_datetime(work_date).date() if work_date else now_datetime().date()

    employee_doc = _get_employee_details(user)
    if not employee_doc:
        frappe.throw(_("Employee record not found for selected user."))

    expected_manager = _get_manager_user(employee_doc)
    token = _approval_token(issue_name, user, target_date)

    pending_for_actor = _get_pending_request(issue_name, user, target_date, approver_user=approver_actor)

    if not pending_for_actor and approver_actor != expected_manager and not _is_system_manager(approver_actor):
        frappe.throw(_("Only assigned approver, reporting manager, or System Manager can approve overtime."))

    if _has_overtime_approval(issue_name, user, target_date):
        return {"status": "approved", "message": _("Overtime already approved.")}

    approval_comment = frappe.get_doc(
        {
            "doctype": "Comment",
            "comment_type": "Info",
            "reference_doctype": "Issue",
            "reference_name": issue_name,
            "content": (
                f"{_approved_marker(token)}\n"
                f"approved_by:{approver_actor}\n"
                f"requester:{user}\n"
                f"work_date:{target_date}\n"
                f"Overtime approved for timer continuation."
            ),
        }
    )
    approval_comment.insert(ignore_permissions=True)

    frappe.db.commit()
    return {"status": "approved", "message": _("Overtime approved successfully.")}


@frappe.whitelist()
def start_time_log(issue, approver_user=None):
    user = frappe.session.user
    current_dt = now_datetime()

    issue_doc = frappe.get_doc("Issue", issue)
    if issue_doc.status == "Closed":
        frappe.throw(_("Cannot start timer for closed issue."))

    if issue_doc.working_agent and issue_doc.working_agent != user:
        frappe.throw(_("Only working agent can start work timer for this issue."))

    open_logs = frappe.get_all(
        "Issue Time Log",
        filters={"parent": issue, "user": user, "to_time": ["is", "not set"]},
        fields=["name", "from_time"],
        limit=1,
        order_by="from_time desc",
    )

    if is_working_time(user, current_dt.strftime("%Y-%m-%d %H:%M:%S")):
        if open_logs:
            return {
                "status": "resumed",
                "message": _("Work timer already running."),
                "from_time": str(open_logs[0].from_time),
            }

        issue_doc.append(
            "time_logs",
            {
                "user": user,
                "from_time": current_dt,
            },
        )
        issue_doc.save(ignore_permissions=True)
        frappe.db.commit()
        return {
            "status": "started",
            "message": _("Work timer started."),
            "from_time": current_dt.strftime("%Y-%m-%d %H:%M:%S"),
        }

    work_date = current_dt.date()
    approval_dates = [work_date]
    if open_logs and open_logs[0].from_time:
        open_from_dt = get_datetime(open_logs[0].from_time)
        if open_from_dt.date() not in approval_dates:
            approval_dates.append(open_from_dt.date())

    has_approval = _has_overtime_approval_any(issue, user, approval_dates)
    if not has_approval:
        return {
            "status": "approval_required",
            "message": _("Shift ended. Overtime approval is required to start the timer."),
            "requires_approval": True,
            "can_request_overtime": True,
        }

    if open_logs:
        return {
            "status": "resumed",
            "message": _("Overtime approved. Timer resumed."),
            "approved": True,
            "from_time": str(open_logs[0].from_time),
        }

    issue_doc.append(
        "time_logs",
        {
            "user": user,
            "from_time": current_dt,
        },
    )
    issue_doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {
        "status": "started",
        "message": _("Overtime approved. Work timer started."),
        "approved": True,
        "from_time": current_dt.strftime("%Y-%m-%d %H:%M:%S"),
    }


@frappe.whitelist()
def is_working_time_for_user(user):
    from frappe.utils import now_datetime
    now = now_datetime()

    # Optional: Replace this with logic based on Shift or Holidays
    weekday = now.weekday()  # 0 = Monday, 6 = Sunday
    hour = now.hour

    if weekday >= 5:  # Saturday or Sunday
        return False

    if 9 <= hour < 18:  # Only between 9am and 6pm
        return True

    return False

from frappe.exceptions import DoesNotExistError, PermissionError

@frappe.whitelist()
def update_last_time_log(user, issue):
    try:
        logs = frappe.db.get_all(
                "Issue Time Log",
                filters={
                    "user": user,
                    "parent": issue,
                    "to_time": ["is", "not set"]
                },
                fields=["name"],
                order_by="from_time desc",
                limit=1,
                ignore_permissions=True
            )

        if not logs:
            frappe.msgprint("No open time log found.")
            return {"status": "no_log_found"}

        # ✅ Try accessing child table with permission bypass
        try:
            log = frappe.get_doc("Issue Time Log", logs[0].name)
            log.flags.ignore_permissions = True
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), "❌ Failed to get log with ignore_permissions")
            raise

        now_str = now_datetime().strftime("%Y-%m-%d %H:%M:%S")

        try:
            elapsed = get_elapsed_working_seconds(log.user, log.from_time, now_str, issue_name=issue)
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), "❌ Failed to calculate elapsed time")
            raise

        log.to_time = elapsed["to_time_str"]
        log.time_duration = elapsed["seconds"]

        log_meta = frappe.get_meta("Issue Time Log")
        if log_meta.has_field("regular_seconds"):
            log.set("regular_seconds", int(elapsed.get("regular_seconds", 0)))
        if log_meta.has_field("overtime_seconds"):
            log.set("overtime_seconds", int(elapsed.get("overtime_seconds", 0)))
        if log_meta.has_field("regular_time_duration"):
            log.set("regular_time_duration", int(elapsed.get("regular_seconds", 0)))
        if log_meta.has_field("extra_time_duration"):
            log.set("extra_time_duration", int(elapsed.get("overtime_seconds", 0)))

        # Split date/time
        log.end_date = elapsed["end_date"]
        log.end_time = elapsed["end_time"]

        try:
            log.save()
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), "❌ Failed to save log")
            raise

        return {
            "status": "updated",
            "to_time": log.to_time,
            "end_date": log.end_date,
            "end_time": log.end_time,
            "time_duration": log.time_duration
        }

    except Exception as e:
        # Log the exact issue and let the developer see it
        frappe.log_error(frappe.get_traceback(), "🚨 update_last_time_log failed")
        frappe.throw(_("⚠️ An error occurred while updating time log. Please contact admin."))

# this code for issue custom page
@frappe.whitelist()
def get_issue_timer(issue_id):
    """Return total worked time (in seconds and formatted) for given issue"""
    user = frappe.session.user

    # Get total worked seconds for all closed time logs + ongoing one (if any)
    total_seconds = 0
    total_regular_seconds = 0
    total_overtime_seconds = 0

    log_meta = frappe.get_meta("Issue Time Log")
    has_regular_seconds = log_meta.has_field("regular_seconds")
    has_overtime_seconds = log_meta.has_field("overtime_seconds")
    has_regular_time_duration = log_meta.has_field("regular_time_duration")
    has_extra_time_duration = log_meta.has_field("extra_time_duration")

    fields = ["from_time", "to_time", "time_duration"]
    if has_regular_seconds:
        fields.append("regular_seconds")
    if has_overtime_seconds:
        fields.append("overtime_seconds")
    if has_regular_time_duration:
        fields.append("regular_time_duration")
    if has_extra_time_duration:
        fields.append("extra_time_duration")

    custom_issue_time_log = frappe.get_all(
        "Issue Time Log",
        filters={"parent": issue_id, "user": user},
        fields=fields
    )

    for log in custom_issue_time_log:
        if log.to_time:
            if log.time_duration:
                total_seconds += int(log.time_duration)

                if has_regular_seconds and getattr(log, "regular_seconds", None) is not None:
                    total_regular_seconds += int(log.regular_seconds or 0)
                elif has_regular_time_duration and getattr(log, "regular_time_duration", None) is not None:
                    total_regular_seconds += int(log.regular_time_duration or 0)

                if has_overtime_seconds and getattr(log, "overtime_seconds", None) is not None:
                    total_overtime_seconds += int(log.overtime_seconds or 0)
                elif has_extra_time_duration and getattr(log, "extra_time_duration", None) is not None:
                    total_overtime_seconds += int(log.extra_time_duration or 0)
            elif log.from_time:
                elapsed = get_elapsed_working_seconds(user, str(log.from_time), str(log.to_time), issue_name=issue_id)
                total_seconds += elapsed.get("seconds", 0)
                total_regular_seconds += int(elapsed.get("regular_seconds", 0))
                total_overtime_seconds += int(elapsed.get("overtime_seconds", 0))
        else:
            # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(log)))
            from_time = log.from_time
            to_time = log.to_time or frappe.utils.now_datetime()

            # Use your existing working hours calculation function
            elapsed = get_elapsed_working_seconds(user, str(from_time), str(to_time), issue_name=issue_id)
            total_seconds += elapsed.get("seconds", 0)
            total_regular_seconds += int(elapsed.get("regular_seconds", 0))
            total_overtime_seconds += int(elapsed.get("overtime_seconds", 0))

    # Format total time as HH:MM:SS
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    formatted_time = f"{hours:02}:{minutes:02}:{seconds:02}"

    return {
        "formatted_time": formatted_time,
        "working_seconds": total_seconds,
        "regular_seconds": total_regular_seconds,
        "overtime_seconds": total_overtime_seconds
    }




@frappe.whitelist()
def has_open_timelog(issue_id, user):
    open_log = frappe.db.exists("Issue Time Log", {
        "parent": issue_id,
        "to_time": ["is", "not set"],
        "user": user
    })
    return bool(open_log)


@frappe.whitelist()
def check_shift_ended(user, dt_str=None):
    """Check if shift time has ended for the user"""
    dt = get_datetime(dt_str) if dt_str else now_datetime()
    
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return False
    
    shift_type = frappe.db.get_value("Employee", employee, "default_shift")
    if not shift_type:
        return False
    
    shift = frappe.get_doc("Shift Type", shift_type)
    shift_end_time = (datetime.min + shift.end_time).time()
    shift_end_dt = datetime.combine(dt.date(), shift_end_time)
    
    # If shift end is earlier than start (night shift), add 1 day
    shift_start_time = (datetime.min + shift.start_time).time()
    if shift_end_time <= shift_start_time:
        shift_end_dt += timedelta(days=1)
    
    return dt >= shift_end_dt


@frappe.whitelist()
def get_shift_end_time(user, dt_str=None):
    """Get the end time of shift for the user on a given date"""
    dt = get_datetime(dt_str) if dt_str else now_datetime()
    
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        return None
    
    shift_type = frappe.db.get_value("Employee", employee, "default_shift")
    if not shift_type:
        return None
    
    shift = frappe.get_doc("Shift Type", shift_type)
    shift_end_time = (datetime.min + shift.end_time).time()
    shift_end_dt = datetime.combine(dt.date(), shift_end_time)
    
    # If shift end is earlier than start (night shift), add 1 day
    shift_start_time = (datetime.min + shift.start_time).time()
    if shift_end_time <= shift_start_time:
        shift_end_dt += timedelta(days=1)
    
    return shift_end_dt.strftime("%Y-%m-%d %H:%M:%S")


@frappe.whitelist()
def send_overtime_approval_email(issue_name, requester_user, work_date, approver_user):
    """Send email to approver for overtime approval"""
    if not frappe.db.exists("User", approver_user):
        return {"status": "error", "message": _("Approver user not found.")}
    
    approver_doc = frappe.get_doc("User", approver_user)
    issue_doc = frappe.get_doc("Issue", issue_name)
    requester_doc = frappe.get_doc("User", requester_user)
    
    token = _approval_token(issue_name, requester_user, work_date)
    
    # Create email content
    approval_link = frappe.utils.get_url(f"/app/ticketss/{issue_name}")
    
    subject = _("Overtime Approval Request - Issue #{issue}").format(issue=issue_name)
    
    message = f"""
    <p>Dear {approver_doc.first_name or approver_user},</p>
    
    <p>{requester_doc.first_name or requester_user} has requested overtime approval for work on {work_date}.</p>
    
    <p><strong>Issue Details:</strong></p>
    <ul>
        <li><strong>Issue ID:</strong> {issue_name}</li>
        <li><strong>Subject:</strong> {issue_doc.subject}</li>
        <li><strong>Work Date:</strong> {work_date}</li>
        <li><strong>Requester:</strong> {requester_user}</li>
    </ul>
    
    <p><strong>Actions:</strong></p>
    <p>
        <a href="{approval_link}?overtime_action=approve&token={token}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
            ✓ Approve
        </a>
        &nbsp;&nbsp;
        <a href="{approval_link}?overtime_action=reject&token={token}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
            ✗ Reject
        </a>
    </p>
    
    <p>Or visit the issue directly: <a href="{approval_link}">{approval_link}</a></p>
    
    <p>Best regards,<br/>System</p>
    """
    
    try:
        frappe.sendmail(
            recipients=[approver_doc.email],
            subject=subject,
            message=message,
            doctype="Issue",
            name=issue_name
        )
        return {"status": "sent", "message": _("Email sent to approver.")}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error sending overtime approval email: {str(e)}")
        return {"status": "error", "message": _("Failed to send email to approver.")}


@frappe.whitelist()
def process_overtime_approval_action(token, action):
    """Process overtime approval or rejection from email"""
    if action not in ["approve", "reject"]:
        return {"status": "error", "message": _("Invalid action.")}
    
    # Validate token format
    parts = token.split("|")
    if len(parts) != 4:
        return {"status": "error", "message": _("Invalid token format.")}
    
    issue_name, user, work_date = parts[1], parts[2], parts[3]
    approver_user = frappe.session.user
    
    if action == "approve":
        result = approve_overtime_request(issue_name, user, work_date)
        if result.get("status") == "approved":
            # Send approval notification email
            try:
                user_doc = frappe.get_doc("User", user)
                frappe.sendmail(
                    recipients=[user_doc.email],
                    subject=_("Overtime Approval Granted - Issue #{issue}").format(issue=issue_name),
                    message=f"""
                    <p>Your overtime request has been <strong>APPROVED</strong>.</p>
                    <p>Issue: {issue_name}</p>
                    <p>Work Date: {work_date}</p>
                    <p>You can now continue working on the timer.</p>
                    <p>Best regards,<br/>System</p>
                    """
                )
            except Exception as e:
                frappe.log_error(frappe.get_traceback(), "Error sending approval notification")
        
        return result
    
    elif action == "reject":
        employee_doc = _get_employee_details(user)
        expected_manager = _get_manager_user(employee_doc) if employee_doc else None
        pending_for_actor = _get_pending_request(issue_name, user, work_date, approver_user=approver_user)

        if not pending_for_actor and approver_user != expected_manager and not _is_system_manager(approver_user):
            frappe.throw(_("Only assigned approver, reporting manager, or System Manager can reject overtime."))

        # Create rejection comment
        token = _approval_token(issue_name, user, work_date)
        try:
            rejection_comment = frappe.get_doc(
                {
                    "doctype": "Comment",
                    "comment_type": "Info",
                    "reference_doctype": "Issue",
                    "reference_name": issue_name,
                    "content": (
                        f"[OT_REJECTED] {token}\n"
                        f"rejected_by:{approver_user}\n"
                        f"requester:{user}\n"
                        f"work_date:{work_date}\n"
                        f"Overtime request was rejected."
                    ),
                }
            )
            rejection_comment.insert(ignore_permissions=True)
            frappe.db.commit()
            
            # Send rejection notification email
            user_doc = frappe.get_doc("User", user)
            frappe.sendmail(
                recipients=[user_doc.email],
                subject=_("Overtime Approval Rejected - Issue #{issue}").format(issue=issue_name),
                message=f"""
                <p>Your overtime request has been <strong>REJECTED</strong>.</p>
                <p>Issue: {issue_name}</p>
                <p>Work Date: {work_date}</p>
                <p>Please contact your manager for more information.</p>
                <p>Best regards,<br/>System</p>
                """
            )
            
            return {"status": "rejected", "message": _("Overtime request was rejected.")}
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), "Error processing rejection")
            return {"status": "error", "message": _("Failed to process rejection.")}
