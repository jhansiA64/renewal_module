

from frappe import _

def get_data():
        return {
                "fieldname": "invoice_no",
                "internal_links": {
                        "Sales Invoice": ["items", "invoice_no"]
		 },
                "transactions": [
                        {"label": _("Reference"), "items": ["Sales Invoice"]}
                ],
        }

