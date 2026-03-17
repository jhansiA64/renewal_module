// Copyright (c) 2025, Aravind Mandala and contributors
// For license information, please see license.txt

frappe.query_reports["Employee Asset Allocation"] = {
	"filters": [
		{
            "fieldname": "employee",
            "label": __("Employee"),
            "fieldtype": "Link",
            "options": "Employee",
            "width": "200px"
        },
        {
            "fieldname": "status",
            "label": __("Asset Status"),
            "fieldtype": "Select",
            "options": "\nAssigned\nReturned\nAvailable",
            "width": "150px"
        },
        {
            "fieldname": "asset",
            "label": __("Asset"),
            "fieldtype": "Link",
            "options": "Company Asset",
            "width": "200px",
            
        },
        {
            "fieldname": "issue_date",
            "label": __("From Issue Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            "width": "150px"
        },
        {
            "fieldname": "to_date",
            "label": __("To Issue Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "width": "150px"
        }

	]
};
