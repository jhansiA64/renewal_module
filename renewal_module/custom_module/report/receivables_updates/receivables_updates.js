// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Receivables Updates"] = {
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
		
		
	
		{
			"fieldname":"sales_invoice",
			"label": __("Sales Invoice"),
			"fieldtype": "Link",
			"options": "Sales Invoice"
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
			"fieldname":"user",
			"label": __("User"),
			"fieldtype": "Data",
			"read_only":1,
			"default": frappe.user_info().fullname,
			"reqd": 0
		}



	],
	formatter(value, row, column, data, default_formatter) {
		// Show a button instead of the "name"
		if (column.fieldname == "name1") {
			const button_html = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Sales Person Opportunity Status'].close_todo('${value}')">Comment</button>`;
			value = button_html;
			
		}
		if (column.fieldname == "name2") {
			
			const button_view = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Sales Person Opportunity Status'].view_data('${value}')">View</button>`;
			value = button_view;
		}
		return default_formatter(value, row, column, data);
	  },
	  close_todo(name) {
		console.log(name)
		
		frappe.prompt({
			label: 'Comment',
			fieldname: 'comment',
			fieldtype: 'Data'
		}, (values) => {
			console.log(values);
			frm = frappe.db.get_doc("Opportunity",name)
			console.log(doc)
			// frappe.db.set_value("Opportunity", name, "custom_comment", values.comment).then(() => {
			// refresh this report and show alert
			// frappe.query_report.refresh();
			// })
			// doc.timeline.insert_comment("Comment",values.comment)
			frm.comments.insert_comment("Comment",values.comment)

			console.log("success")
		})

	
		// frappe.db.set_value("Opportunity", name, "status", "Closed").then(() => {
		//   // refresh this report and show alert
		//   frappe.query_report.refresh();
		//   frappe.show_alert("ToDo Closed Successfully!");
		// });
	  },


	  view_data(name){
		console.log(name)
		frappe.db.get_value("Opportunity", name, "custom_comment").then((a) => {
			console.log(a)
		})
	}
};
