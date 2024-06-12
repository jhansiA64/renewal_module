// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt

frappe.query_reports["Renewals Analytics"] = {
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
		{
			"fieldname": "status",
			"label": __("Status"),
			"fieldtype": "Select",
			"options": "\nActive\nNew Opp\nDraft\nCofed\nCompetitor Sales\nX-Renewal\nRenewed\nLost\nOut Of Business\nProduct Changed\nUpgraded",
		},
		{
			"fieldname": "based_on",
			"label": __("Based ON"),
			"fieldtype": "Select",
			"options": "Creation\nEnd Date",
			"default": "End Date"
		},
		{
			"fieldname": "group_by",
			"label": __("Group By"),
			"fieldtype": "Select",
			"options": "Renewals",
			"default": "Renewals"
		},
		{
			"fieldname": "item_group",
			"label": __("Item Group"),
			"fieldtype": "Link",
			"options": "Item Group"
		},
		{
			"fieldname": "sales_person",
			"label": __("Sales Person"),
			"fieldtype": "Link",
			"options": "Sales Person"
		},
		

	],
	"tree": true,
	"name_field": "parent",
	"parent_field": "parent_renewal",
	"initial_depth": 3,
	"formatter": function(value, row, column, data, default_formatter) {
		if (column.fieldname == "renewal_list" && column.options == "Renewal Item" && data && data.indent == 0) {
			column._options = "Renewal List";
		} else {
			column._options = "";
		}
		if (column.fieldname === "view_button" &&  data && data.indent === 1) {
			// console.log(value)			
			const button_view = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Renewals Analytics'].view_data('${value}')">View</button>`;
			value = button_view;
		}
		value = default_formatter(value, row, column, data);

		if (data && (data.indent == 0.0 || (row[1] && row[1].content == "Total"))) {
			value = $(`<span>${value}</span>`);
			var $value = $(value).css("font-weight", "bold");
			value = $value.wrap("<p></p>").parent().html();
		}

		return value;
	},
	view_data(name){
		// console.log(name)
		frappe.db.get_value("Renewal List", name,["note","start_date"])
		.then(r => {
			let values = r.message;
			// console.log(values.note)
			if (values.note){
				frappe.msgprint({
					title: __('Note'),
					indicator: 'blue',
					message: values.note
				});

			}
			else{
				frappe.msgprint("No Data Available")
			}
			
		})
		// console.log("data")
		// frappe.msgprint(data)
		
	}
};

