// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Renewal Report Status"] = {
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
			"fieldname":"from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_days(frappe.datetime.get_today(), -7),
			"reqd": 1
		},
		{
			"fieldname":"to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
				
		{
			"fieldname":"renewal_id",
			"label": __("Renewal ID"),
			"fieldtype": "Link",
			"options": "Renewal List"
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
					{ "value": "Renewed", "description": "Status" }
					
				]
			},
		}



	]
};
