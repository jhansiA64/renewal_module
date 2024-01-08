// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Opportunity Report Based On Timespan"] = {
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
			],
			default: "this year",
			reqd: 1
		},
		{
			"fieldname":"item_code",
			"label": __("Item Code"),
			"fieldtype": "Link",
			"options": "Item"
		},
		{
			"fieldname":"item_group",
			"label": __("Item Group"),
			"fieldtype": "MultiSelectList",
			"options": "Item Group",
			get_data: function(txt) {
				return frappe.db.get_link_options('Item Group', txt);
			},	
			
			
		},
		{
			"fieldname":"brand",
			"label": __("Brand"),
			"fieldtype": "MultiSelectList",
			"options": "Brand",
			get_data: function(txt) {
				return frappe.db.get_link_options('Brand', txt);
			},	
			
			
		},
		{
			"fieldname":"opportunity_id",
			"label": __("Opportunity ID"),
			"fieldtype": "Link",
			"options": "Opportunity"
		},
		
		{
			"fieldname":"party_name",
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
		{
			"fieldname":"opportunity_type",
			"label": __("Opportunity Type"),
			"fieldtype": "MultiSelectList",
			get_data: function() {
				return [
					{ "value": "New", "description": "Opportunity Type" },
					{ "value": "Renewal", "description": "Opportunity Type" },
					{ "value": "Additional", "description": "Opportunity Type" }
					
				]
			}
		},
		{	"fieldname":"sales_stage",
			"label": __("Sales Stage"),
			"fieldtype": "MultiSelectList",
			"options": "Sales Stage",
			get_data: function(txt) {
				return frappe.db.get_link_options('Sales Stage', txt);
			},
			
		},

	]
};
