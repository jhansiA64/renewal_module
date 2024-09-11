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
	},
	onload: function(report) {
        const reportName = "Sales Person Opportunity Status";
        
        // Add "List Settings" button to the report toolbar
        report.page.add_inner_button('List Settings', function() {
            open_list_settings_dialog(report, reportName);
        });

        // Initialize hidden columns from localStorage
        const savedHiddenColumns = JSON.parse(localStorage.getItem(`${reportName}_hidden_columns`)) || [];
        report.hidden_columns = savedHiddenColumns;

        // Ensure columns visibility is applied on load
        apply_column_visibility(report, savedHiddenColumns);
    }
};

// Function to open the List Settings dialog
function open_list_settings_dialog(report, reportName) {
    // Retrieve saved hidden columns from localStorage
    const savedHiddenColumns = JSON.parse(localStorage.getItem(`${reportName}_hidden_columns`)) || [];

    // Create dialog content with checkboxes for each column
    let dialog_html = '<div class="modal-body">';
    
    // Ensure the columns are listed from the table
    $('.table thead th').each(function() {
        let fieldname = $(this).data('fieldname');
        if (fieldname) {
            let isChecked = savedHiddenColumns.indexOf(fieldname) === -1;
            dialog_html += `
                <div class="form-group">
                    <input type="checkbox" id="toggle_${fieldname}" ${isChecked ? 'checked' : ''}>
                    <label for="toggle_${fieldname}">${fieldname}</label>
                </div>`;
        }
    });

    dialog_html += '</div>';

    // Open a dialog with the column visibility settings
    frappe.msgprint({
        title: __("List Settings"),
        message: dialog_html,
        buttons: [
            {
                label: __("Apply"),
                cssClass: 'btn-primary',
                click: function() {
                    let hiddenColumns = [];

                    // Collect checked/unchecked states
                    $('.modal-body input[type="checkbox"]').each(function() {
                        let fieldname = $(this).attr('id').replace('toggle_', '');
                        if (!$(this).is(':checked')) {
                            hiddenColumns.push(fieldname);
                        }
                    });

                    // Save hidden columns to localStorage
                    localStorage.setItem(`${reportName}_hidden_columns`, JSON.stringify(hiddenColumns));

                    // Apply column visibility settings
                    apply_column_visibility(report, hiddenColumns);

                    frappe.msgprint(__('Column settings applied'));
                }
            },
            {
                label: __("Close"),
                click: function() {
                    frappe.msgprint(__('List Settings closed'));
                }
            }
        ]
    });
}

// Function to apply column visibility based on hidden columns
function apply_column_visibility(report, hiddenColumns) {
    // Show or hide columns based on saved settings
    $('.table thead th').each(function() {
        let fieldname = $(this).data('fieldname');
        if (fieldname) {
            let isVisible = hiddenColumns.indexOf(fieldname) === -1;
            $(this).toggle(isVisible);
            $(`td[data-fieldname="${fieldname}"]`).toggle(isVisible);
        }
    });
}