import frappe
from frappe import _

@frappe.whitelist()
def fetch_image(doctype, docname, fieldname):
    # Fetch the image data from the linked document
    image_data = frappe.db.get_value(doctype, docname, fieldname)

    return image_data
