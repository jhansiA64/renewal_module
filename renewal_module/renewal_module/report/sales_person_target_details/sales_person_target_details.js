// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Sales Person Target-details"] = {
	"filters": [
		{
			fieldname:"company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company")
		},
		
		{
			fieldname: "doctype",
			label: __("Document Type"),
			fieldtype: "Select",
			options: "Sales Order",
			default: "Sales Order"
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: "01-04-2023",
			reqd: 1
		},
		{
			"fieldname":"to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": "31-03-2023",
			"reqd": 1
		},
		{
			fieldname: "time_span",
			label: __("Timespan"),
			fieldtype: "Select",
			options: [
				{ "value": "this month", "label": __("This Month") },
				{ "value": "last month", "label": __("Last Month") },
			],
			default: "this month",
			reqd: 1
		},
		
		
		{
			fieldname: "fiscal_year",
			label: __("Fiscal Year"),
			fieldtype: "Link",
			options: "Fiscal Year",
			"default":"2023-2024"
					
		},
		

	]
};
