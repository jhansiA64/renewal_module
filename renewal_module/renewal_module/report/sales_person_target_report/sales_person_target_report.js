// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Sales Person Target Report"] = {
	"filters": [
		{
			"fieldname": "company",
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
				{ "value": "custom", "label": __("Custom") },
			],
			default: "this month",
			reqd: 1
		},
		{
			fieldname: "fiscal_year",
			label: __("Fiscal Year"),
			fieldtype: "Link",
			options: "Fiscal Year",
			default: erpnext.utils.get_fiscal_year(frappe.datetime.get_today()),
			"depends_on": "eval:doc.timespan == 'custom'",
		},
		
		{
			"fieldname":"from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			default: frappe.defaults.get_user_default("year_start_date"),
			"depends_on": "eval:doc.timespan == 'custom' ",
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
			"fieldname": "sales_person",
			"label": __("Sales Person"),
			"fieldtype": "Link",
			"options": "Sales Person"
		},
		{
			"fieldname": "group_by",
			"label": __("Group By"),
			"fieldtype": "Select",
			"options": "Sales Person",
			"default": "Sales Person"
		},
		// {
		// 	"fieldname": "item_group",
		// 	"label": __("Item Group"),
		// 	"fieldtype": "Link",
		// 	"options": "Item Group"
		// },
		// {
		// 	"fieldname": "sales_person",
		// 	"label": __("Sales Person"),
		// 	"fieldtype": "Link",
		// 	"options": "Sales Person"
		// },
		

	],
	"tree": true,
	"name_field": "parent",
	"parent_field": "parent_renewal",
	"initial_depth": 3,
	"formatter": function(value, row, column, data, default_formatter) {
		console.log(data)
		if (column.fieldname == "sales_person"  && data && data.indent == 0) {
			column._options = "Sales Person";
		} else {
			column._options = "";
		}
		value = default_formatter(value, row, column, data);

		if (data && (data.indent == 0.0 || (row[1] && row[1].content == "Total"))) {
			value = $(`<span>${value}</span>`);
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
			if (column.fieldname.includes('bottomline_target') || column.fieldname.includes('topline_target')) {
				// $value.addClass("text-danger");
				value = $(value).css("color", "blue");
			}
			if (column.fieldname.includes('bottomline_achieved') || column.fieldname.includes('topline_achieved')) {
				// $value.addClass("text-danger");
				value = $(value).css("color", "green");
			}
			var $value = $(value).css("font-weight", "bold");
			value = $value.wrap("<p></p>").parent().html();
		}

		return value;
	},
};
