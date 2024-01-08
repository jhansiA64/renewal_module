// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Calls Analytics"] = {
	"filters": [
		{
			"fieldname":"company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"reqd": 1
		},
		// {
		// 	"fieldname":"filter_based_on",
		// 	"label": __("Filter Based On"),
		// 	"fieldtype": "Select",
		// 	"options": ["Fiscal Year", "Date Range"],
		// 	"default": ["Fiscal Year"],
		// 	"reqd": 1,
		// 	on_change: function() {
		// 		let filter_based_on = frappe.query_report.get_filter_value('filter_based_on');
		// 		frappe.query_report.toggle_filter_display('from_fiscal_year', filter_based_on === 'Date Range');
		// 		frappe.query_report.toggle_filter_display('to_fiscal_year', filter_based_on === 'Date Range');
		// 		frappe.query_report.toggle_filter_display('period_start_date', filter_based_on === 'Fiscal Year');
		// 		frappe.query_report.toggle_filter_display('period_end_date', filter_based_on === 'Fiscal Year');

		// 		frappe.query_report.refresh();
		// 	}
		// },
		// {
		// 	"fieldname":"period_start_date",
		// 	"label": __("Start Date"),
		// 	"fieldtype": "Date",
		// 	"reqd": 1,
		// 	"default":erpnext.utils.get_fiscal_year(frappe.datetime.get_today("year_start_date")),
		// 	"depends_on": "eval:doc.filter_based_on == 'Date Range'"
		// },
		// {
		// 	"fieldname":"period_end_date",
		// 	"label": __("End Date"),
		// 	"fieldtype": "Date",
		// 	"reqd": 1,
		// 	"depends_on": "eval:doc.filter_based_on == 'Date Range'"
		// },
		// {
		// 	"fieldname":"from_fiscal_year",
		// 	"label": __("Start Year"),
		// 	"fieldtype": "Link",
		// 	"options": "Fiscal Year",
		// 	"reqd": 1,
		// 	"default":erpnext.utils.get_fiscal_year(frappe.datetime.get_today()),
		// 	"depends_on": "eval:doc.filter_based_on == 'Fiscal Year'"
		// },
		
		// {
		// 	"fieldname":"to_fiscal_year",
		// 	"label": __("End Year"),
		// 	"fieldtype": "Link",
		// 	"options": "Fiscal Year",
		// 	"reqd": 1,
		// 	"default":erpnext.utils.get_fiscal_year(frappe.datetime.get_today()),
		// 	"depends_on": "eval:doc.filter_based_on == 'Fiscal Year'"
		// },
		// {
		// 	"fieldname": "periodicity",
		// 	"label": __("Periodicity"),
		// 	"fieldtype": "Select",
		// 	"options": [
		// 		{ "value": "Monthly", "label": __("Monthly") },
		// 		{ "value": "Quarterly", "label": __("Quarterly") },
		// 		{ "value": "Half-Yearly", "label": __("Half-Yearly") },
		// 		{ "value": "Yearly", "label": __("Yearly") }
		// 	],
		// 	"default": "Yearly",
		// 	"reqd": 1
		// },
		{
			fieldname: "timespan",
			label: __("Timespan"),
			fieldtype: "Select",
			options: [
				{ "value": "last 6 months", "label": __("Last 6 Months") },
				{ "value": "last quarter", "label": __("Last Quarter") },
				{ "value": "last month", "label": __("Last Month") },
				{ "value": "last week", "label": __("Last Week") },
				{ "value": "this week", "label": __("This Week") },
				{ "value": "this month", "label": __("This Month") },
				{ "value": "this quarter", "label": __("This Quarter") },
				{ "value": "this year", "label": __("This Year") },
				{ "value": "next week", "label": __("Next Week") },
				{ "value": "next month", "label": __("Next Month") },
				{ "value": "next quarter", "label": __("Next Quarter") },
				{ "value": "next 6 months", "label": __("Next 6 Months") },
				{ "value": "custom", "label": __("Custom") },
			],
			default: "this month",
			reqd: 1
		},
		{
			"fieldname":"from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_days(frappe.datetime.get_today(), -7),
			"depends_on": "eval:doc.timespan == 'custom'",
			"reqd": 1
		},
		{
			"fieldname":"to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"depends_on": "eval:doc.timespan == 'custom'",
			"reqd": 1
		},
		// {
		// 	fieldname: "target_on",
		// 	label: __("Target On"),
		// 	fieldtype: "Select",
		// 	options: "Customer\nContact",
		// 	default: "Customer"
		// },

		{
			"fieldname":"status",
			"label": __("Status"),
			"fieldtype": "MultiSelectList",
			get_data: function() {
				return [
					{ "value": "Held", "description": "Status" },
					{ "value": "Scheduled", "description": "Status" },
					{ "value": "Cancelled", "description": "Status" }
					
				]
			},
		},
		
		
		{
			"fieldname":"name1",
			"label": __("Party"),
			"fieldtype": "MultiSelectList",
			"options": "Customer",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Customer', txt);
			},	 

		},
		{
			"fieldname":"sales_person",
			"label": __("Sales Person"),
			"fieldtype": "MultiSelectList",
	       	"options": "Sales Person",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Sales Person', txt);
			},
		},

	]
};
