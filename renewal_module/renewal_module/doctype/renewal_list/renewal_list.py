# Copyright (c) 2022, Aravind Mandala and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class RenewalList(Document):
	pass

import frappe
from frappe import _

# @frappe.whitelist()
# def get_plan_summary(renewal_name):
#     if not renewal_name:
#         return "<p>No data available.</p>"
#     # Replace with actual logic or DB calls
#     # Simulated data
#     plans = [
#         {"plan": "Gold", "tickets": 6, "used": 2, "available": 4}
#     ]

#     # Build HTML table
#     html = """
#     <table class="table table-bordered">
#         <thead>
#             <tr>
#                 <th>Plan</th>
#                 <th>Tickets</th>
#                 <th>Used</th>
#                 <th>Available</th>
#             </tr>
#         </thead>
#         <tbody>
#     """

#     for p in plans:
#         html += f"""
#         <tr>
#             <td>{p['plan']}</td>
#             <td>{p['tickets']}</td>
#             <td>{p['used']}</td>
#             <td>{p['available']}</td>
#         </tr>
#         """

#     html += "</tbody></table>"
#     return html


# @frappe.whitelist()
# def get_renewal_dashboard_data(customer_name=None):
#     data = [
#         {"plan": "Gold", "tickets": 6, "used": 2, "available": 4}
#     ]
#     html = frappe.render_template("renewal_module/renewal_module/doctype/renewal_list/renewal_list_dashboard.html", {
#         "data": data
#     })
#     return {"html": html}

@frappe.whitelist()
def get_renewal_dashboard_data(renewal_name=None):
    if not renewal_name:
        return {"html": "<p>No Renewal List selected.</p>"}
    # Fetch the SLA fields from the current Renewal List
    renewal_doc = frappe.get_doc("Renewal List", renewal_name)
    issues_doc=frappe.db.sql("""SELECT 
            Count(ri.parent) AS renewal_id,
            ri.item_code AS renewal_item,
            ar.renewal_id AS issue_renewal_id,
            ar.item AS issues_item
        FROM `tabRenewal Item` AS ri
        inner JOIN `tabActive Renewals` AS ar 
            ON ar.renewal_id = ri.parent AND ar.item = ri.item_name
        where ri.parent=%s
    """,(renewal_name,),as_dict=True)
    used_tickets=issues_doc[0].renewal_id or 0
    tickets= int(renewal_doc.tickets or 0)
    available_ticket= tickets - used_tickets
    data = []
    if renewal_doc.sla_type and renewal_doc.tickets:
        data.append({
            "plan": renewal_doc.sla_type,
            "product": renewal_doc.sla_product or "",
            "tickets": renewal_doc.tickets,
            "used":used_tickets or 0,
            "available": available_ticket or 0
        })
    #frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    html = frappe.render_template("renewal_module/renewal_module/doctype/renewal_list/renewal_list_dashboard.html", {
        "data": data
    })
    return {"html": html}
