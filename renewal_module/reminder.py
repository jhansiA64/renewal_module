import frappe
from frappe.utils import now_datetime, add_to_date

def send_reminders():
    now = now_datetime()

    reminders = frappe.db.sql("""
        SELECT name, customer_name, custom_start_date, custom_start_time, customer_email
        FROM `tabAppointment`
        WHERE CONCAT(start_date, ' ', start_time) BETWEEN %s AND %s
    """, (now, add_to_date(now, minutes=5)), as_dict=True)

    for r in reminders:
        frappe.publish_realtime("reminder_alert", {
            "title": "Upcoming Reminder",
            "message": f"{r.subject} at {r.custom_start_time}"
        }, user="Administrator")
    
        # Build the message body
        message = f"""
            <p>Dear {r.name},</p>
            <p>This is a reminder for your appointment <b>{r.customer_email}</b>
            scheduled at <b>{r.custom_start_time}</b> on <b>{r.custom_start_date}</b>.</p>
            <p>Thank you.</p>
        """

        # Send email in your required format
        frappe.sendmail(
            recipients=[r.customer_email],
            subject=f"Appointment Reminder: {r.name}",
            message=message,
            reference_doctype="Appointment",
            reference_name=r.name
        )
        print(f"Email sent to customer: {r.customer_email}")    






# your_app/api.py
# your_app/api.py
# import frappe
# from frappe.utils import now_datetime, add_minutes

# def get_user_email(user):
#     """Return email from User or return directly if already an email"""
#     if not user:
#         return None
#     user = user.strip()
#     if "@" in user:
#         return user
#     return frappe.db.get_value("User", user, "email")

# def check_due_appointments():
#     frappe.log_error("Scheduler ran!", "Appointment Reminder")
#     now = now_datetime()
#     reminder_time = add_minutes(now, 5)  # send reminders 5 mins before start

#     # Fetch appointments starting at reminder_time
#     due_appointments = frappe.get_all(
#         "Appointment",
#         filters={
#             "custom_start_date": reminder_time.date(),
#             "custom_start_time": reminder_time.time()
#         },
#         fields=[
#             "name",
#             "custom_start_date",
#             "custom_start_time",
#             "email",
#             "participants"
#         ]
#     )

#     for appt in due_appointments:
#         message = (
#             f"Reminder: Appointment scheduled on {appt.custom_start_date} "
#             f"at {appt.custom_start_time}"
#         )

#         # 🔹 Handle participants (MultiSelect users → comma separated)
#         users = appt.participants.split(",") if appt.participants else []

#         for user in users:
#             user = user.strip()
#             if not user:
#                 continue

#             # Popup in ERPNext if online
#             frappe.publish_realtime(
#                 event="popup_notification",
#                 message=message,
#                 user=user
#             )

#             # Email
#             recipient = get_user_email(user)
#             if recipient:
#                 frappe.enqueue(
#                     frappe.sendmail,
#                     queue="short",
#                     timeout=300,
#                     is_async=True,
#                     recipients=[recipient],
#                     subject="Appointment Reminder",
#                     message=message
#                 )

#         # 🔹 Also send to customer email (if given)
#         if appt.email:
#             frappe.enqueue(
#                 frappe.sendmail,
#                 queue="short",
#                 timeout=300,
#                 is_async=True,
#                 recipients=[appt.email],
#                 subject="Appointment Reminder",
#                 message=message
#             )




import frappe
from frappe.utils import now_datetime, get_datetime
from datetime import timedelta

def check_due_appointments():
    now = now_datetime()
    start = now + timedelta(minutes=5)
    end = now + timedelta(minutes=16)  # small buffer window

    appointments = frappe.get_all(
        "Appointment",
        filters={
            "custom_start_date": start.date(),
            
        },
        fields=["name", "customer_email", "custom_start_date", "custom_start_time"]
    )
    # print(appointments)

    for appt in appointments:
        print("apt")
        appt_time = get_datetime(f"{appt.custom_start_date} {appt.custom_start_time}")
        print(appt_time)
        print(start)
        print(end)

        if start <= appt_time <= end:
            recipients = []
            print("recipients")

            # 1. Add main customer email
            if appt.customer_email:
                print("customer_email")
                recipients.append(appt.customer_email)

            # 2. Fetch child participants from Multiselect Users table
            child_participants = frappe.get_all(
                "Multiselect Users",
                filters={"parent": appt.name},
                fields=["user"]
            )
            print(child_participants)

            recipients.extend([p.user for p in child_participants])

            # 3. Send reminder
            if recipients:
                print(" send mail")
                frappe.sendmail(
                    recipients=recipients,
                    subject=f"Reminder: Appointment {appt.name}",
                    message=f"Your appointment is scheduled at {appt.custom_start_date} {appt.custom_start_time}"
                )
                print("success")
                frappe.db.commit()
                print(f"✅ Reminder queued for {appt.name} → {recipients}")
