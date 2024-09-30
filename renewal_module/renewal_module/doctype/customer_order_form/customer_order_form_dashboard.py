from frappe import _

def get_data():
        return {
                "fieldname": "quotation_id",
                "internal_links": {
                        "Supplier Quotation": ["items", "supplier_quotation"],
                        
		 },
                "transactions": [
                        {"label": _("Reference"), "items": [ "Supplier Quotation"]}
                ],
        }
