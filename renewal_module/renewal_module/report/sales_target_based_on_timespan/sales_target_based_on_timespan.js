// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Sales Target Based On Timespan"] = {
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
			fieldname: "doctype",
			label: __("Document Type"),
			fieldtype: "Select",
			options: "Sales Order",
			default: "Sales Order"
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
							// 	txt = frappe.user_info().fullname
							// }
				return frappe.db.get_link_options('Sales Person', txt);
			},
			
		},

	],
      "formatter": function(value, row, column, data, default_formatter) {
		if (data && column.fieldname=="sales_person") {
			value = data.sales_person || value;

			if (data.sales_person) {
				column.link_onclick =
					"open_sales_report(" + JSON.stringify(data.sales_person) + ")";
			}
			column.is_tree = true;
		}

		value = default_formatter(value, row, column, data);

		if (data) {
			value = $(`<span>${value}</span>`);

			var $value = $(value).css("font-weight", "bold");
			if (column.fieldname.includes('shortfall')) {
				if (data[column.fieldname] < 0) {
					// $value.addClass("text-danger");
					value = $(value).css("color", "red");
				}
				if (data[column.fieldname] > 0) {
					// $value.addClass("text-danger");
					value = $(value).css("color", "green");
				}
			}

				value = $value.wrap("<p></p>").parent().html();
			
	    }

		return value;
		
	}
};
