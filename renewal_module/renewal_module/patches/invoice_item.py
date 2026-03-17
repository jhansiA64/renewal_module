import frappe

def execute():
    # Rename the field without losing data
    import frappe
    frappe.rename_field("Sales Invoice Item", "newadd", "renewal_status")
    frappe.db.commit()