# import frappe
# from frappe.utils import get_datetime, now_datetime, add_to_date
import logging
import frappe
from frappe.utils import get_datetime, now_datetime, add_to_date
from datetime import date, timedelta

logger = logging.getLogger(__name__)

def get_participant_contacts(participants):
    """Return two lists: (emails[], users[]) from custom_participants (Table Multiselect Users)."""
    emails, users = [], []
    logger.debug("[reminder] resolving participants (Table Multiselect Users): %s", participants)

    for p in (participants or []):
        try:
            # Each row should have a `user` field (Link to User)
            if not getattr(p, "user", None):
                logger.debug("[reminder] skipping participant, missing user: %s", p)
                continue

            user_id = p.user
            users.append(user_id)

            # Get email from User doctype
            user_doc = frappe.get_doc("User", user_id)
            if getattr(user_doc, "email", None):
                emails.append(user_doc.email)

        except Exception as e:
            frappe.log_error(
                message=f"Error resolving participant {p}: {e}",
                title="Participant lookup error"
            )
            logger.exception("[reminder] participant lookup failed for %s", p)

    # Deduplicate while preserving order
    emails = list(dict.fromkeys(emails))
    users = list(dict.fromkeys(users))
    logger.debug("[reminder] resolved emails=%s users=%s", emails, users)

    return emails, users

def appointment_after_insert(doc, method=None):
    """Called from hooks after an Appointment is inserted."""
    try:
        logger.info("[reminder] appointment_after_insert called for %s", getattr(doc, "name", "[no-name]"))
        send_appointment_notifications(doc, reminder=False)
    except Exception as e:
        frappe.log_error(message=f"Failed to send immediate notifications for {doc.name}: {e}",
                         title="Appointment Notification Error")
        logger.exception("[reminder] immediate notification failed for %s", getattr(doc, "name", None))

def appointment_on_update(doc, method=None):
    """When Appointment is updated, detect newly added participants and notify them."""
    try:
        logger.info("[reminder] appointment_on_update called for %s", doc.name)

        # Get old version of the document
        old_doc = doc.get_doc_before_save()
        if not old_doc:
            logger.debug("[reminder] no old_doc found for %s (maybe insert?)", doc.name)
            return

        # Extract participants (user ids) before & after
        old_users = {p.user for p in (old_doc.custom_participants or []) if getattr(p, "user", None)}
        new_users = {p.user for p in (doc.custom_participants or []) if getattr(p, "user", None)}

        # Find newly added participants
        added_users = new_users - old_users
        if not added_users:
            logger.debug("[reminder] no new participants in %s", doc.name)
            return

        logger.info("[reminder] new participants for %s: %s", doc.name, added_users)

        # Convert user ids into email + user list
        new_participants = [frappe._dict({"user": u}) for u in added_users]
        emails, users = get_participant_contacts(new_participants)

        subject = "You have been added to an Appointment"
        message = f"""
        <p>Dear Participant,</p>
        <p>You have been <b>added</b> to the following appointment:</p>
        <ul>
          <li><b>Subject:</b> {doc.customer_details or 'N/A'}</li>
          <li><b>Start:</b> {doc.custom_start_date or ''} {doc.custom_start_time or ''}</li>
          <li><b>End:</b> {doc.custom_end_date or ''} {doc.custom_end_time or ''}</li>
          <li><b>Reference:</b> <a href="/app/Appointment/{doc.name}">{doc.name}</a></li>
        </ul>
        """

        # Send emails only to new participants
        if emails:
            frappe.sendmail(
                recipients=emails,
                subject=subject,
                message=message,
                reference_doctype=doc.doctype,
                reference_name=doc.name
            )
            logger.info("[reminder] new participant emails sent for %s to %s", doc.name, emails)

        # Create Notification Logs
        for user in users:
            create_system_notification(user, doc, subject, message)
            logger.info("[reminder] notification log created for NEW user=%s appointment=%s", user, doc.name)

    except Exception as e:
        frappe.log_error(
            message=f"Failed to send notifications for new participants in {doc.name}: {e}",
            title="Appointment Update Notification Error"
        )
        logger.exception("[reminder] appointment_on_update failed for %s", doc.name)


def send_appointment_notifications(doc, reminder=False):
    """Send email + create Notification Log entries (bell) for participants.
       Accepts doc object or docname string.
    """
    if isinstance(doc, str):
        doc = frappe.get_doc("Appointment", doc)

    if reminder:
        subject = f"Reminder: Upcoming Appointment at {doc.custom_start_time or ''}"
        message = f"""
        <p>Dear Participant,</p>
        <p>This is a <b>reminder</b> that you have an appointment starting soon:</p>
        <ul>
          <li><b>Subject:</b> {doc.customer_details or ''}</li>
          <li><b>Start:</b> {doc.custom_start_date or ''} {doc.custom_start_time or ''}</li>
          <li><b>End:</b> {doc.custom_end_date or ''} {doc.custom_end_time or ''}</li>
          <li><b>Reference:</b> <a href="/app/Appointment/{doc.name}">{doc.name}</a></li>
        </ul>
        <p>Please make sure you are prepared.</p>
        """
    else:
        subject = "Appointment Scheduled"
        message = f"""
        <p>Dear Participant,</p>
        <p>A new appointment has been scheduled for you:</p>
        <ul>
          <li><b>Subject:</b> {doc.customer_details or 'N/A'}</li>
          <li><b>Start:</b> {doc.custom_start_date or ''} {doc.custom_start_time or ''}</li>
          <li><b>End:</b> {doc.custom_end_date or ''} {doc.custom_end_time or ''}</li>
          <li><b>Reference:</b> <a href="/app/Appointment/{doc.name}">{doc.name}</a></li>
        </ul>
        <p>You will receive a reminder 10 minutes before the start.</p>
        """

    logger.info("[reminder] send_appointment_notifications for %s (reminder=%s)", doc.name, reminder)

    try:
        emails, users = get_participant_contacts(doc.custom_participants)
    except Exception as e:
        emails, users = [], []
        frappe.log_error(message=f"Failed to resolve participants for {doc.name}: {e}",
                         title="Appointment participants resolution error")
        logger.exception("[reminder] failed to get participant contacts for %s", doc.name)

    logger.debug("[reminder] emails=%s users=%s for %s", emails, users, doc.name)

    # send emails
    if emails:
        try:
            frappe.sendmail(
                recipients=emails,
                subject=subject,
                message=message,
                reference_doctype=doc.doctype,
                reference_name=doc.name
            )
            logger.info("[reminder] emails sent for %s to %s", doc.name, emails)
        except Exception as e:
            frappe.log_error(message=f"Failed to send appointment emails for {doc.name}: {e}",
                             title="Appointment send email error")
            logger.exception("[reminder] sending emails failed for %s", doc.name)
    else:
        logger.info("[reminder] no emails found for %s", doc.name)

    # create Notification Log entries
    if users:
        for user in users:
            try:
                create_system_notification(user, doc, subject, message)
                logger.info("[reminder] notification log created for user=%s appointment=%s", user, doc.name)
            except Exception as e:
                frappe.log_error(message=f"Failed to create Notification Log for {user} and {doc.name}: {e}",
                                 title="Appointment Notification Log Error")
                logger.exception("[reminder] create_system_notification failed for %s", user)
    else:
        logger.info("[reminder] no users found to create Notification Log for %s", doc.name)

def create_system_notification(user, doc, subject, message):
    """Create Notification Log entry so it appears in the bell icon."""
    notif = frappe.get_doc({
        "doctype": "Notification Log",
        "subject": subject,
        "email_content": message,
        "for_user": user,
        "type": "Alert",
        "document_type": doc.doctype,
        "document_name": doc.name
    })

    notif.insert(ignore_permissions=True)
    
    logger.debug("[reminder] inserted Notification Log for %s %s", user, doc.name)



def check_and_send_reminders():
    logger = frappe.logger("appointment_notifications")
    """Run every minute. Send reminders for appointments starting within the next 10 minutes."""
    try:
        now = now_datetime()
        in_10 = add_to_date(now, minutes=10, as_datetime=True)
        logger.info("[reminder] running check_and_send_reminders. now=%s in_10=%s", now, in_10)

        # Fetch open appointments
        appointments = frappe.get_all(
            "Appointment",
            filters={"status": "Open"},
            fields=["name", "custom_start_date", "custom_start_time", "custom_reminder_sent"]
        )
        logger.info("[reminder] total candidate appointments fetched: %s", len(appointments))

        for appt in appointments:
            try:
                name = appt.name
                start_date = appt.custom_start_date
                start_time = appt.custom_start_time
                reminder_sent = frappe.utils.cint(appt.custom_reminder_sent)

                if not (start_date and start_time):
                    logger.debug("[reminder] skipping %s because start_date or start_time missing", name)
                    continue

                # --- normalize start_date ---
                if isinstance(start_date, date):
                    start_date = start_date.strftime("%Y-%m-%d")

                # --- normalize start_time (Frappe often stores as timedelta) ---
                if isinstance(start_time, timedelta):
                    total_seconds = int(start_time.total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    start_time = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

                # build full datetime
                start_dt = get_datetime(f"{start_date} {start_time}")
                logger.debug("[reminder] computed start_dt=%s for %s", start_dt, name)

                # check if appointment is within the next 10 mins and reminder not sent
                if now <= start_dt <= in_10 and not reminder_sent:
                    logger.info("[reminder] sending reminder for %s start_dt=%s", name, start_dt)
                    from renewal_module.appointment_notifications import send_appointment_notifications
                    send_appointment_notifications(name, reminder=True)

                    frappe.db.set_value("Appointment", name, "custom_reminder_sent", 1)
                    logger.info("[reminder] reminder flag set for %s", name)
                else:
                    logger.debug("[reminder] not sending for %s (start_dt=%s, now=%s, in_10=%s, reminder_sent=%s)",
                                 name, start_dt, now, in_10, reminder_sent)

            except Exception as e:
                frappe.log_error(
                    message=f"Error processing appointment {appt}: {e}",
                    title="Appointment reminder loop error"
                )
                logger.exception("[reminder] per-appointment processing error for %s", appt)

        # commit once at the end
        frappe.db.commit()

    except Exception as e:
        frappe.log_error(
            message=f"check_and_send_reminders failed: {e}",
            title="Appointment reminder scheduler error"
        )
        logger.exception("[reminder] check_and_send_reminders failed")

