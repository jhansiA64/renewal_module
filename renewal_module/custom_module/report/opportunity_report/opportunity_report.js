// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt

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
			default: "this year",
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
			fieldname: "based_on",
			label: __("Based ON"),
			fieldtype: "Select",
			options: ["Posting Date","Expected Date"],
			default: "Posting Date",
			reqd: 1
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
		
		// {
		// 	"fieldname":"party_name",
		// 	"label": __("Party"),
		// 	"fieldtype": "MultiSelectList",
		// 	"options": "Customer",
        //                 get_data: function(txt) {
		// 		return frappe.db.get_link_options('Customer', txt);
		// 	},	 

		// },
		{
            "fieldname": "party_name",
            "label": "Partner",
            "fieldtype": "MultiSelectList",
            "options": "Customer",
            "width": 100,
            "get_data": function (txt) {
                return frappe.db.get_link_options("Customer", txt);
            },
            "change": function () {
                frappe.query_report.set_filter_value("contact_person", null);
                frappe.query_report.refresh();
            }
        },
        {
            "fieldname": "contact_person",
            "label": "Contact Person",
            "fieldtype": "MultiSelectList",
            "options": "Contact",
            "width": 100,
            "get_data": function (txt) {
                let customers = frappe.query_report.get_filter_value("party_name") || [];
                if (customers.length > 0) {
                    return frappe.db.get_link_options("Contact", txt, {
                        link_name: ["in", customers]
                    });
                }
                return frappe.db.get_link_options("Contact", txt);
            }
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
			"options": "\nInclude\nExclude",
		},

	],
	onload: function(report) {
        // Initialize hidden columns
        const savedHiddenColumns = JSON.parse(localStorage.getItem('hidden_columns')) || [];
        report.hidden_columns = savedHiddenColumns;

        // Add the "List Settings" button
        const listSettingsButton = report.page.add_inner_button('List Settings', function() {
            openListSettingsDialog(report);
        });
        styleListSettingsButton(listSettingsButton);

        // Apply column visibility settings when the report is rendered
        report.page.events.on('render', function() {
            console.log("Report render event triggered.");
            updateColumnVisibility(report);
        });
    },

    get_datatable_options: function(options) {
        const report = frappe.query_report;
        if (!report || !report.columns) {
            console.log("Report or columns not available.");
            return options;
        }

        // Filter out the columns marked as hidden
        const visible_columns = report.columns.filter(col => !report.hidden_columns.includes(col.fieldname));

        // Debugging: Log current column settings
        console.log("Visible Columns:", visible_columns);

        return Object.assign(options, {
            columns: visible_columns
        });
    }
};

function openListSettingsDialog(report) {
    let options = report.columns.map(col => ({
        label: col.label,  // Prefix with index to maintain order visually
        value: col.fieldname,
        checked: !report.hidden_columns.includes(col.fieldname)
    }));
	// console.log("Dialog Options:", options);

    let dialog = new frappe.ui.Dialog({
        title: 'List Settings',
        fields: [
            {
                label: 'Select Columns to Hide',
                fieldname: 'columns_to_hide',
                fieldtype: 'MultiCheck',
                options: options,
				columns: 1 // Ensure options are displayed in a single column to maintain order
            }
        ],
        primary_action_label: 'Apply',
        primary_action(values) {
            applyColumnSettings(report, values.columns_to_hide);
            dialog.hide();
        }
    });

    dialog.show();
	
}

function applyColumnSettings(report, columns_to_hide) {
    const all_fieldnames = report.columns.map(col => col.fieldname);
    report.hidden_columns = all_fieldnames.filter(fieldname => !columns_to_hide.includes(fieldname));

    // Debugging: Log updated hidden columns
    console.log("Updated Hidden Columns:", report.hidden_columns);

    localStorage.setItem('hidden_columns', JSON.stringify(report.hidden_columns));

    if (report.datatable) {
        report.datatable.destroy(); // Destroy the current datatable instance
        report.datatable = null; // Clear the datatable reference
    }
    
    frappe.query_report.refresh(); // Trigger a full report refresh
}

function updateColumnVisibility(report) {
    if (report && report.columns) {
        // Debugging: Log columns before updating visibility
        console.log("Columns before update:", report.columns);

        report.columns.forEach(col => {
            col.hidden = report.hidden_columns.includes(col.fieldname);
        });

        // Debugging: Log columns after updating visibility
        console.log("Columns after update:", report.columns);

        // Apply changes to the report's data table options
        frappe.query_report.get_datatable_options({
            columns: report.columns
        });
    }
}

function styleListSettingsButton(button) {
    button.css({
        'background-color': '#007bff',
        'color': 'white',
        'border': 'none',
        'border-radius': '4px',
        'padding': '6px 12px',
        'font-size': '14px',
        'font-weight': 'bold',
        'cursor': 'pointer'
    });

    button.on('mouseover', function() {
        button.css('background-color', '#092b4c');
    });

    button.on('mouseout', function() {
        button.css('background-color', '#007bff');
    });
}