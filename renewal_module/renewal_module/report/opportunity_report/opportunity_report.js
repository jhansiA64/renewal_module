// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Opportunity Report"] = {
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
		// {
		// 	"fieldname": "opportunity",
		// 	"label": __("Opportunity"),
		// 	"fieldtype": "Link",
		// 	"options": "Opportunity"
		// },
		{
			"fieldname": "group_by",
			"label": __("Group By"),
			"fieldtype": "Select",
			"options": "Opportunity\nSales Person\nCustomer\nBrand\nTerritory\nMonthly",
			"default": "Opportunity"
		},
		{
			"fieldname": "based_on",
			"label": __("Based ON"),
			"fieldtype": "Select",
			"options": "Creation\nExpected Date",
			"default": "Creation"
		},
		{
			"fieldname":"sales_stage",
			"label": __("Sales Stage"),
			"fieldtype": "MultiSelectList",
			"options": "Sales Stage",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Sales Stage', txt);
			},	 

		},
		{
			"fieldname":"item_code",
			"label": __("Item Code"),
			"fieldtype": "Link",
			"options": "Item"
		},
		{
			"fieldname":"forecast",
			"label": __("Forecast"),
			"fieldtype": "Select",
			"options": "\nInclude\nExclude",
		},
		{
			"fieldname":"opportunity_type",
			"label": __("Opportunity Type"),
			"fieldtype": "Select",
			"options": "\nNew\nRenewal\nAdditional",
			// get_data: function(txt) {
			// 	return frappe.db.get_options('New\nRenewal\nAdditional', txt);
			// },
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
		// {
		// 	"fieldname":"supplier",
		// 	"label": __("Supplier"),
		// 	"fieldtype": "MultiSelectList",
		// 	"options": "Supplier",
        //                 get_data: function(txt) {
		// 		return frappe.db.get_link_options('Supplier', txt);
		// 	},	 

		// },
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
		console.log("hello")
		if (column.fieldname == "opportunity" && column.options == "Item" && data && data.indent == 0) {
			column._options = "Opportunity";
		} else {
			column._options = "";
		}
		value = default_formatter(value, row, column, data);

		// if (column.fieldname == "custom_committed_date" && data && data.indent === 1) {
		// // 	let date1 = ""
		// 	let date1 = frappe.db.get_value("Opportunity", custom_committed_date, "custom_committed_date")
		// 	console.log(date1)
		// 	// if (date1 !== " "){
		// 	// 	const button_html = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Opportunity Report'].commited_date('${value}')"> date1</button>`;
		// 	// 	value = button_html;
		// 	// }
		// 	const button_html = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Opportunity Report'].commited_date('${value}')">committed</button>`;
		// 	value = button_html;
			
		// }

		if (column.fieldname == "name1" &&  data ){
			if(data.indent === 0) {
			const button_html = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Opportunity Report'].add_date('${value}')">Add Commited</button>`;
			value = button_html;
			}
					
		}

		if (data && (data.indent == 0.0 || (row[1] && row[1].content == "Total"))) {
			value = $(`<span>${value}</span>`);
			var $value = $(value).css("font-weight", "bold");
			value = $value.wrap("<p></p>").parent().html();
		}

		return value;
	},
	add_date(name) {
		console.log(name)
		
		frappe.prompt({
			label: 'Committed Date',
			fieldname: 'custom_committed_date',
			fieldtype: 'Date'
		}, (values) => {
			console.log(values);
			frm = frappe.db.get_doc("Opportunity",name)
			// console.log(frm)
			frappe.db.set_value("Opportunity", name, "custom_committed_date", values.custom_committed_date).then(() => {
			// refresh this report and show alert
			frappe.query_report.refresh();
			})
			// doc.timeline.insert_comment("Comment",values.comment)
			// frm.comments.insert_comment("Committed",values.comment)

			console.log("success")
		})

	
		// frappe.db.set_value("Opportunity", name, "status", "Closed").then(() => {
		//   // refresh this report and show alert
		//   frappe.query_report.refresh();
		//   frappe.show_alert("ToDo Closed Successfully!");
		// });
	  },
};