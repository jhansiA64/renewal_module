from itertools import groupby

import frappe
from frappe import _
from frappe.utils import cint, flt, formatdate


from dateutil import relativedelta
from renewal_module.renewal_module.report.sales_data_based_on_invoice.sales_data_based_on_invoice import (
	get_data,
)
from renewal_module.renewal_module.report.sales_based_on_timespan.test_timespan import add_to_date, get_timespan_date_range
from erpnext.accounts.utils import get_fiscal_year

from erpnext.accounts.report.utils import convert
from renewal_module.custom_module.report.target_details___invoice.target_details___invoice import (
    get_target_data, get_columns)


@frappe.whitelist()
def get_target_data1(sales_person=None):
    filters_data = {
    "company": "64 Network Security Pvt Ltd - TG",
    "from_date": "2025-02-28",
    "timespan": "this year",
    "to_date": "2025-03-07"
    }
    if sales_person == "":
        pass
    else:
        filters_data["sales_person"] = [sales_person]
    columns = get_columns(filters_data)	
    sales_data = get_data(filters_data)
    # frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(sales_data)))
    data = get_target_data(filters_data, sales_data)
    months = []
    amounts = [] 
    counts = []
    sum =0.0
    frappe.msgprint("<pre>{}</pre>".format(frappe.as_json(data)))
    if data:
        for i in data:
            months.append(i.month[:3])
            amounts.append(flt(i.get("amount")))
            counts.append(i.qty)

    return {"months": months, "amounts": amounts, "counts": counts}



