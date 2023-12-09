// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Sales Target - Testing"] = {
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
			else{
				if (data[column.fieldname] >= 0) {
					// $value.addClass("text-danger");
					value = $(value).css("color", "blue");
				}
			}	

				value = $value.wrap("<p></p>").parent().html();
			
	    }

		return value;
		
	},
	"open_sales_report": function(data) {
		if (!data.sales_person) return;
		// let project = $.grep(frappe.query_report.filters, function(e){ return e.df.fieldname == 'project'; });

		frappe.route_options = {
			"sales_person": data.sales_person,
			"timespan": data.timespan,
		};

		let report = "Sales Based On Timespan";

		// if (["Payable", "Receivable"].includes(data.account_type)) {
		// 	report = data.account_type == "Payable" ? "Accounts Payable" : "Accounts Receivable";
		// 	frappe.route_options["party_account"] = data.account;
		// 	frappe.route_options["report_date"] = data.year_end_date;
		// }

		frappe.set_route("query-report", report);
	},
	
	onload: function(report) {
		// dropdown for links to other financial statements
		// filters = get_filters_1()
		

		let fiscal_year = erpnext.utils.get_fiscal_year(frappe.datetime.get_today());

		// frappe.model.with_doc("Fiscal Year", fiscal_year, function(r) {
		// 	var fy = frappe.model.get_doc("Fiscal Year", fiscal_year);
		// 	frappe.query_report.set_filter_value({
		// 		period_start_date: fy.year_start_date,
		// 		period_end_date: fy.year_end_date
		// 	});
		// });

		const views_menu = report.page.add_custom_button_group(__('Sales Target - Testing'));

		report.page.add_custom_menu_item(views_menu, __("Sales Target - Testing"), function() {
			var filters = report.get_values();
			frappe.set_route('query-report', 'Sales Target - Testing', {company: filters.company});
		});

		
	},

	// function:get_filters_1() {
	// 	let filters = [
	// 		{
	// 			"fieldname":"company",
	// 			"label": __("Company"),
	// 			"fieldtype": "Link",
	// 			"options": "Company",
	// 			"default": frappe.defaults.get_user_default("Company"),
	// 			"reqd": 1
	// 		},
			
	// 		{
	// 			fieldname: "timespan",
	// 			label: __("Timespan"),
	// 			fieldtype: "Select",
	// 			options: [
	// 				{ "value": "last 6 months", "label": __("Last 6 Months") },
	// 				{ "value": "last quarter", "label": __("Last Quarter") },
	// 				{ "value": "last month", "label": __("Last Month") },
	// 				{ "value": "last week", "label": __("Last Week") },
	// 				{ "value": "this week", "label": __("This Week") },
	// 				{ "value": "this month", "label": __("This Month") },
	// 				{ "value": "this quarter", "label": __("This Quarter") },
	// 				{ "value": "this year", "label": __("This Year") },
	// 				{ "value": "next week", "label": __("Next Week") },
	// 				{ "value": "next month", "label": __("Next Month") },
	// 				{ "value": "next quarter", "label": __("Next Quarter") },
	// 				{ "value": "next 6 months", "label": __("Next 6 Months") },
	// 			],
	// 			default: "this month",
	// 			reqd: 1
	// 		},
	// 		{
	// 			fieldname: "fiscal_year",
	// 			label: __("Fiscal Year"),
	// 			fieldtype: "Link",
	// 			options: "Fiscal Year",
	// 			"default":"2023-2024"
						
	// 		},
	// 		{
	// 			"fieldname":"sales_person",
	// 			"label": __("Sales Person"),
	// 			"fieldtype": "MultiSelectList",
	// 			   "options": "Sales Person",
	// 						get_data: function(txt) {
	// 							// if(frappe.user_info().fullname === "Administrator"){
	// 							// 	pass
	// 							// }
	// 							// else{
	// 							// 	txt = frappe.user_info().fullname
	// 							// }
	// 				return frappe.db.get_link_options('Sales Person', txt);
	// 			},
				
	// 		},
	// 		// Note:
	// 		// If you are modifying this array such that the presentation_currency object
	// 		// is no longer the last object, please make adjustments in cash_flow.js
	// 		// accordingly.
			
	// 	]
	
	// 	return filters;
	// },


};
