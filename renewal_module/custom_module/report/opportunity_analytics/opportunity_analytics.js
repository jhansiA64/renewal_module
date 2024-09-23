// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt

frappe.query_reports["Opportunity Analytics"] = {
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
			"mandatory_depends_on": "eval:doc.timespan == 'custom'",
		},
		{
			"fieldname":"to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.defaults.get_user_default("year_end_date"),
			"depends_on": "eval:doc.timespan == 'custom'",
			"mandatory_depends_on": "eval:doc.timespan == 'custom'",
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

		if (data && (data.indent == 0.0 || (row[1] && row[1].content == "Total"))) {
			value = $(`<span>${value}</span>`);
			var $value = $(value).css("font-weight", "bold");
			value = $value.wrap("<p></p>").parent().html();
		}

		return value;
	},
	onload: function(report) {
        // Load hidden columns from local storage or initialize if not set
        const savedHiddenColumns = JSON.parse(localStorage.getItem('hidden_columns')) || [];
        report.hidden_columns = savedHiddenColumns;

        // // Add the "List Settings" button
        // report.page.add_inner_button('List Settings', function() {
        //     open_list_settings_dialog(report);
        // });

		// Add the "List Settings" button
		const listSettingsButton = report.page.add_inner_button('List Settings', function() {
			open_list_settings_dialog(report);
		});
	
		// Apply inline styles to the button
		listSettingsButton.css({
			'background-color': '#007bff', // Blue color, adjust as needed
			'color': 'white',
			'border': 'none',
			'border-radius': '4px',
			'padding': '6px 12px',
			'font-size': '14px',
			'font-weight': 'bold',
			'cursor': 'pointer'
		});
	
		listSettingsButton.on('mouseover', function() {
			listSettingsButton.css('background-color', '#092b4c'); // Darker blue for hover
		});
	
		listSettingsButton.on('mouseout', function() {
			listSettingsButton.css('background-color', '#007bff'); // Original blue
		});
	

        // Hook into the report rendering to apply column visibility settings
        report.on("data-loaded", function() {
            update_column_visibility(report);
        });
    },

    get_datatable_options: function(options) {
        const report = frappe.query_report;
        if (!report || !report.columns) {
            return options;
        }
        // Filter out the columns marked as hidden
        const visible_columns = report.columns.filter(col => !report.hidden_columns.includes(col.fieldname));
        return Object.assign(options, {
            columns: visible_columns
        });
    }
};


// Function to get alphabetic index
function getAlphabetIndex(index) {
    let result = '';
    while (index >= 0) {
        result = String.fromCharCode((index % 26) + 65) + result;
        index = Math.floor(index / 26) - 1;
    }
    return result;
}

function open_list_settings_dialog(report) {
    // Create options for the dialog
    let options = report.columns.map(col => ({
        label: col.label,
        value: col.fieldname,
        checked: !report.hidden_columns.includes(col.fieldname) // Check if the column is currently visible
    }));

    // Create and show the settings dialog
    let dialog = new frappe.ui.Dialog({
        title: 'List Settings',
        fields: [
            {
                label: 'Select Columns to Hide',
                fieldname: 'columns_to_hide',
                fieldtype: 'MultiCheck',
                options: options
            }
        ],
        primary_action_label: 'Apply',
        primary_action(values) {
            apply_column_settings(report, values.columns_to_hide);
            dialog.hide();
        }
    });

    dialog.show();
}

function apply_column_settings(report, columns_to_hide) {
    // Update hidden columns based on user selection
    const all_fieldnames = report.columns.map(col => col.fieldname);
    report.hidden_columns = all_fieldnames.filter(fieldname => !columns_to_hide.includes(fieldname));

    // Save hidden columns to local storage
    localStorage.setItem('hidden_columns', JSON.stringify(report.hidden_columns));

    // Refresh the report to apply the new settings
    report.refresh();
}

function update_column_visibility(report) {
    // Update the columns based on the hidden_columns state
    if (report && report.columns) {
        report.columns.forEach(col => {
            col.hidden = report.hidden_columns.includes(col.fieldname);
        });
    }
}
