# from flask import Flask, render_template, request
# import frappe

# app = Flask(__name__)

# @app.route('/sender')
# def sender():
#     dynamic_data = "Hello from Sender"
#     return render_template('sender.html', dynamic_data=dynamic_data)

# @app.route('/receiver')
# def receiver():
#     frappe.msgprint("hello world")
#     parameter_value = request.args.get('parameter')
#     dynamic_data = "Hello from Receiver"
#     # return render_template('receiver.html', dynamic_data=parameter_value)
#     return f'The parameter value is: {parameter_value}'

# if __name__ == '__main__':
#     app.run(debug=True)

import frappe

@frappe.whitelist(allow_guest=True)
def send_contact_email(name, email,phone, subject, message):
    subject = "New Contact Us Form Submission"
    content = f"""
    <p>You have received a new message from your website contact form.</p>
    <p><strong>Name:</strong> {name}</p>
    <p><strong>Email:</strong> {email}</p>
    <p><strong>Message:</strong></p>
    <p>{message}</p>
    """
    recipients = ['jhansi.a@64network.com']  # Replace with your email address

    try:
        # Send email
        frappe.sendmail(
            recipients=recipients,
            subject=subject,
            message=content
        )
        return 'success'
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), 'Contact Form Error')
        return 'error'
