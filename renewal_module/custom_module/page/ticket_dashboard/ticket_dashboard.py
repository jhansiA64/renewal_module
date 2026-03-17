import frappe

@frappe.whitelist()
def get_data():
    return {"status": "ok"}
