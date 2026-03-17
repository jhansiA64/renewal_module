import frappe

@frappe.whitelist()
def global_search(txt, limit=5):
    # frappe.msgprint("Hi")
    results = []
    doctypes = frappe.get_all("DocType", filters={
        "istable": 0,
        "issingle": 0,
        "name": ["like", f"%{txt}%"]
    }, fields=["name"],limit_page_length=limit)
    for dt in doctypes:
        results.append({"doctype": dt.name})
        # try:
        #     items = frappe.get_all(dt.name, filters=[["name", "like", f"%{txt}%"]], fields=["name"], limit_page_length=limit)
        #     for item in items:
        #         results.append({"doctype": dt.name})
        # except Exception:
        #     continue
    return results

import frappe

@frappe.whitelist()
def apply_assignment_rule(doctype, name):
    """Apply assignment rule for a document manually."""
    doc = frappe.get_doc(doctype, name)

    # Try new assignment rule engine (safe across versions)
    try:
        from frappe.automation.doctype.assignment_rule.assignment_rule import apply as apply_rule
        apply_rule(doc)
        return {"status": "success"}
    except ImportError:
        frappe.throw("Assignment rule engine not found in this Frappe version")

    return {"status": "failed"}

import frappe

@frappe.whitelist()
def get_user_notifications(offset=0, limit=10):
    user = frappe.session.user
    notifications = frappe.get_all(
        "Notification Log",
        filters={"for_user": user},
        fields=["name", "subject", "email_content", "creation", "read"],
        order_by="creation desc",
        limit_start=int(offset),
        limit_page_length=int(limit)
    )
    return notifications



import frappe

@frappe.whitelist()
def mark_all_as_read():
    user = frappe.session.user
    frappe.db.sql("""
        UPDATE `tabNotification Log`
        SET `read` = 1
        WHERE for_user = %s AND coalesce(`read`, 0) = 0
    """, (frappe.session.user,))
    frappe.db.commit()

    return True

@frappe.whitelist()
def mark_notification_as_read(notification_name):
    if notification_name:
        frappe.db.set_value("Notification Log", notification_name, "read", 1)
        frappe.db.commit()
    return {"status": "success"}



# your_app/your_app/api/issue.py
import frappe
from frappe import _

@frappe.whitelist()
def get_active_subscription_for_issue(issue_name):
    if not issue_name:
        return {"error": "missing_issue_name"}

    try:
        # Check if Issue exists
        frappe.get_doc("Issue", issue_name)
    except frappe.DoesNotExistError:
        return {"error": "issue_not_found"}

    # ✅ Fetch directly from the child table (Active Renewals)
    renewal_rows = frappe.get_all(
        "Active Renewals",
        filters={"parent": issue_name},
        fields=[
            "item",
            "item_name",
            "start_date",
            "end_date",
            "quantity",
            "amount",
            "renewal_id"
        ],
        order_by="start_date asc"
    )

    if not renewal_rows:
        return {"renewal_details": []}

    return {"renewal_details": renewal_rows}

import frappe
@frappe.whitelist()
def get_issue_activity(issue_name):
    """Return chronological activity timeline for an issue."""
    if not issue_name:
        return []

    activity = []

    # --- 1. Comments (All Types) ---
    comments = frappe.get_all(
        "Comment",
        filters={"reference_doctype": "Issue", "reference_name": issue_name},
        fields=["content", "creation", "owner", "comment_type", "comment_email"],
        order_by="creation desc"
    )

    # Map comment types to readable titles and colors
    comment_type_map = {
        "Comment": ("Commented", "warning"),
        "Like": ("Liked", "info"),
        "Info": ("Info Added", "secondary"),
        "Label": ("Label Added", "secondary"),
        "Workflow": ("Workflow Updated", "purple"),
        "Created": ("Document Created", "danger"),
        "Submitted": ("Submitted", "success"),
        "Cancelled": ("Cancelled", "danger"),
        "Updated": ("Updated", "info"),
        "Deleted": ("Deleted", "dark"),
        "Assigned": ("Assigned", "info"),
        "Assignment Completed": ("Assignment Completed", "success"),
        "Attachment": ("File Attached", "info"),
        "Attachment Removed": ("File Removed", "dark"),
        "Shared": ("Shared", "primary"),
        "Unshared": ("Unshared", "dark"),
        "Bot": ("Bot Activity", "secondary"),
        "Relinked": ("Relinked", "warning"),
        "Edit": ("Edited", "info")
    }

    for c in comments:
        user_fullname = frappe.utils.get_fullname(c.owner)
        
        comment_label, comment_color = comment_type_map.get(c.comment_type, ("Activity", "info"))

        # Default description
        desc = frappe.utils.strip_html_tags(c.content or "")

        # Optional: adjust messages for specific types
        # if c.comment_type == "Assigned":
        #     desc = f"{c.content}"
        # elif c.comment_type == "Attachment":
        #     desc = f"Attachment added by {user_fullname}"
        # elif c.comment_type == "Attachment Removed":
        #     desc = f"Attachment removed by {user_fullname}"
        # elif c.comment_type == "Deleted":
        #     desc = f"Deleted by {user_fullname}"

        activity.append({
            "type": c.comment_type,
            "title": f"{c.comment_email or user_fullname} {comment_label}",
            "description": desc,
            "timestamp": frappe.utils.format_datetime(c.creation, "medium"),
            "by": user_fullname,
            "color": comment_color,
            "is_html": True
        })


    # --- 2. Communications (Emails) ---
    communications = frappe.get_all(
        "Communication",
        filters={"reference_doctype": "Issue", "reference_name": issue_name},
        fields=["subject", "content", "sender_full_name", "creation", "communication_type","sender","recipients"],
        order_by="creation desc"
    )
    for c in communications:
        activity.append({
            "type": "Communication",
            "title": f"Notification sent to {c.recipients}" or "Communication Added",
            "description": c.content or "",
            "timestamp": frappe.utils.format_datetime(c.creation, "medium"),
            "by": c.sender_full_name or "System",
            "color": "info",
            "is_html": True
        })

    # --- 3. Status Changes (from Version) ---
    versions = frappe.get_all(
        "Version",
        filters={"ref_doctype": "Issue", "docname": issue_name},
        fields=["data", "creation", "owner"],
        order_by="creation desc"
    )
    for v in versions:
        data = frappe.parse_json(v.data)
        if data and "changed" in data:
            for change in data["changed"]:
                if change[0] == "status":
                    old_status, new_status = change[1], change[2]
                    user_fullname = frappe.utils.get_fullname(v.owner)
                    activity.append({
                        "type": "Status Change",
                        "title": f'Status Changed to "{new_status}"',
                        "description": f'Status updated from {old_status or "None"} to {new_status}.',
                        "timestamp": frappe.utils.format_datetime(v.creation, "medium"),
                        "by": user_fullname,
                        "color": "info",
                        "is_html": False
                    })

    # --- 4. Ticket Created Event ---
    issue = frappe.db.get_value(
        "Issue", issue_name, ["creation", "raised_by"], as_dict=True
    )
    if issue:
        user_fullname = frappe.utils.get_fullname(issue.raised_by)
        activity.append({
            "type": "Created",
            "title": "Ticket Created",
            "description": "Ticket submitted by user.",
            "timestamp": frappe.utils.format_datetime(issue.creation, "medium"),
            "by": user_fullname,
            "color": "danger",
            "is_html": False
        })

    # --- Sort All Activities by Date ---
    activity.sort(key=lambda x: frappe.utils.get_datetime(x["timestamp"]), reverse=True)
    return activity

import frappe
from frappe.utils import time_diff_in_seconds, format_duration


import frappe
from frappe.utils import format_datetime

@frappe.whitelist()
def get_first_responder(issue_name):
    # Step 1: Fetch all outgoing company email IDs (to skip)
    email_accounts = frappe.db.get_all(
        "Email Account",
        fields=["email_id"],
        filters={"enable_outgoing": 1}
    )
    skip_emails = [e["email_id"].strip().lower() for e in email_accounts if e.get("email_id")]

    # Step 2: Build SQL query safely
    query = """
        SELECT c.sender, c.sender_full_name, c.owner, c.creation
        FROM `tabCommunication` c
        WHERE c.reference_doctype = 'Issue'
          AND c.reference_name = %s
          AND c.sent_or_received = 'Sent'
          AND EXISTS (
                SELECT 1 FROM `tabUser` u
                WHERE u.name = c.owner
                AND u.enabled = 1
                AND u.user_type = 'System User'
            )
    """

    values = [issue_name]

    # Step 3: Exclude known company “from” addresses exactly
    if skip_emails:
        placeholders = ', '.join(['%s'] * len(skip_emails))
        query += f" AND LOWER(c.sender) NOT IN ({placeholders})"
        values.extend(skip_emails)

    query += " ORDER BY c.creation ASC LIMIT 1"

    # Step 4: Execute query
    comm = frappe.db.sql(query, tuple(values), as_dict=True)
    if not comm:
        return {"first_responded_by": ""}

    comm = comm[0]

    # Step 5: Resolve responder name
    responder = comm.sender_full_name or comm.sender or ""
    if not responder and comm.owner:
        user = frappe.db.get_value("User", comm.owner, ["full_name", "email"], as_dict=True)
        responder = user.full_name or user.email or comm.owner

    # Step 6: Return data
    return {
        "first_responded_by": responder
    }


import frappe

@frappe.whitelist()
def get_users_with_role(role):
    users = frappe.db.get_all(
        "Has Role",
        filters={"role": role, "parenttype": "User"},
        fields=["parent"]
    )
    user_ids = [u.parent for u in users]
    return frappe.db.get_all("User", filters={"name": ["in", user_ids]}, fields=["name", "full_name"])



@frappe.whitelist()
def get_users_with_role_query(doctype, txt, searchfield, start, page_len, filters):
    return frappe.db.sql("""
        SELECT name, full_name
        FROM `tabUser`
        WHERE name LIKE %(txt)s
        AND name IN (
            SELECT parent FROM `tabHas Role` WHERE role = 'Tech Support'
        )
        AND enabled = 1
        ORDER BY full_name ASC
        LIMIT %(start)s, %(page_len)s
    """, {
        "txt": f"%{txt}%",
        "start": start,
        "page_len": page_len
    })

import frappe
from frappe.utils import now_datetime

@frappe.whitelist()
def get_issue_notes(issue_name):
    """Return Issue child table custom_note (list)"""
    if not frappe.db.exists("Issue", issue_name):
        return {"notes": []}
    issue = frappe.get_doc("Issue", issue_name)
    # Convert to simple dict list
    notes = []
    for n in (issue.custom_note or []):
        notes.append({
            "idx": n.idx,
            "note": n.note,
            "timestamp": n.timestamp,
            "owner": n.owner,
            "created_by": n.created_by or n.owner,
            "custom_role": n.custom_role or ""
        })
    return {"notes": notes}


import frappe
from frappe.utils import now_datetime

@frappe.whitelist()
def add_issue_note(issue_name, note_text):
    """Add a note row to Issue.custom_note and return updated list"""
    if not frappe.db.exists("Issue", issue_name):
        frappe.throw("Issue not found")

    issue = frappe.get_doc("Issue", issue_name)
    user = frappe.session.user

    # 🟢 Fetch user full name and role profile
    user_doc = frappe.get_doc("User", user)
    full_name = user_doc.full_name or user
    role_profile = user_doc.role_profile_name or ""

    # Add the note with role profile instead of role
    issue.append("custom_note", {
        "note": note_text,
        "timestamp": now_datetime(),
        "owner": user,
        "created_by": full_name,
        "custom_role": role_profile,  # ✅ Use Role Profile name here
    })

    issue.save(ignore_permissions=True)
    frappe.db.commit()

    return get_issue_notes(issue_name)



@frappe.whitelist()
def update_issue_note(issue_name, idx, note_text):
    """Edit a note by idx"""
    if not frappe.db.exists("Issue", issue_name):
        frappe.throw("Issue not found")

    issue = frappe.get_doc("Issue", issue_name)
    found = False

    for n in issue.custom_note:
        if n.idx == int(idx):
            n.note = note_text
            found = True
            break

    if not found:
        frappe.throw("Note not found")

    issue.save(ignore_permissions=True)
    frappe.db.commit()

    return get_issue_notes(issue_name)


@frappe.whitelist()
def delete_issue_note(issue_name, idx):
    """Delete a note by idx"""
    if not frappe.db.exists("Issue", issue_name):
        frappe.throw("Issue not found")

    issue = frappe.get_doc("Issue", issue_name)
    issue.custom_note = [n for n in issue.custom_note if n.idx != int(idx)]

    issue.save(ignore_permissions=True)
    frappe.db.commit()

    return get_issue_notes(issue_name)

@frappe.whitelist()
def change_status(doctype, name, new_status):
    try:
        # Fetch the document
        doc = frappe.get_doc(doctype, name)
        
        # Update status
        doc.status = new_status
        doc.save(ignore_permissions=True)
        frappe.db.commit()

        # Return JSON-safe response
        return {"success": True, "message": f"Status changed to {new_status}"}
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Change Status Error")
        frappe.throw(f"Failed to update status: {str(e)}")

import frappe

@frappe.whitelist()
def get_issue_timer(issue_id):
    """Return the current working timer value for a given issue"""
    issue = frappe.get_doc("Issue", issue_id)

    # You can adjust these fields depending on your logic
    working_seconds = issue.get("working_seconds") or 0
    formatted_time = format_seconds_to_time(working_seconds)

    return {
        "formatted_time": formatted_time,
        "working_seconds": working_seconds
    }


def format_seconds_to_time(seconds):
    """Helper: format seconds into HH:MM:SS"""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


@frappe.whitelist()
def get_contact_emails(customer=None):
    """
    Fetch:
    1. Contact emails linked to a customer (if provided)
    2. All active system user emails in the company
    """

    emails = set()

    # 🟢 1. Get Contact emails linked to Customer
    if customer:
        linked_contacts = frappe.db.sql("""
            SELECT c.email_id
            FROM `tabContact` c
            JOIN `tabDynamic Link` dl ON dl.parent = c.name
            WHERE dl.link_doctype = 'Customer'
              AND dl.link_name = %s
              AND c.email_id IS NOT NULL
        """, (customer,), as_dict=True)
        emails.update([c.email_id for c in linked_contacts if c.email_id])

    else:
        # If no customer passed, get all contacts with email
        all_contacts = frappe.get_all("Contact", fields=["email_id"], filters={"email_id": ["!=", ""]})
        emails.update([c.email_id for c in all_contacts if c.email_id])

    # 🟢 2. Get Active System Users (excluding Guest / Administrator)
    system_users = frappe.get_all(
        "User",
        filters={
            "enabled": 1,
            "name": ["not in", ["Administrator", "Guest"]],
            "user_type":"System User",
            "email": ["!=", ""]
        },
        fields=["email"]
    )
    emails.update([u.email for u in system_users if u.email])

    # Convert to sorted list
    return sorted(list(emails))

@frappe.whitelist()
def get_closed_by_for_issue(issue_name):
	"""Return full name of the user who closed the given Issue."""
	if not issue_name:
		return {}

	closed_by = None

	# Try to get from Communication
	comm = frappe.db.get_value(
		"Communication",
		{
			"reference_doctype": "Issue",
			"reference_name": issue_name,
			"content": ["like", "%<p>Status: <b>Closed</b></p>%"]
		},
		["owner"],
		order_by="creation desc"
	)

	if comm:
		user_fullname = frappe.db.get_value("User", comm, "full_name")
		closed_by = user_fullname or comm

	# If still not found, fallback to Comment (System Log)
	if not closed_by:
		comment_owner = frappe.db.get_value(
			"Comment",
			{
				"reference_doctype": "Issue",
				"reference_name": issue_name,
				"content": ["like", "%Status changed to Closed%"]
			},
			["owner"],
			order_by="creation desc"
		)
		if comment_owner:
			user_fullname = frappe.db.get_value("User", comment_owner, "full_name")
			closed_by = user_fullname or comment_owner

	return {"closed_by": closed_by or ""}


@frappe.whitelist()
def add_custom_comment(docname, content):
    if not docname or not content:
        frappe.throw("Missing required fields")

    doc = frappe.get_doc("Issue", docname)
    doc.add_comment("Comment", content)
    frappe.db.commit()
    return {"message": "Comment added successfully"}


@frappe.whitelist()
def get_customer_sales_person(customer):
    """Return the first Sales Person from Customer > Sales Team child table"""
    if not customer:
        return ""

    sales_team = frappe.get_all(
        "Sales Team",
        filters={"parent": customer, "parenttype": "Customer"},
        fields=["sales_person"],
        order_by="idx asc",
        limit_page_length=1
    )

    if sales_team:
        return sales_team[0].get("sales_person", "")

    return ""

@frappe.whitelist()
def get_permitted_call_list(issue_name):
    """Return Call List docs that the current user can read or are shared with the user."""
    if not issue_name:
        return []

    current_user = frappe.session.user

    # Fetch all Call List docs under this issue
    docs = frappe.get_all(
        "Call List",
        filters={"issue_id": issue_name},
        fields=[
            "name", "name1", "subject", "status", "owner",
            "start_date", "start_timing", "end_date", "end_timing",
            "description"
        ],
        order_by="creation desc"
    )

    permitted = []

    # Pre-fetch all shared docs for efficiency
    shared_docs = frappe.share.get_shared("Call List", user=current_user) or []

    for d in docs:
        docname = d.name

        # 1. User has read permission on Call List
        has_perm = frappe.has_permission("Call List", "read", docname)

        # 2. Doc is shared with user
        is_shared = docname in shared_docs

        # 3. Doc is shared with everyone
        is_everyone = frappe.db.exists(
            "DocShare",
            {
                "share_doctype": "Call List",
                "share_name": docname,
                "everyone": 1,
                "read": 1
            }
        )

        # Decision: Allow if ANY of the three is true
        if has_perm or is_shared or is_everyone:
            permitted.append(d)

    return permitted



@frappe.whitelist()
def is_task_shared_with_user(task_name, user):
    """Returns True if the task is shared with the user or shared with everyone."""
    
    # Direct shared documents
    shared_docs = frappe.share.get_shared("Task", user=user) or []
    if task_name in shared_docs:
        return True

    # Everyone share
    everyone_shared = frappe.db.exists(
        "DocShare",
        {
            "share_doctype": "Task",
            "share_name": task_name,
            "everyone": 1,
            "read": 1
        }
    )
    if everyone_shared:
        return True

    return False


@frappe.whitelist()
def get_tasks_with_children(issue_name):
    if not issue_name:
        return []

    # Fetch all tasks under this issue
    tasks = frappe.db.get_all(
        "Task",
        filters={"issue": issue_name},
        fields=["name", "subject", "status", "priority", "description"],
        order_by="creation desc"
    )
    if not tasks:
        return []

    task_names = [t["name"] for t in tasks]

    # Fetch Task Users child table
    children = frappe.db.get_all(
        "Task Users",
        filters={"parent": ["in", task_names]},
        fields=["parent", "user", "idx"],
        order_by="parent, idx"
    )

    # Build child map
    child_map = {}
    for c in children:
        child_map.setdefault(c.parent, []).append({
            "user": c.user,
            "idx": c.idx
        })

    current_user = frappe.session.user

    permitted = []

    for task in tasks:
        name = task["name"]
        # --- Permission Logic ---
        # 1. Normal role permission
        has_perm = frappe.has_permission("Task", "read", name)
        # 2. Shared via DocShare
        is_shared = is_task_shared_with_user(name, current_user)
        # 3. Added in Task Users child table
        is_child_user = any(u["user"] == current_user for u in child_map.get(name, []))
        # FINAL PERMISSION DECISION
        if not (has_perm or is_shared or is_child_user):
            # user CANNOT see this task
            continue
        # Add child users to the task data
        task["custom_users"] = child_map.get(name, [])
        permitted.append(task)

    return permitted