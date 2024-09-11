// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

// frappe.query_reports["Renewals Report"] = {
// 	"filters": [

// 	]
// };

frappe.query_reports["Renewals Report"] = {
	"filters": [
           {
			"fieldname":"company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"reqd": 1
		},
		{
			fieldname: "timespan",
			label: __("Timespan"),
			fieldtype: "Select",
			options: [
				{ "value": "last year", "label": __("Last Year") },
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
			default: frappe.defaults.get_user_default("year_start_date"),
			"depends_on": "eval:doc.timespan == 'custom'",
			reqd: 1,
		},
		{
			"fieldname":"to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.defaults.get_user_default("year_end_date"),
			"depends_on": "eval:doc.timespan == 'custom'",
			"reqd": 1
		},
		{
			"fieldname":"customer",
			"label": __("Customer"),
			"fieldtype": "MultiSelectList",
			"options": "Customer",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Customer', txt);
			},	 

		},
		{
			"fieldname":"renewal_list",
			"label": __("Renewal List"),
			"fieldtype": "MultiSelectList",
			"options": "Renewal List",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Renewal List', txt);
			},	 

		},
		
		// {
		// 	"fieldname":"from_date",
		// 	"label": __("From Date"),
		// 	"fieldtype": "Date",
		// 	"default": frappe.datetime.add_days(frappe.datetime.get_today(), -7),
		// 	"reqd": 1
		// },
		// {
		// 	"fieldname":"to_date",
		// 	"label": __("To Date"),
		// 	"fieldtype": "Date",
		// 	"default": frappe.datetime.get_today(),
		// 	"reqd": 1
		// },
				
		// {
		// 	"fieldname":"renewal_id",
		// 	"label": __("Renewal ID"),
		// 	"fieldtype": "Link",
		// 	"options": "Renewal List"
		// },
		
		// {
		// 	"fieldname":"customer",
		// 	"label": __("Customer"),
		// 	"fieldtype": "MultiSelectList",
		// 	"options": "Customer",
        //                 get_data: function(txt) {
		// 		return frappe.db.get_link_options('Customer', txt);
		// 	},	 

		// },
		{
			"fieldname":"sales_person",
			"label": __("Sales Person"),
			"fieldtype": "MultiSelectList",
	       	"options": "Sales Person",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Sales Person', txt);
			},
		},
		{
			"fieldname":"status",
			"label": __("Status"),
			"fieldtype": "MultiSelectList",
			get_data: function() {
				return [
					{ "value": "Active", "description": "Status" },
					{ "value": "Cofed", "description": "Status" },
					{ "value": "Renewed", "description": "Status" },
					{ "value": "Lost", "description": "Status" }
					
				]
			},
		}



	]
};