// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Sales Person Opportunity Status"] = {
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
		{
			"fieldname":"forecast",
			"label": __("Forecast"),
			"fieldtype": "Select",
			"options": "\nInclude\nExclude"
		},

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


