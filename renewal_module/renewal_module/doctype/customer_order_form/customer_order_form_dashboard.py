from frappe import _

def get_data():
        return {
                "fieldname": "quotation_id",
                "internal_links": {
                        "Supplier Quotation": ["items", "supplier_quotation"],
                        "ORC List": ["items", "orc_id"]
                        
		 },
                "transactions": [
                        {"label": _("Reference"), "items": [ "Supplier Quotation","ORC List"]}
                ],
        }
