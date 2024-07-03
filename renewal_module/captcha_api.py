# In your ERPNext app, create a file named captcha_api.py in the appropriate directory

import frappe
from captcha import generate_captcha

@frappe.whitelist(allow_guest=True)
def get_captcha():
    # Generate and return captcha image
    captcha_image = generate_captcha()
    return captcha_image

@frappe.whitelist(allow_guest=True)
def verify_captcha(captcha_text):
    # Verify captcha text against session
    session = get_session()
    if session.captcha_text and captcha_text.upper() == session.captcha_text:
        # Correct captcha text
        session.captcha_text = None  # Clear captcha text from session
        session.save()
        return True
    else:
        # Incorrect captcha text
        return False
