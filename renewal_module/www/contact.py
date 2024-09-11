import frappe
from frappe import _

@frappe.whitelist(allow_guest=True)
def handle_contact_form():
    frappe.log("Request method: " + frappe.local.request.method)
    frappe.log("Request headers: " + str(frappe.local.request.headers))

    if frappe.local.request.method != "POST":
        frappe.log_error("Invalid Request Method")
        frappe.throw(_("Invalid Request Method"), frappe.MethodNotAllowedError)

    data = frappe.local.form_dict
    frappe.log("Received form data: " + str(data))

    required_fields = ['name', 'email', 'phone_no', 'subject', 'message', 'service_name'] 
    for field in required_fields:
        if not data.get(field):
            frappe.log_error(f"Missing field: {field}")
            frappe.throw(_(f"{field.capitalize()} is required"))

    name = data.get('name')
    email = data.get('email')
    phone_no = data.get('phone_no')
    service_name = data.get('service_name')
    message = data.get('message')
    subject = data.get('subject') or "New Contact Form Submission"

    message_body = f"""
        <p><b>Name:</b> {name}</p>
        <p><b>Email:</b> {email}</p>
        <p><b>Phone Number:</b> {phone_no}</p>
        <p><b>Service:</b> {service_name}</p>
        <p><b>Message:</b> {message}</p>
    """

    recipient_email = "jhansi.a@64network.com"
    sender_email = frappe.session.user if frappe.session.user != "Guest" else email

    try:
        frappe.sendmail(
            recipients=[recipient_email],
            sender=sender_email,
            subject=subject,
            message=message_body
        )
        frappe.msgprint(_("Form submitted successfully! Email sent"))

    except Exception as e:
        frappe.log_error(f"Failed to send email: {str(e)}")
        frappe.throw(_("There was an issue sending the email. Please try again later."))

    frappe.local.response.update({
        "status": "success",
        "message": "Form submitted successfully! Email sent."
    })
