// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Target Details"] = {
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
			options: "Sales Order\nOpportunity",
			default: "Opportunity"
		},
		{
			fieldname: "period",
			label: __("Period"),
			fieldtype: "Select",
			options: [
				{ "value": "Monthly", "label": __("Monthly") },
				{ "value": "Quarterly", "label": __("Quarterly") },
				{ "value": "Half-Yearly", "label": __("Half-Yearly") },
				{ "value": "Yearly", "label": __("Yearly") }
			],
			default: "Monthly"
		},
		{
			fieldname: "target_on",
			label: __("Target On"),
			fieldtype: "Select",
			options: "Quantity\nAmount",
			default: "Quantity"
		},
		{
			fieldname: "fiscal_year",
			label: __("Fiscal Year"),
			fieldtype: "Link",
			options: "Fiscal Year",
			default: "2023-2024"
					
		},

	]
};
