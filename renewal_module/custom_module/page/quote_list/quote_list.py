import frappe

@frappe.whitelist()
def get_crm_notes(parent, parenttype):
    return frappe.get_all(
        "CRM Note",
        filters={"parent": parent, "parenttype": parenttype},
        fields=["name", "note", "added_by", "added_on"],
        order_by="added_on desc",
    )