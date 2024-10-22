

from frappe import _

def get_data():
        return {
                "fieldname": "quotation_id",
                "internal_links": {
                        "Supplier Quotation": ["items", "supplier_quotation"],
                        "ORC List":["items","orc_id"]
		 },
                "transactions": [
                        {"label": _("Reference"), "items": ["Supplier Quotation", "ORC List"]},
                        # {"label": _("Reference"), "items": ["ORC List"]}
                        #  {
                        # "label": _("Reference"),
                        # "items": [
                        #         {"link": "Supplier Quotation", "internal": "items.supplier_quotation"},
                        #         {"link": "ORC List", "internal": "items.orc_id"}
                        # ]
                        # }
                ],
        }

