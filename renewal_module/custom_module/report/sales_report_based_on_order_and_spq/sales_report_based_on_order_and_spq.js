// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Sales Report Based On Order and SPQ"] = {
	"filters": [
		// {
		// 	"fieldname":"company",
		// 	"label": __("Company"),
		// 	"fieldtype": "Link",
		// 	"options": "Company",
		// 	"default": frappe.defaults.get_user_default("Company"),
		// 	"reqd": 1
		// },
		{
			"fieldname":"company",
			"label": __("Company"),
			"fieldtype": "MultiSelectList",
			"options": "Company",
			get_data: function(txt) {
				return frappe.db.get_link_options('Company', txt);
			},	
			
			
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
			"fieldname": "sales_order",
			"label": __("Sales Order"),
			"fieldtype": "Link",
			"options": "Sales Order"
		},
		{
			"fieldname": "group_by",
			"label": __("Group By"),
			"fieldtype": "Select",
			"options": "Order\nSales Person\nCustomer\nBrand",
			"default": "Order"
		},
		{
			"fieldname": "value",
			"label": __("Value"),
			"fieldtype": "Select",
			"options": "\nZero Values\nNon-Zero Values",
			"default": ""
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
			"fieldname":"customer",
			"label": __("Customer"),
			"fieldtype": "MultiSelectList",
			"options": "Customer",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Customer', txt);
			},	 

		},
		{
			"fieldname":"supplier",
			"label": __("Supplier"),
			"fieldtype": "MultiSelectList",
			"options": "Supplier",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Supplier', txt);
			},	 

		},
		{
			"fieldname":"sales_person",
			"label": __("Sales Person"),
			"fieldtype": "MultiSelectList",
	       	"options": "Sales Person",
                        get_data: function(txt) {
							// if(frappe.user_info().fullname === "Administrator"){
							// 	pass
							// }
							// else{
							// 	let name = frappe.user_info().fullname
							// 	console.log(name)
							// 	txt = { name }

							// }
				return frappe.db.get_link_options('Sales Person', txt);
			},
			
		},
		{
			"fieldname":"user",
			"label": __("User"),
			"fieldtype": "Data",
			"read_only":1,
			"default": frappe.user_info().fullname,
			"reqd": 0
		}

	],
	"tree": true,
	"name_field": "parent",
	"parent_field": "parent_renewal",
	"initial_depth": 3,
	"formatter": function(value, row, column, data, default_formatter) {
		if (column.fieldname == "sales_order" && column.options == "Item" && data && data.indent == 0) {
			column._options = "Sales Order";
		} else {
			column._options = "";
		}
		value = default_formatter(value, row, column, data);

		if (data && (data.indent == 0.0 || (row[1] && row[1].content == "Total"))) {
			value = $(`<span>${value}</span>`);
			var $value = $(value).css("font-weight", "bold");
			value = $value.wrap("<p></p>").parent().html();
		}

		return value;
	},
};